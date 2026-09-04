/**
 * MeshRelief — storage/db.ts（IndexedDB永続化層）
 * =============================================================================
 * 実装計画書 v2 §8「永続化仕様」に対応。
 *
 *  §8.1 IndexedDBスキーマ:
 *    DB名 `meshrelief`（version 2固定）
 *    - entries (keyPath: 'id')   index: nodeId / type(data.type) / updatedAt / shelterId(data.shelterId)
 *    - meta    (keyPath: 'key')  nodeId / nodeName / vectorClock / lamportClock / 鍵ペア（1-1参照）
 *  §8.2 CryptoKey永続化:
 *    exportKey/importKeyを「そのまま組み込む」— 独自に再実装せず、
 *    src/engine/crdt.ts の `CRDTEngine.exportPublicKey/exportPrivateKey` /
 *    `CRDTEngine.importPublicKey/importPrivateKey`（静的メソッド）を
 *    このファイルから呼び出す形で配線する。
 *
 * 【1-1修正: HMAC共有鍵 → ECDSA鍵ペアへの切替に伴う変更】
 *  meta ストアが保持する鍵情報を `hmacKeyHex`（1本）から
 *  `privateKeyHex`（秘密鍵） + `publicKeyHex`（公開鍵） の2本立てに変更した。
 *  あわせて、TOFU（Trust On First Use）による nodeId↔公開鍵 のピン留め
 *  テーブル `trustedKeys` も同じ meta レコードに保持する。
 *  更新頻度はvectorClock/lamportClockと同じ扱い（ファイル末尾の設計判断メモ
 *  参照: ミューテーションのたびに書き込むのではなく、setNodeRole/
 *  setHomeShelterId呼び出し時、および初回作成時にのみ保存し、他ノードから
 *  マージ学習したtrustedKeysの拡張分は次回restore()時のentries全件replayで
 *  副作用的に再構築される。これはvectorClock/lamportClockと全く同じ設計判断
 *  であり、一貫性のため踏襲した）。
 *
 * 【v3追加要件1: 同期ステーションモードの受け皿】
 *  meta ストアに `nodeRole: 'personal' | 'station'`（デフォルト'personal'）を追加。
 *  永続化の受け皿のみで、モード自体のUI/挙動は次回以降実装する。
 *
 * IndexedDBラッパーには package.json で導入済みの `idb` を使用する。
 *
 * 設計判断メモ（後続セッションで参照すること）:
 *
 *  - storage/db.ts が engine/crdt.ts の CRDTEngine（静的メソッドのみ）に
 *    依存する形になっている。これは docs/DECISIONS.md に前回記録した
 *    「要注意」項目（§8実装時に`CRDTEngine.exportKey(...)`への読み替えが
 *    必要）の想定通りの解消。CRDTEngine.exportPublicKey等は状態を持たない
 *    静的なユーティリティなので、CRDTEngineのインスタンス化は一切不要であり、
 *    storage層 → engine層 という依存方向自体は生じるが、実質的には
 *    「暗号ユーティリティ関数を共有している」だけで、循環依存や強い結合には
 *    ならない。
 *
 *  - getIdentity()/saveIdentity() は、呼び出し側（次回のmesh.ts）が
 *    hex文字列ではなく CryptoKey をそのまま扱えるよう、内部で
 *    CRDTEngine.exportPublicKey/exportPrivateKey/importPublicKey/
 *    importPrivateKey による変換まで行う設計にした。
 *    §8.2の「そのまま組み込む」を、"呼び出し側に変換を強いない" 形で実現している。
 *
 *  - `StoredMetaRecord`（このファイル内部の型）は、実際にIndexedDBへ
 *    書き込まれる生のレコード形を表す。nodeRole/homeShelterId/trustedKeysを
 *    **任意**フィールドとして扱っているのは、v3/1-1でこれらを追加する前に
 *    書き込まれた既存レコードにはこのフィールドが存在しない可能性があるため
 *    （IndexedDBはレコードの値の形を強制しない。ストア/インデックス構造の
 *    マイグレーションとは別に、値レベルの後方互換として getIdentity() 側で
 *    デフォルト値を適用する）。一方、types.ts の `PersistedMeta`
 *    （および `LoadedIdentity`）は「解決済みで常に全フィールドが揃っている」
 *    形として扱う。
 *
 *  - DB_VERSION=2 は固定値として指示された。upgrade()コールバックは
 *    「ストア/インデックスが存在しなければ作る」という冪等な書き方にして
 *    あるため、0→2（今回の新規作成）でも、将来的にIndexedDB上に
 *    version 1の実データが存在するケース（本アプリの前身にあたる
 *    v1実装が実際にデプロイされていた場合）でも、同じロジックで
 *    安全に完結する（「簡単なマイグレーション考慮」の意図をこのように
 *    解釈した）。1-1修正で鍵の持ち方自体が変わったため、v1実装の
 *    `hmacKeyHex`しか持たない既存レコードは `getIdentity()` が
 *    `privateKeyHex`/`publicKeyHex`欠落を検知した時点で
 *    「読み込めない（互換性なし）」として undefined を返す
 *    （呼び出し側は初回起動同様 SetupScreen へ誘導される。HMAC鍵を
 *    ECDSA鍵ペアへ機械的に変換する手段は存在しないため、これは
 *    許容する設計判断とする。docs/DECISIONS.mdに記録）。
 * =============================================================================
 */

