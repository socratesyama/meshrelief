/**
 * MeshRelief — CRDTEngine
 * =============================================================================
 * 実装計画書 v2 §6「CRDTエンジン修正（v1からの差分）」を最終仕様として実装。
 * 「修正内容」表現は本セッションの指示に従い、最初から正しい実装として組み込む。
 *
 * このファイルで実装した項目（§6.1の番号に対応）:
 *   1. verify()               — 署名検証（§6.1 #1, §6.3。1-1修正でECDSA公開鍵署名に変更。後述）
 *   2. update()                — 既存レコード更新（§6.1 #2）
 *   3. getEntriesSince()       — §6.2の修正後コードをそのまま採用（§6.1 #3）
 *   4. restoreVectorClock()    — 再起動時のVC/Lamport clock復元（§6.1 #4）
 *   5. 静的 exportKey/importKey — 鍵の永続化（§6.1 #5, §8.2と同一仕様。1-1修正で鍵ペア対応に拡張）
 *   6. compareForLWW()         — lamportClock > updatedAt > nodeId の優先順位で
 *                                 競合解決（§6.1 #6, §11.2 時計ズレ対策）
 * 加えて、CRDTの基本機能（create / mergeRemote / getVectorClock / delete(tombstone)）
 * を実装し、§9.1のプロパティテスト（収束性・冪等性・競合解決・Tombstone・
 * タイブレーク）を満たす設計にしている。
 *
 * 【1-1修正: HMAC共有鍵署名 → ECDSA公開鍵署名への切替】
 * ロードマップ1-1で指摘された根本問題: 旧実装の verify() は
 * 「entry.nodeIdが自ノードと異なる場合は検証不能なので true を返す」
 * という設計だった。これは「ノード間で鍵を共有しない」という制約下では
 * 一見自然だが、実質的には「他ノードを名乗るエントリの署名は誰でも
 * 好きなように偽造できる（検証されないので）」という穴になっていた。
 * 避難所の安否情報という性質上、悪意ある第三者が実在の避難者になりすまして
 * 「安全です」という偽の安否情報を流し込める、というのは看過できない
 * 脆弱性のため、これを1-1の「本命」対応として、共有不要かつ検証可能な
 * ECDSA（P-256）の公開鍵署名方式に切り替えた。
 *
 * 新方式の要点:
 *  - 各ノードはECDSA鍵ペア（秘密鍵・公開鍵）を1組持つ。秘密鍵は端末外に
 *    一切出さず、公開鍵は自分が作成/更新する全エントリに埋め込んで配布する
 *    （CRDTEntry.publicKey）。公開鍵自体は「秘密」ではないため、
 *    QR/WebRTC/テキストいずれの経路で流れても問題ない。
 *  - これにより、verify()は「entry.publicKeyで検証して、entry.signatureが
 *    実際にその公開鍵の持ち主（＝その秘密鍵の所有者）による署名かどうか」を
 *    自分・他ノード問わず必ず確認できるようになった（§6.3の「ノード間の
 *    鍵交換をしない」という制約を維持したまま、全エントリの署名検証が
 *    可能になった）。
 *  - 残る課題は「そのnodeIdを名乗る人物が、本当に最初にそのnodeIdを
 *    使い始めた人物と同一か（＝公開鍵の正当な持ち主か）」の担保。
 *    これは公開鍵暗号方式そのものの限界（認証局のような第三者機関が
 *    無い環境では、真に第三者が検証可能な身元証明はできない）であり、
 *    今回は TOFU（Trust On First Use）方式で軽減する:
 *    「あるnodeIdの公開鍵を初めて見た時にその組み合わせを記憶し、以後
 *    同じnodeIdで異なる公開鍵を名乗るエントリが来たら『なりすましの疑い』
 *    としてマージを拒否する」。これにより、少なくとも「一度成立した
 *    nodeId↔公開鍵の対応を後から乗っ取る（＝途中からなりすます）」攻撃は
 *    防げる（trustedKeysフィールド・verify()実装を参照）。
 *  - 「攻撃者が全く新しいnodeIdを名乗って、全く新しい鍵ペアで自己署名した
 *    偽のエントリを送り込む」こと自体はTOFUでは防げない（＝性善説の残る
 *    部分）。これは実質的に「誰でも新規ユーザーとしてアプリに参加できる」
 *    という要件（招待制ではない、避難所での自由参加を想定）と表裏一体の
 *    トレードオフであり、認証局や事前共有の招待コードなしには原理的に
 *    解決できない。この残存リスクは docs/DECISIONS.md に明記し、UI側は
 *    「同期した相手の名前・件数を必ずトースト表示する」（§7.2で既存実装）
 *    ことで、少なくとも「見知らぬ相手から想定外の大量データが来た」ことに
 *    人間が気づける形にしている。
 *
 * 設計判断メモ（後続セッション・テスト実装時に参照すること）:
 *
 *  - update()/delete() は「作成ノードでなくても、どのノードでも実行できる」
 *    設計にした。避難所スタッフが他の避難者の入力を修正できる必要がある
 *    ため（例: 物資の残数を別の人が更新する等）。実行した瞬間のノードを
 *    entry.nodeId として記録し直す（＝「直近の操作者」を追跡する値になる。
 *    §6.4「誰が作ったデータか追跡可能」は、この「直近操作者」の追跡として
 *    解釈している）。これは各ノードが自分自身の鍵でしか署名できないという
 *    §6.3の制約とも矛盾しない（常に「自分の操作」として自分の鍵で署名する
 *    だけなので、鍵の共有は一切不要）。
 *
 *  - Tombstone（削除）は特別扱いの分岐を作らず、「deleted:trueを持つ、
 *    lamportClockがより新しい通常のエントリ更新」として扱う。これにより
 *    §9.1「Tombstone: 削除されたエントリが復活しない」は、特別なロジック
 *    無しに compareForLWW() の通常のLWW比較だけで自然に成立する
 *    （古い non-deleted なコピーが後から届いても、lamportClockで負けるため
 *    tombstoneを上書きできない）。
 *
 *  - id生成に crypto.randomUUID() ではなく uuid パッケージを使用している。
 *    crypto.randomUUID() はセキュアコンテキスト（HTTPS/localhost）必須だが、
 *    計画書§4.2「戦略2: 避難所ローカル配布」ではローカルHTTP配信の可能性が
 *    示唆されており、そのような環境でもID生成自体は失敗しないようにするため。
 *    （なお crypto.subtle を使う署名自体は、Web Crypto APIの仕様上
 *    セキュアコンテキストが必須であり、これは解決できない。計画書自身も
 *    §4.2でカメラAPI/WebRTCがセキュアコンテキスト必須である旨明記して
 *    おり、非セキュアコンテキストでは同期機能全体が縮退する前提になっている）。
 * =============================================================================
 */

import { v4 as uuidv4 } from 'uuid'
import type { CRDTEntry, DataRecord, DataRecordPatch, NodeId, RecordId, RecordType, VectorClock } from '../types'

// -----------------------------------------------------------------------------
// ECDSA鍵まわりのユーティリティ（1-1修正: §8.2のHMAC鍵仕様をECDSA鍵ペアに置換）
// -----------------------------------------------------------------------------

/** 鍵生成・鍵インポート時に指定するアルゴリズム（P-256 = secp256r1）。 */
const ECDSA_KEY_PARAMS: EcKeyGenParams | EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' }
/** 署名・検証時に指定するアルゴリズム（ハッシュはSHA-256）。 */
const ECDSA_SIGN_PARAMS: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) ?? []
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)))
}

/**
 * 署名対象から除外するフィールド:
 *  - signature: 署名対象そのものなので当然除外
 *  - verified : 避難所スタッフによる「確認済み」注記（§6.4将来拡張）。
 *               データの作成者ではなく第三者が後から付与しうる注記のため、
 *               これを署名対象に含めてしまうと「確認済みにする」だけで
 *               元の作成者の署名が壊れてしまう。整合性検証の対象は
 *               あくまで「データ本体」に限定する。
 */
type SignablePayload = Omit<CRDTEntry, 'signature' | 'verified'>

/** エントリのうち署名対象部分だけを取り出す。 */
function toSignablePayload(entry: CRDTEntry): SignablePayload {
  const { signature: _signature, verified: _verified, ...rest } = entry
  return rest
}