import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { CRDTEngine } from '../engine/crdt'
import type { CRDTEntry, NodeId, NodeRole, PersistedMeta, RecordId, RecordType, VectorClock } from '../types'

const DB_NAME = 'meshrelief'
const DB_VERSION = 2
const META_KEY = 'identity'

// -----------------------------------------------------------------------------
// スキーマ定義
// -----------------------------------------------------------------------------

/**
 * meta ストアの実際の生レコード形。keyPath用の `key` を持つ。
 * nodeRole/homeShelterId/trustedKeysは任意（ファイル冒頭コメント参照:
 * 追加前の既存レコード対応。値レベルの後方互換）。
 */
interface StoredMetaRecord extends Omit<PersistedMeta, 'nodeRole' | 'homeShelterId' | 'trustedKeys'> {
  key: string
  nodeRole?: NodeRole
  homeShelterId?: RecordId | null
  trustedKeys?: Record<NodeId, string>
}

interface MeshReliefDBSchema extends DBSchema {
  entries: {
    key: RecordId
    value: CRDTEntry
    indexes: {
      nodeId: NodeId
      type: string
      updatedAt: number
      shelterId: string
    }
  }
  meta: {
    key: string
    value: StoredMetaRecord
  }
}

// -----------------------------------------------------------------------------
// 接続管理（シングルトン）
// -----------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase<MeshReliefDBSchema>> | null = null

function getDB(): Promise<IDBPDatabase<MeshReliefDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<MeshReliefDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        // §8.1: entries (keyPath: 'id') + nodeId/type/updatedAt/shelterId インデックス
        const entriesStore = db.objectStoreNames.contains('entries')
          ? transaction.objectStore('entries')
          : db.createObjectStore('entries', { keyPath: 'id' })

        if (!entriesStore.indexNames.contains('nodeId')) {
          entriesStore.createIndex('nodeId', 'nodeId')
        }
        if (!entriesStore.indexNames.contains('type')) {
          // data.type への索引（ネストしたキーパス）
          entriesStore.createIndex('type', 'data.type')
        }
        if (!entriesStore.indexNames.contains('updatedAt')) {
          entriesStore.createIndex('updatedAt', 'updatedAt')
        }
        if (!entriesStore.indexNames.contains('shelterId')) {
          // data.shelterId は任意フィールドだが、IndexedDBのインデックスは
          // 値が存在しないレコードを単に対象外にするだけなので問題ない
          entriesStore.createIndex('shelterId', 'data.shelterId')
        }

        // §8.1: meta (keyPath: 'key')
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

// -----------------------------------------------------------------------------
// entries ストア — CRDTEngineから呼ばれる永続化API
// -----------------------------------------------------------------------------

/**
 * エントリをまとめて upsert する。CRDTEngineで create/update/delete/mergeRemote
 * した結果を、呼び出し側（mesh.ts）がこの関数でまとめて永続化する想定。
 * 空配列を渡した場合は何もしない（無駄なトランザクションを開始しない）。
 */
export async function putEntries(entries: CRDTEntry[]): Promise<void> {
  if (entries.length === 0) return
  const db = await getDB()
  const tx = db.transaction('entries', 'readwrite')
  await Promise.all(entries.map((entry) => tx.store.put(entry)))
  await tx.done
}

/** 起動時の全件読み込み用。tombstone（deleted:true）も含めて全て返す。 */
export async function getAllEntries(): Promise<CRDTEntry[]> {
  const db = await getDB()
  return db.getAll('entries')
}

/** 単一エントリの取得。 */
export async function getEntry(id: RecordId): Promise<CRDTEntry | undefined> {
  const db = await getDB()
  return db.get('entries', id)
}