/**
 * オブジェクトを再帰的にキーソートしてから文字列化する。
 * 通常の JSON.stringify はオブジェクトキーの列挙順（＝挿入順）に依存するため、
 * 同じ内容でもキー順序が異なると異なる文字列になり、結果として署名も変わって
 * しまう可能性がある。署名の決定性（同じ内容なら常に同じ署名になること）を
 * 保証するため、専用の安定シリアライズ関数を用意する。
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')
    return `{${body}}`
  }
  return JSON.stringify(value)
}

// -----------------------------------------------------------------------------
// LWW比較（§6.1 #6, §9.1「競合解決」「タイブレーク」, §11.2）
// -----------------------------------------------------------------------------

/**
 * 2つのエントリ（同じidを持つ、競合する2バージョン）のうち、どちらを
 * 採用すべきかを決定する比較関数。
 *
 * 優先順位: lamportClock > updatedAt > nodeId（§6.1 #6, §11.2）。
 * 物理時計（updatedAt）よりLamport clockを優先するのは、災害時は端末の
 * 時計がズレる可能性があるため（§11.2）。Lamport clockはメッセージ交換の
 * たびに更新される論理時刻であり、物理的な時計ズレの影響を受けない。
 *
 * 同じlamportClock・同じupdatedAtの場合（極めて稀だが起こりうる）は、
 * nodeIdの文字列比較で決定的にタイブレークする。「どのノードで比較しても
 * 常に同じ勝者になる」ことが、収束性（§9.1）の前提条件となる。
 *
 * @returns 正の値なら a を採用すべき、負の値なら b を採用すべき、
 *          0 なら（実質的に）同一のエントリとみなせる。
 */
export function compareForLWW(a: CRDTEntry, b: CRDTEntry): number {
  if (a.lamportClock !== b.lamportClock) return a.lamportClock - b.lamportClock
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt
  if (a.nodeId !== b.nodeId) return a.nodeId > b.nodeId ? 1 : -1
  return 0
}

// -----------------------------------------------------------------------------
// CRDTEngine
// -----------------------------------------------------------------------------

export interface CRDTEngineInit {
  nodeId: NodeId
  nodeName: string
  /** crypto.subtle.generateKey()/importKey() で得たECDSA秘密鍵。署名生成専用。 */
  privateKey: CryptoKey
  /** 対になるECDSA公開鍵。自ノードが作成/更新する全エントリに埋め込まれる。 */
  publicKey: CryptoKey
  /**
   * publicKeyをhex文字列化したもの。エントリ作成のたびに`exportKey`を
   * 呼び直すと非同期処理が挟まり無駄なため、コンストラクタ時点で1度だけ
   * 変換したものをキャッシュとして受け取る（呼び出し側=mesh.tsが
   * `CRDTEngine.exportPublicKey(publicKey)`を1度呼んで渡す想定）。
   */
  publicKeyHex: string
  /**
   * 【1-1修正】TOFU（Trust On First Use）による nodeId↔公開鍵 の
   * ピン留めテーブルの初期値。再起動時、storage/db.ts側で永続化されていた
   * 値を復元する想定（未指定時は空＝自ノード以外はまだ何も信頼していない
   * 状態から開始する）。
   */
  trustedKeys?: Record<NodeId, string>
}

/** create/update/delete で共通して使う、署名前のエントリ下書き。 */
type EntryDraft = Omit<CRDTEntry, 'vectorClock' | 'lamportClock' | 'signature' | 'publicKey'>

export class CRDTEngine {
  readonly nodeId: NodeId
  readonly nodeName: string

  private readonly privateKey: CryptoKey
  private readonly publicKey: CryptoKey
  private readonly publicKeyHex: string
  /**
   * 【1-1修正】nodeId → 信頼している公開鍵(hex) のピン留めテーブル。
   * 「そのnodeIdの公開鍵を最初に見た時の組み合わせ」を記憶し、以後
   * 同じnodeIdで異なる公開鍵を名乗るエントリを拒否するために使う
   * （ファイル冒頭コメントのTOFU方式の説明を参照）。
   */
  private readonly trustedKeys: Map<NodeId, string>
  private readonly entries = new Map<RecordId, CRDTEntry>()
  private vectorClock: VectorClock = {}
  private lamportClock = 0

  constructor(init: CRDTEngineInit) {
    this.nodeId = init.nodeId
    this.nodeName = init.nodeName
    this.privateKey = init.privateKey
    this.publicKey = init.publicKey
    this.publicKeyHex = init.publicKeyHex
    this.trustedKeys = new Map(Object.entries(init.trustedKeys ?? {}))
    // 自分自身の nodeId↔公開鍵 の対応は、他者からの申告を待たず常に
    // 自明の信頼（TOFUの「First Use」は自分自身の初期化そのもの）として
    // 登録しておく。これが無いと、自分のエントリをmergeRemote()経由で
    // 読み込む際（restore()の全件replay等）にTOFU判定の初回登録タイミングに
    // 依存してしまい不安定になる。
    this.trustedKeys.set(this.nodeId, this.publicKeyHex)
  }

  // ---------------------------------------------------------------------
  // 基本CRUD（エントリ作成・更新・tombstone削除）
  // ---------------------------------------------------------------------

  /** 新規エントリを作成する。 */
  async create(data: DataRecord): Promise<CRDTEntry> {
    const now = Date.now()
    return this.stampAndSign({
      id: uuidv4(),
      nodeId: this.nodeId,
      nodeName: this.nodeName,
      data,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    })
  }

  /**
   * 既存エントリを更新する（§6.1 #2）。
   * data の一部フィールドのみ渡せばよく、既存の値とマージされる。
   * レコード種別（type）は更新では変更できない。
   *
   * 引数の型は `Partial<DataRecord>` ではなく `DataRecordPatch`
   * （types.ts参照）。前者だとTypeScriptの仕様上、4種別に共通する
   * フィールドしか受け付けられず実用にならないため。
   */
  async update(id: RecordId, patch: DataRecordPatch): Promise<CRDTEntry> {
    const existing = this.entries.get(id)
    if (!existing) {
      throw new Error(`CRDTEngine.update: no such entry (id=${id})`)
    }
    if (existing.deleted) {
      throw new Error(`CRDTEngine.update: entry is deleted, cannot update (id=${id})`)
    }

    const mergedData = { ...existing.data, ...patch, type: existing.data.type } as DataRecord

    return this.stampAndSign({
      id: existing.id,
      nodeId: this.nodeId,
      nodeName: this.nodeName,
      data: mergedData,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      deleted: false,
    })
  }

  /**
   * エントリを論理削除（tombstone化）する。
   * 物理削除はせず、deleted:true を持つ新しいバージョンとして記録する。
   * これにより削除も他の同期対象と同様にCRDT差分同期で伝搬する。
   */
  async delete(id: RecordId): Promise<CRDTEntry> {
    const existing = this.entries.get(id)
    if (!existing) {
      throw new Error(`CRDTEngine.delete: no such entry (id=${id})`)
    }
    if (existing.deleted) {
      // 既に削除済み。再度削除しても状態は変化しない（冪等）。
      return existing
    }

    return this.stampAndSign({
      id: existing.id,
      nodeId: this.nodeId,
      nodeName: this.nodeName,
      data: existing.data,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      deleted: true,
    })
  }

  /** ローカルの変更（create/update/delete共通）にスタンプを打ち、署名して保存する。 */
  private async stampAndSign(draft: EntryDraft): Promise<CRDTEntry> {
    this.lamportClock += 1
    this.vectorClock[this.nodeId] = (this.vectorClock[this.nodeId] ?? 0) + 1

    const withoutSignature: SignablePayload = {
      ...draft,
      lamportClock: this.lamportClock,
      vectorClock: { ...this.vectorClock },
      // 1-1修正: 自分の公開鍵を署名対象に含めて埋め込む。これにより
      // 「後から公開鍵だけ差し替える」改ざんも署名検証で検出できる
      // （公開鍵はSignablePayloadの一部としてハッシュ・署名されるため）。
      publicKey: this.publicKeyHex,
    }

    const signature = await this.sign(withoutSignature)
    const entry: CRDTEntry = { ...withoutSignature, signature }
    this.entries.set(entry.id, entry)
    return entry
  }

  // ---------------------------------------------------------------------
  // マージ（QR/WebRTC経由でリモートから受け取ったエントリの取り込み）
  // ---------------------------------------------------------------------