/** `type` インデックスを使った絞り込み取得（各Panelでの遅延読み込み等に使用）。 */
export async function getEntriesByType(type: RecordType): Promise<CRDTEntry[]> {
  const db = await getDB()
  return db.getAllFromIndex('entries', 'type', type)
}

/** `shelterId` インデックスを使った絞り込み取得（§11.1 避難所単位フィルタ用）。 */
export async function getEntriesByShelterId(shelterId: RecordId): Promise<CRDTEntry[]> {
  const db = await getDB()
  return db.getAllFromIndex('entries', 'shelterId', shelterId)
}

/**
 * entries ストアを全消去する。計画書に明記はないが、デモモード（§7.3）の
 * 「最初からやり直す」操作等での利用を想定した補助関数として追加した。
 * 通常のデータ削除はtombstone方式（CRDTEngine.delete）を使うこと。
 */
export async function clearAllEntries(): Promise<void> {
  const db = await getDB()
  await db.clear('entries')
}

// -----------------------------------------------------------------------------
// meta ストア — ノードの永続アイデンティティ（§8.1, §8.2, v3: nodeRole）
// -----------------------------------------------------------------------------

/**
 * getIdentity()/saveIdentity() が扱う「解決済み」の形。
 * privateKeyHex/publicKeyHex ではなく、すぐ使える CryptoKey を直接持つ点が
 * types.ts の PersistedMeta との違い（storage/db.ts が §8.2 の
 * export/import を内部で行うため、呼び出し側は変換を意識しなくてよい）。
 * 【1-1修正】publicKeyHexだけは「CryptoKeyへ変換済みのpublicKeyと、
 * hex文字列そのもの」の両方を持つ。CRDTEngineInit.publicKeyHexが
 * まさにこの「exportKeyし直さないためのキャッシュ」を要求するため。
 */
export interface LoadedIdentity {
  nodeId: NodeId
  nodeName: string
  nodeRole: NodeRole
  homeShelterId: RecordId | null
  vectorClock: VectorClock
  lamportClock: number
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicKeyHex: string
  trustedKeys: Record<NodeId, string>
}

/**
 * ノードのアイデンティティを読み込む。まだ一度も保存されていない場合
 * （＝このノードの初回起動時）は undefined を返す。
 * nodeRoleが未設定の既存レコード（v3追加前）は 'personal' として扱う。
 *
 * 【1-1修正】旧HMAC方式時代の `hmacKeyHex` しか持たないレコード（＝
 * `privateKeyHex`/`publicKeyHex`が無い）は、鍵方式そのものが非互換の
 * ため機械的な変換ができない。ファイル冒頭コメントの設計判断メモの通り、
 * この場合は undefined を返し、呼び出し側に初回起動と同じ扱い
 * （SetupScreenでの再作成）をさせる。
 */
export async function getIdentity(): Promise<LoadedIdentity | undefined> {
  const db = await getDB()
  const raw = await db.get('meta', META_KEY)
  if (!raw) return undefined
  if (!raw.privateKeyHex || !raw.publicKeyHex) return undefined

  const [privateKey, publicKey] = await Promise.all([
    CRDTEngine.importPrivateKey(raw.privateKeyHex),
    CRDTEngine.importPublicKey(raw.publicKeyHex),
  ])

  return {
    nodeId: raw.nodeId,
    nodeName: raw.nodeName,
    nodeRole: raw.nodeRole ?? 'personal',
    homeShelterId: raw.homeShelterId ?? null,
    vectorClock: raw.vectorClock,
    lamportClock: raw.lamportClock,
    privateKey,
    publicKey,
    publicKeyHex: raw.publicKeyHex,
    trustedKeys: raw.trustedKeys ?? {},
  }
}

/**
 * ノードのアイデンティティを保存する（新規作成・更新どちらも）。
 * vectorClock/lamportClock/trustedKeysが変化するたびに呼び出す想定
 * （CRDTEngine.getVectorClock()/getLamportClock()/getTrustedKeys()の
 * 値を都度渡す）。
 */
export async function saveIdentity(identity: LoadedIdentity): Promise<void> {
  const privateKeyHex = await CRDTEngine.exportPrivateKey(identity.privateKey)
  const db = await getDB()

  const record: StoredMetaRecord = {
    key: META_KEY,
    nodeId: identity.nodeId,
    nodeName: identity.nodeName,
    nodeRole: identity.nodeRole,
    homeShelterId: identity.homeShelterId,
    vectorClock: identity.vectorClock,
    lamportClock: identity.lamportClock,
    privateKeyHex,
    publicKeyHex: identity.publicKeyHex,
    trustedKeys: identity.trustedKeys,
  }

  await db.put('meta', record)
}