  /**
   * リモートのエントリをマージする。§1.3のMeshReliefEngineスケッチから
   * `this.crdt.mergeRemote(entry)` という形で呼ばれる想定のメソッド名。
   *
   * §9.1のプロパティを満たす設計:
   *  - 収束性・冪等性: 常に compareForLWW() による決定的な比較のみで
   *    勝敗を決め、マージする順序に依存しない（総順序によるjoin演算）。
   *  - 競合解決・タイブレーク: compareForLWW() を参照。
   *  - Tombstone: 特別扱いせず、通常のLWW比較に従う（ファイル冒頭コメント参照）。
   *
   * @returns ローカルの状態が実際に更新された場合は true。
   *          署名検証に失敗した場合、または相手が古い/同一だった場合は false。
   */
  async mergeRemote(entry: CRDTEntry): Promise<boolean> {
    if (!(await this.verify(entry))) {
      // 自ノードを騙った署名、またはローカルデータの破損の疑い。取り込まない。
      return false
    }

    const existing = this.entries.get(entry.id)
    let applied = false

    if (!existing) {
      this.entries.set(entry.id, entry)
      applied = true
    } else if (compareForLWW(entry, existing) > 0) {
      this.entries.set(entry.id, entry)
      applied = true
    }
    // compareForLWW <= 0 の場合、ローカルの方が新しい（または完全に同一）ため何もしない

    // 実際に採用したかどうかに関わらず、「相手がどこまで進んでいるか」の
    // 情報としてvectorClock/lamportClockは常に取り込む。
    this.mergeVectorClockComponents(entry.vectorClock)
    if (entry.lamportClock > this.lamportClock) {
      this.lamportClock = entry.lamportClock
    }

    return applied
  }

  private mergeVectorClockComponents(incoming: VectorClock): void {
    for (const [node, counter] of Object.entries(incoming)) {
      if ((this.vectorClock[node] ?? 0) < counter) {
        this.vectorClock[node] = counter
      }
    }
  }

  // ---------------------------------------------------------------------
  // 署名・検証（§6.1 #1, §6.3）
  // ---------------------------------------------------------------------

  private async sign(payload: SignablePayload): Promise<string> {
    const bytes = new TextEncoder().encode(stableStringify(payload))
    const raw = await crypto.subtle.sign(ECDSA_SIGN_PARAMS, this.privateKey, bytes)
    return bytesToHex(new Uint8Array(raw))
  }

  /**
   * ECDSA公開鍵署名を検証する（1-1修正: §6.1 #1）。
   *
   * 旧HMAC方式との決定的な違い: entry.nodeId が自ノードと異なっていても
   * 「検証不能だからスキップ」せず、entry.publicKeyを使って実際に
   * 署名を検証する。ノード間で秘密鍵を共有する必要は一切ない
   * （公開鍵はエントリ自身に同梱されているため）。
   *
   * 検証は2段階:
   *   1. 暗号学的検証: entry.signatureが、entry.publicKeyの持ち主（＝
   *      対応する秘密鍵の保持者）による、このエントリ内容への署名として
   *      正しいか。ここが破れていれば即座に false（改ざん、または
   *      publicKeyとsignatureの組み合わせが不正）。
   *   2. TOFU（Trust On First Use）検証: entry.nodeIdについて、過去に
   *      見た公開鍵と今回の公開鍵が一致するか。
   *      - 初めて見るnodeId → 今回の公開鍵をそのまま信頼して記憶する。
   *      - 既知のnodeId・同じ公開鍵 → 問題なし。
   *      - 既知のnodeId・異なる公開鍵 → 「途中からのなりすまし」の疑いが
   *        あるため拒否する（ファイル冒頭コメント参照。真に新規の
   *        nodeIdによる詐称までは防げないが、既存のnodeIdの乗っ取りは防げる）。
   */
  async verify(entry: CRDTEntry): Promise<boolean> {
    if (!entry.publicKey || !entry.signature) return false

    let signatureValid: boolean
    try {
      const publicKey = await CRDTEngine.importPublicKey(entry.publicKey)
      const bytes = new TextEncoder().encode(stableStringify(toSignablePayload(entry)))
      signatureValid = await crypto.subtle.verify(
        ECDSA_SIGN_PARAMS,
        publicKey,
        hexToBytes(entry.signature) as BufferSource,
        bytes,
      )
    } catch {
      // 公開鍵/署名の形式そのものが壊れている（hexとして不正、鍵長が違う等）
      return false
    }
    if (!signatureValid) return false

    const trustedKey = this.trustedKeys.get(entry.nodeId)
    if (!trustedKey) {
      // このnodeIdを見るのは初めて。TOFUにより今回の公開鍵を信頼する。
      this.trustedKeys.set(entry.nodeId, entry.publicKey)
      return true
    }
    return trustedKey === entry.publicKey
  }

  // ---------------------------------------------------------------------
  // 差分抽出（§6.1 #3, §6.2）
  // ---------------------------------------------------------------------

  /**
   * §6.2「修正後」のコードをそのまま採用。
   * バグの原因は、修正前実装が `this.vectorClock[entry.nodeId]`
   * （＝自ノードが把握している「相手ノードの最新カウンタ」）を見ていた点。
   * これだと同じノード由来の全エントリが一括で「新しい」と判定されてしまい、
   * 本来送る必要のない（相手が既に持っている）エントリまで送信対象になっていた。
   *
   * 修正後は `entry.vectorClock[entry.nodeId]`（＝そのエントリ自身が記録して
   * いる、作成/更新時点でのそのノードの通し番号）を使う。これにより、
   * エントリ単位で正しく「相手が知らないものだけ」を差分として抽出できる。
   */
  getEntriesSince(since: VectorClock): CRDTEntry[] {
    const result: CRDTEntry[] = []
    for (const entry of this.entries.values()) {
      const entryNodeCounter = entry.vectorClock[entry.nodeId] || 0
      const remoteCounter = since[entry.nodeId] || 0
      if (entryNodeCounter > remoteCounter) result.push(entry)
    }
    return result
  }

  // ---------------------------------------------------------------------
  // vectorClock / lamportClock の参照・復元（§6.1 #4）
  // ---------------------------------------------------------------------

  /** 自分の現在のvectorClockのコピーを返す（vectorClock QR生成に使用）。 */
  getVectorClock(): VectorClock {
    return { ...this.vectorClock }
  }

  getLamportClock(): number {
    return this.lamportClock
  }

  /**
   * 再起動時、IndexedDBの meta ストア（§8.1）から読み込んだ vectorClock /
   * lamportClock をエンジンへ復元する（§6.1 #4）。
   *
   * メソッド名は vectorClock の復元だが、lamportClock も引数に取る。
   * §8.1の meta ストアはこの2つを常にセットで永続化しており、どちらか
   * 片方だけ復元すると（特にlamportClockを0から始めてしまうと）新しく
   * 作成するエントリのlamportClockが過去のエントリより小さくなり、
   * LWW比較が壊れてしまうため、必ず両方を同時に復元する必要がある。
   *
   * これは「永続化された値をそのまま信頼して復元する」高速パスであり、
   * 全エントリを mergeRemote() で再投入し直す必要はない
   * （エントリ本体の復元は、storage/db.ts 側で読み込んだ CRDTEntry[] を
   * 個別に mergeRemote() するか、次回以降のセッションで追加する
   * バルクロード用のメソッドで行う想定）。
   */
  restoreVectorClock(vectorClock: VectorClock, lamportClock: number): void {
    this.vectorClock = { ...vectorClock }
    this.lamportClock = lamportClock
  }

  /**
   * 【1-1修正】自ノードの公開鍵(hex)を取得する。QRBundleのメタ情報や
   * デバッグ表示等、エントリ以外の文脈で公開鍵そのものが必要な場合に使う。
   */
  getPublicKeyHex(): string {
    return this.publicKeyHex
  }

  /** 自ノードの公開鍵（CryptoKey形式）を取得する。saveIdentity()等で使用。 */
  getPublicKey(): CryptoKey {
    return this.publicKey
  }

  /**
   * 【1-1修正】現在のTOFU信頼テーブル（nodeId → 信頼している公開鍵のhex）
   * のスナップショットを返す。mesh.ts が storage/db.ts への永続化に使う想定
   * （vectorClock/lamportClockと同じ「都度スナップショットを渡す」パターン）。
   */
  getTrustedKeys(): Record<NodeId, string> {
    return Object.fromEntries(this.trustedKeys)
  }

  // ---------------------------------------------------------------------
  // 参照系
  // ---------------------------------------------------------------------

  getEntry(id: RecordId): CRDTEntry | undefined {
    return this.entries.get(id)
  }

  /**
   * tombstone（deleted:true）も含めた全エントリを返す。
   * 永続化・同期（getAllEntries）用。§1.3のMeshReliefEngineスケッチで
   * `this.crdt.getAllEntries()` として参照されている名前に合わせている。
   */
  getAllEntries(): CRDTEntry[] {
    return Array.from(this.entries.values())
  }

  /**
   * UI表示用。削除済み(tombstone)は除外し、typeで絞り込む。
   * updatedAtの新しい順にソートして返す。
   */
  getEntries(type?: RecordType): CRDTEntry[] {
    const visible = Array.from(this.entries.values()).filter((e) => !e.deleted)
    const filtered = type ? visible.filter((e) => e.data.type === type) : visible
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // ---------------------------------------------------------------------
  // ECDSA鍵ペアの生成・永続化（1-1修正: §6.1 #5, §8.2のHMAC仕様を置換）
  // ---------------------------------------------------------------------

  /** ノード初回起動時、新規ECDSA鍵ペアを生成する。 */
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(ECDSA_KEY_PARAMS, true, ['sign', 'verify'])
  }

  /**
   * ECDSA公開鍵 → hex文字列。エントリへの埋め込み・meta永続化の両方で使う
   * （'raw'形式はECの公開鍵点をそのままエンコードするため往復が単純）。
   */
  static async exportPublicKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', key)
    return bytesToHex(new Uint8Array(raw))
  }

  /** hex文字列 → ECDSA公開鍵。verify()・restore()の両方で使用する。 */
  static async importPublicKey(hex: string): Promise<CryptoKey> {
    // 注記: TypeScript 5.9系 + @types/node環境では、素のUint8Arrayが
    // `Uint8Array<ArrayBufferLike>`に推論され、crypto.subtle.importKey()が
    // 要求する`BufferSource`（ArrayBuffer限定）の型と衝突することがある
    // （実行時の値は常にArrayBuffer裏付けのUint8Arrayなので安全なキャスト）。
    return crypto.subtle.importKey('raw', hexToBytes(hex) as BufferSource, ECDSA_KEY_PARAMS, true, ['verify'])
  }

  /**
   * ECDSA秘密鍵 → hex文字列（'pkcs8'形式）。meta ストアへの永続化専用。
   * 秘密鍵はネットワークに一切送出してはならない（あくまで自端末内の
   * IndexedDBに保存するだけ）。
   */
  static async exportPrivateKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('pkcs8', key)
    return bytesToHex(new Uint8Array(raw))
  }

  /** hex文字列 → ECDSA秘密鍵。再起動時、meta ストアからの復元専用。 */
  static async importPrivateKey(hex: string): Promise<CryptoKey> {
    return crypto.subtle.importKey('pkcs8', hexToBytes(hex) as BufferSource, ECDSA_KEY_PARAMS, true, ['sign'])
  }

  /**
   * 【1-1修正・テスト専用】任意のnodeId/lamportClock/updatedAt/idを持つ
   * 「他ノードから届いた体の」合成エントリを、実際に検証を通るECDSA署名
   * 付きで組み立てるためのヘルパー。CRDTEngineインスタンスを介さずに
   * 呼べる静的メソッドとして提供する（createEphemeral()と同様、本番の
   * データ操作フローからは使用しない。crdt.test.ts参照）。
   *
   * 旧HMAC方式時代のテストは「entry.nodeIdが自ノードと異なる限り検証は
   * 常にtrueになる」という実装の隙を利用して、ダミーの signature 文字列
   * だけで合成エントリを自由に作れていた。ECDSA公開鍵署名への切替により
   * その隙が塞がれた（＝1-1の目的そのもの）ため、CRDTのプロパティテスト
   * （収束性・冪等性・LWW・Tombstone・タイブレーク）が要求する「任意の
   * lamportClock/updatedAt/nodeIdの組み合わせ」を持つ合成エントリを、
   * 本物の署名付きで作れるようにする必要が生じ、追加した。
   */
  static async signEntryForTesting(
    draft: Omit<CRDTEntry, 'signature' | 'verified'>,
    privateKey: CryptoKey,
  ): Promise<CRDTEntry> {
    const bytes = new TextEncoder().encode(stableStringify(draft))
    const raw = await crypto.subtle.sign(ECDSA_SIGN_PARAMS, privateKey, bytes)
    return { ...draft, signature: bytesToHex(new Uint8Array(raw)) }
  }
}
