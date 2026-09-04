/**
 * MeshRelief — MeshReliefEngine（統合コントローラー）
 * =============================================================================
 * 実装計画書 v2 §1.3（クラス定義）・§2.1（同期フロー全体）に対応。
 * これまで実装した engine/crdt.ts / comm/qr-codec.ts / comm/qr-receiver.ts /
 * storage/db.ts を統合し、UI（Zustand store, 次回以降実装）から見た
 * 「同期・データ操作の唯一の窓口」となるクラス。
 *
 * §1.3のクラス定義に対応する公開API:
 *   generateVectorClockQR / prepareDiffBundle / generateAnimatedQR /
 *   ingestQRFrame / createRecord / updateRecord / deleteRecord / getEntries
 *
 * 【v3追加要件】
 *   1. prepareDiffBundle(remoteVcQR, scope) の scope: 'default' | 'all'
 *   2. decideRole(remoteVc): 'send' | 'receive' | 'synced'
 *   3. ステーションモード対応（startStationLoop 等）
 *
 * 設計判断メモ（後続セッションで参照すること。docs/DECISIONS.mdにも転記）:
 *
 *  - §1.3の擬似コードは `generateAnimatedQR`/`ingestQRFrame` 等が同期関数に
 *    見えるが、qr-codec.ts/qr-receiver.tsの時点で確定した通り、SHA-256計算
 *    （crypto.subtle.digest）が非同期APIのため **全てasync** にしている。
 *    `prepareDiffBundle`・`generateAnimatedQR`・`ingestQRFrame` は
 *    いずれも `Promise` を返す。
 *
 *  - §1.3の擬似コードは `this.qrCodec.ingestFrame(frame)` と書かれているが、
 *    実際にはフレーム蓄積の状態管理は comm/qr-receiver.ts の QRReceiver
 *    （ステートフルなクラス）が担う設計にした（qr-codec.ts/qr-receiver.ts
 *    実装セッションでの分割方針通り）。そのため MeshReliefEngine は
 *    `qrCodec: QRCodec` に加えて `qrReceiver: QRReceiver` も保持する
 *    （§1.3の擬似コードのprivateフィールド一覧には無いフィールド）。
 *
 *  - §1.3の擬似コードは `private storage: Storage;` を持つが、
 *    storage/db.ts はクラスではなく関数群としてエクスポートされている
 *    （`Storage` はDOMの組み込み型名と衝突もする）。そのためこのクラスは
 *    `storage` フィールドを持たず、必要な箇所で
 *    `putEntries`/`getAllEntries`/`getIdentity`/`saveIdentity` を
 *    直接importして呼び出す。
 *
 *  - ノードのアイデンティティ（nodeId/nodeName/hmacKey）はCRDTEngineが
 *    既に保持している（§6実装時にreadonly publicフィールドとして公開済み）
 *    ため、MeshReliefEngineは`this.nodeId`等を独自フィールドとして
 *    重複させず、`this.crdt.nodeId`等に委譲するgetterとして提供する。
 *
 *  - vectorClock/lamportClockの永続化は「ミューテーションのたびに
 *    saveIdentity()する」のではなく、restore()時にentries全件を
 *    mergeRemote()で再生することで副作用的に復元する設計にした
 *    （crdt.ts実装時のコメント参照）。§2.8の想定データ規模（最大200件
 *    程度）であれば全replayでも十分高速なため、書き込み頻度を減らす
 *    ことを優先した。identityフィールド（nodeRole/homeShelterId）が
 *    変化した時のみ saveIdentity() する。
 *
 *  - `createEphemeral()` は計画書に無い追加API。ストレージに一切触れずに
 *    エンジンを構築するテスト・デモ専用の経路（本番のApp初期化は必ず
 *    `create()`/`restore()` を使う）。storage/db.ts の meta ストアは
 *    単一レコード（keyPath固定値）のため、同一プロセス内で複数の
 *    「端末」をシミュレートするテストで `create()` を複数回呼ぶと
 *    アイデンティティが上書きされてしまう問題を避けるために用意した。
 *    entries の永続化（putEntries）自体は素通りするため、
 *    mesh.smoke.test.ts ではテストケースの先頭で `clearAllEntries()`
 *    している。
 *
 *  - v3要件1（scope絞り込み）の「自ノードのshelterId」は、既存の型に
 *    存在しなかったため `PersistedMeta.homeShelterId` として新規追加した
 *    （types.ts / storage/db.ts も合わせて更新済み）。
 *
 *  - v3要件2（decideRole）の「新しいエントリを多く持つ」の判定は、
 *    相手の実際のエントリ数を知る手段が無い（vectorClockしか渡されない）
 *    ため、vectorClockの差分（自分が相手に送れる件数 vs
 *    「相手のカウンタが自分を上回っている分」の合計）による近似値で
 *    比較している。同数（0件同士を除く）の場合は 'send' を優先する
 *    （自分の分から片付ける、という単純なルールにした）。
 *
 *  - v3要件3（ステーションモード）の「受信した差分は無条件・全件マージ」は、
 *    実は個人ノードでもステーションでも mergeRemote() 自体がそもそも
 *    一切フィルタしない設計（フィルタはprepareDiffBundle側=送信側でのみ
 *    発生する）なので、受信側に特別分岐は不要だった。一方、
 *    「送信側としてもフィルタしない」方が同期ハブとしての役割に合うと
 *    判断し、`nodeRole === 'station'` の場合は prepareDiffBundle の
 *    scope引数を無視して常に'all'扱いにする、という形で両方向を
 *    カバーしている。
 *
 *  - 【PeerPanel実装セッションで追加】§7.1「テキストで同期（緊急時）」を
 *    実装するには、QRを介さずバンドルを直接生成/取り込むAPIが元々
 *    無かったため、`prepareTextBundle()` / `ingestBundle()` を追加した。
 *    ingestQRFrame内のマージ処理は `applyBundle()` プライベートメソッドに
 *    切り出し、両者で共通化している。テキスト同期は相手のvectorClockを
 *    知りようがない（カメラを使わないため）ので、常に「自分の全データ」
 *    を基準に差分（＝全件）を計算する。
 * =============================================================================
 */

import { v4 as uuidv4 } from 'uuid'
import { CRDTEngine } from './crdt'
import { QRCodec } from '../comm/qr-codec'
import { QRReceiver } from '../comm/qr-receiver'
import { getAllEntries, getIdentity, putEntries, saveIdentity } from '../storage/db'
import { qrBundleSchema } from '../comm/schema'
import type {
  CRDTEntry,
  DataRecord,
  DataRecordPatch,
  NodeId,
  NodeRole,
  QRBundle,
  QRIngestResult,
  RecordId,
  RecordType,
  SyncMethod,
  SyncStatus,
  VectorClock,
} from '../types'

/** prepareDiffBundle の絞り込みスコープ（v3追加要件1）。 */
export type DiffScope = 'default' | 'all'

/** ステーションモードで1件同期が完了するたびに通知されるイベント（v3追加要件3）。 */
export interface StationSyncEvent {
  fromNodeId: NodeId
  fromNodeName: string
  /** 実際にローカル状態へ反映された（LWWで採用された）件数。 */
  mergedCount: number
  /** バンドルに含まれていた総エントリ数（mergedCount以下）。 */
  totalCount: number
}

/** ingestQRFrame() の戻り値。§1.3の `{complete, progress}` に `error`/`mergedCount` を追加している。 */
export interface IngestFrameResult {
  complete: boolean
  /** 0.0〜1.0 */
  progress: number
  /**
   * 不正なフレーム・ハッシュ不一致等が起きた場合のエラーメッセージ。
   * §1.3の擬似コードには無いフィールド。カメラでの連続スキャン中に
   * ノイズや無関係なQRを読んでも同期セッション全体を止めずに済むよう、
   * QRReceiver側のthrowをここで捕捉して返すようにした。
   */
  error?: string
  /**
   * complete:true の場合のみ設定される、実際にマージされたエントリ数。
   * §7.2「完了時の『X件同期しました』トースト」をUI側で表示するために
   * 追加した（PeerPanel実装セッション）。
   */
  mergedCount?: number
}

export class MeshReliefEngine {
  private readonly crdt: CRDTEngine
  private readonly qrCodec: QRCodec
  private readonly qrReceiver: QRReceiver
  private readonly privateKey: CryptoKey
  private readonly publicKey: CryptoKey
  private readonly publicKeyHex: string

  private _nodeRole: NodeRole
  private _homeShelterId: RecordId | null

  private stationLoopActive = false
  private onStationSyncComplete: ((event: StationSyncEvent) => void) | null = null

  private syncState: {
    lastSyncAt: number | null
    lastSyncMethod: SyncMethod | null
    lastSyncEntryCount: number
    /** pendingCount算出の基準にするvectorClockのスナップショット。 */
    lastSyncSnapshot: VectorClock | null
  } = {
    lastSyncAt: null,
    lastSyncMethod: null,
    lastSyncEntryCount: 0,
    lastSyncSnapshot: null,
  }

  /** UI（Zustand store）が構築後に代入する通知コールバック。 */
  onEntriesChange: ((entries: CRDTEntry[]) => void) | null = null
  onSyncStatusChange: ((status: SyncStatus) => void) | null = null

  private constructor(init: {
    crdt: CRDTEngine
    privateKey: CryptoKey
    publicKey: CryptoKey
    publicKeyHex: string
    nodeRole: NodeRole
    homeShelterId: RecordId | null
  }) {
    this.crdt = init.crdt
    this.qrCodec = new QRCodec()
    this.qrReceiver = new QRReceiver(this.qrCodec)
    this.privateKey = init.privateKey
    this.publicKey = init.publicKey
    this.publicKeyHex = init.publicKeyHex
    this._nodeRole = init.nodeRole
    this._homeShelterId = init.homeShelterId
  }

  // ---------------------------------------------------------------------
  // 初期化（静的ファクトリ。コンストラクタはprivate）
  // ---------------------------------------------------------------------

  private static async buildFresh(nodeName: string, nodeRole: NodeRole): Promise<MeshReliefEngine> {
    const nodeId = uuidv4()
    const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
    const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
    const crdt = new CRDTEngine({ nodeId, nodeName, privateKey, publicKey, publicKeyHex })
    return new MeshReliefEngine({ crdt, privateKey, publicKey, publicKeyHex, nodeRole, homeShelterId: null })
  }

  /** このノードの初回起動時に呼ぶ。新規アイデンティティを生成し、即座に永続化する。 */
  static async create(nodeName: string, nodeRole: NodeRole = 'personal'): Promise<MeshReliefEngine> {
    const engine = await MeshReliefEngine.buildFresh(nodeName, nodeRole)
    await engine.persistIdentity()
    return engine
  }

  /**
   * ストレージに一切触れずにエンジンを構築する（テスト・デモ専用）。
   * ファイル冒頭コメント参照。
   */
  static async createEphemeral(nodeName: string, nodeRole: NodeRole = 'personal'): Promise<MeshReliefEngine> {
    return MeshReliefEngine.buildFresh(nodeName, nodeRole)
  }

  /**
   * 2回目以降の起動時に呼ぶ。永続化されたアイデンティティ・エントリを
   * 読み込んで復元する。まだ何も保存されていなければ null を返す
   * （呼び出し側は SetupScreen を出して `create()` を呼ぶこと）。
   */
  static async restore(): Promise<MeshReliefEngine | null> {
    const identity = await getIdentity()
    if (!identity) return null

    const crdt = new CRDTEngine({
      nodeId: identity.nodeId,
      nodeName: identity.nodeName,
      privateKey: identity.privateKey,
      publicKey: identity.publicKey,
      publicKeyHex: identity.publicKeyHex,
      // 【1-1修正】TOFU信頼テーブルの初期値。自ノード分はCRDTEngine
      // コンストラクタが自動で追加するため、ここでは永続化されていた
      // 「他ノード分」の学習結果をそのまま渡せばよい。
      trustedKeys: identity.trustedKeys,
    })
    // vectorClock/lamportClockの高速リストア（crdt.ts参照）
    crdt.restoreVectorClock(identity.vectorClock, identity.lamportClock)

    // エントリ本体はmergeRemote()で再生する。§9.1の冪等性により、
    // 一度も他の状態と衝突しないこの初回リストアでは全件がそのまま採用される。
    // 【1-1修正】この再生は副作用として、entries内に記録されている
    // 他ノードのpublicKeyからtrustedKeysテーブルも自然に拡充する
    // （ファイル冒頭・db.ts設計判断メモ参照）。
    const persistedEntries = await getAllEntries()
    for (const entry of persistedEntries) {
      await crdt.mergeRemote(entry)
    }

    return new MeshReliefEngine({
      crdt,
      privateKey: identity.privateKey,
      publicKey: identity.publicKey,
      publicKeyHex: identity.publicKeyHex,
      nodeRole: identity.nodeRole,
      homeShelterId: identity.homeShelterId,
    })
  }

  private async persistIdentity(): Promise<void> {
    await saveIdentity({
      nodeId: this.crdt.nodeId,
      nodeName: this.crdt.nodeName,
      nodeRole: this._nodeRole,
      homeShelterId: this._homeShelterId,
      vectorClock: this.crdt.getVectorClock(),
      lamportClock: this.crdt.getLamportClock(),
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      publicKeyHex: this.publicKeyHex,
      trustedKeys: this.crdt.getTrustedKeys(),
    })
  }

  // ---------------------------------------------------------------------
  // アイデンティティ参照・更新
  // ---------------------------------------------------------------------

  get nodeId(): NodeId {
    return this.crdt.nodeId
  }

  get nodeName(): string {
    return this.crdt.nodeName
  }

  get nodeRole(): NodeRole {
    return this._nodeRole
  }

  get homeShelterId(): RecordId | null {
    return this._homeShelterId
  }

  /** ノードの役割を変更する（例: 設定画面から'personal'⇄'station'切替。UI未実装）。 */
  async setNodeRole(role: NodeRole): Promise<void> {
    this._nodeRole = role
    await this.persistIdentity()
  }

  /** このノードが紐づく避難所を設定する（v3要件1のデフォルトスコープ判定に使用）。 */
  async setHomeShelterId(shelterId: RecordId | null): Promise<void> {
    this._homeShelterId = shelterId
    await this.persistIdentity()
  }

  // ---------------------------------------------------------------------
  // QR差分同期（本命）— §1.3 / §2.1
  // ---------------------------------------------------------------------

  /** 受信側: 自分のvectorClockをQR用にエンコードする。 */
  generateVectorClockQR(): string {
    return this.qrCodec.encodeVectorClock(this.crdt.getVectorClock(), this.crdt.nodeId, this.crdt.nodeName)
  }

  /**
   * 送信側: 相手のvectorClock QRをデコードし、差分エントリからバンドルを作る。
   *
   * @param remoteVcQR generateVectorClockQR() で相手が生成したQRの中身
   * @param scope 'default'（省略時）: urgentは無条件で含め、それ以外は
   *              自ノードのhomeShelterIdと一致するエントリのみ含める。
   *              'all': フィルタなしで全差分を含める。
   *              nodeRole==='station' の場合はこの引数に関わらず常に
   *              'all'相当として扱う（ファイル冒頭コメント参照）。
   */
  async prepareDiffBundle(remoteVcQR: string, scope: DiffScope = 'default'): Promise<QRBundle> {
    const { vectorClock: remoteVc } = this.qrCodec.decodeVectorClock(remoteVcQR)
    const rawDiff = this.crdt.getEntriesSince(remoteVc)

    const effectiveScope: DiffScope = this._nodeRole === 'station' ? 'all' : scope
    const diff = effectiveScope === 'all' ? rawDiff : this.applyDefaultScope(rawDiff)

    const bundle = await this.qrCodec.createBundle(diff, this.crdt.nodeId, this.crdt.nodeName)
    this.recordSyncEvent('qr', diff.length, remoteVc)
    return bundle
  }

  /** v3要件1: 'default'スコープの絞り込みロジック。 */
  private applyDefaultScope(entries: CRDTEntry[]): CRDTEntry[] {
    return entries.filter((entry) => {
      if (entry.data.priority === 'urgent') return true
      if (this._homeShelterId == null) return false
      return entry.data.shelterId === this._homeShelterId
    })
  }

  /** 送信側: 差分バンドルをAnimated QR用のフレーム文字列配列に変換する。 */
  async generateAnimatedQR(bundle: QRBundle): Promise<string[]> {
    return this.qrCodec.splitIntoFrames(bundle)
  }

  /**
   * 受信側: スキャンしたQRフレーム1枚分を取り込む。全フレームが揃うと
   * 自動的にmergeRemote()・永続化・onEntriesChange通知まで行う。
   *
   * カメラでの連続スキャンを想定し、不正なフレーム（無関係なQR等）を
   * 読んでも例外を投げず `error` フィールド付きの結果を返す
   * （呼び出し側はそのままスキャンを継続してよい）。
   */
  async ingestQRFrame(frame: string): Promise<IngestFrameResult> {
    let result: QRIngestResult
    try {
      result = await this.qrReceiver.ingestFrame(frame)
    } catch (err) {
      return {
        complete: false,
        progress: this.qrReceiver.getState().progress,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    if (!result.complete || !result.bundle) {
      return { complete: false, progress: result.progress }
    }

    const { mergedCount } = await this.applyBundle(result.bundle!.entries, result.bundle!.fromNodeId, result.bundle!.fromNodeName, 'qr')
    return { complete: true, progress: 1, mergedCount }
  }

  /**
   * マージ処理本体（マージ・永続化・通知・ステーションループ通知）。
   * ingestQRFrame（QR経由）・ingestBundle（テキスト同期経由）・
   * mergeEntriesFromPeer（WebRTC経由）の共通処理。
   * §1.3の擬似コード中の `this.persistAll()` はこの中で呼ばれる。
   *
   * 【webrtc.ts実装セッションで修正】元は`QRBundle`丸ごとを受け取る
   * シグネチャだったが、WebRTC経由（QRを介さずCRDTEntry[]を直接
   * DataChannelでやり取りする経路）ではbundleId/payloadHash等の
   * QR用メタデータを持たないため、素通しするだけの偽のQRBundleを
   * 作る必要が生じてしまう。実際にこのメソッドが使うのは
   * entries/fromNodeId/fromNodeNameだけなので、その3つを直接
   * 受け取る形に変更した。
   */
  private async applyBundle(
    entries: CRDTEntry[],
    fromNodeId: NodeId,
    fromNodeName: string,
    method: SyncMethod,
  ): Promise<{ mergedCount: number }> {
    let mergedCount = 0
    for (const entry of entries) {
      // mergeRemote自体はnodeRoleに関わらず常に無条件マージ（ファイル冒頭コメント参照）
      const applied = await this.crdt.mergeRemote(entry)
      if (applied) mergedCount += 1
    }

    await this.persistAll()
    this.notifyEntriesChange()
    this.recordSyncEvent(method, mergedCount, this.crdt.getVectorClock())

    if (this.stationLoopActive && this.onStationSyncComplete) {
      this.onStationSyncComplete({
        fromNodeId,
        fromNodeName,
        mergedCount,
        totalCount: entries.length,
      })
    }

    return { mergedCount }
  }

  // ---------------------------------------------------------------------
  // テキストで同期（緊急時）— §7.1
  // ---------------------------------------------------------------------
  // 【mesh.ts追加分】PeerPanel実装セッションで発見した不足箇所。
  // QR経由の同期は「相手のvectorClock QRをスキャンして差分を絞る」前提だが、
  // テキスト同期はカメラを使わないため相手のVCを知りようがない。そのため
  // 「相手は何も持っていない」とみなし、常に自分の全データ（≒空のVCとの
  // 差分）を基準にする。チャンク分割・ハッシュ検証はコピペ転送では不要
  // なので行わない（QRBundleをそのままJSON化するだけ）。

  /**
   * テキスト同期（緊急時）の送信側: コピペ用のバンドルを作る。
   * 相手のvectorClockが分からない前提のため、常に「自分の全データ」を
   * 基準に差分（＝全件）を計算し、scopeで絞り込む。
   */
  async prepareTextBundle(scope: DiffScope = 'default'): Promise<QRBundle> {
    const rawDiff = this.crdt.getEntriesSince({})
    const effectiveScope: DiffScope = this._nodeRole === 'station' ? 'all' : scope
    const diff = effectiveScope === 'all' ? rawDiff : this.applyDefaultScope(rawDiff)

    const bundle = await this.qrCodec.createBundle(diff, this.crdt.nodeId, this.crdt.nodeName)
    this.recordSyncEvent('text', diff.length, {})
    return bundle
  }

  /**
   * テキスト同期（緊急時）の受信側: 貼り付けられたバンドルJSONをパース済みの
   * 値として受け取り、取り込む。QRのようなフレーム分割は発生しないが、
   * 「ユーザーが貼り付けたテキスト」も他ノード同様の信頼できない入力である
   * ことに変わりはないため、QR経由と同じzodスキーマでランタイム検証する
   * （1-3修正: 受信データにランタイムの型検証が一切なかった問題への対応）。
   *
   * @param rawBundle `JSON.parse(貼り付けられたテキスト)` の結果（型不明の値）。
   *                  呼び出し側（PeerPanel.tsx）で `as QRBundle` によるキャストは
   *                  行わず、ここで検証してから使う。
   * @throws スキーマ検証に失敗した場合（壊れた/不正な形式のテキスト）
   */
  async ingestBundle(rawBundle: unknown): Promise<{ mergedCount: number; totalCount: number }> {
    const validation = qrBundleSchema.safeParse(rawBundle)
    if (!validation.success) {
      throw new Error('ingestBundle: 貼り付けられたデータの形式が不正です')
    }
    const bundle = validation.data
    const { mergedCount } = await this.applyBundle(bundle.entries, bundle.fromNodeId, bundle.fromNodeName, 'text')
    return { mergedCount, totalCount: bundle.entries.length }
  }

  // ---------------------------------------------------------------------
  // WebRTC同期（高速モード）向けAPI — §3
  // ---------------------------------------------------------------------
  // 【webrtc.ts実装セッションで追加】WebRTC経路はQRを介さないため、
  // vectorClock/CRDTEntryをQR文字列にエンコードせず生のオブジェクトの
  // まま扱う。以下の3メソッドはその窓口。DataChannel上で直接
  // JSON化してやり取りする想定（comm/webrtc.ts参照）。

  /** 自分の現在のvectorClockを返す（QRを介さない経路向け）。 */
  getVectorClock(): VectorClock {
    return this.crdt.getVectorClock()
  }

  /**
   * 指定したvectorClockとの差分エントリを返す（QRを介さない経路向け）。
   * prepareDiffBundleと異なりscopeフィルタは適用しない
   * （WebRTCはQRのペイロード制約が無い「高速モード」のため、
   * 常に全件を対象にする設計。ファイル冒頭コメント参照）。
   */
  getEntriesSince(remoteVc: VectorClock): CRDTEntry[] {
    return this.crdt.getEntriesSince(remoteVc)
  }

  /**
   * 受け取ったエントリ配列をマージ・永続化・通知する（QRを介さない経路向け）。
   * @returns 実際にマージされた件数
   */
  async mergeEntriesFromPeer(entries: CRDTEntry[], fromNodeId: NodeId, fromNodeName: string): Promise<number> {
    const { mergedCount } = await this.applyBundle(entries, fromNodeId, fromNodeName, 'webrtc')
    return mergedCount
  }

  // ---------------------------------------------------------------------
  // v3要件2: 自動役割判定
  // ---------------------------------------------------------------------

  /**
   * 相手のvectorClockと自分の状態を比較し、次に取るべき行動を判定する。
   * UI側はこの結果を見て、Animated QR表示（'send'）・スキャン継続（'receive'）
   * ・完了表示（'synced'）を自動的に切り替える想定。
   *
   * 相手の実際のエントリ数は分からない（vectorClockしか渡されない）ため、
   * 「相手のvectorClockの各成分が自分を上回っている差分の合計」を
   * 「相手が自分より多く持っている量」の近似値として使っている
   * （エントリ単位の正確な件数ではなく、あくまで目安）。
   *
   * 【1-4 修正: 相打ちデッドロック対策】remoteNodeIdは、相手が自身の
   * vectorClock QRに埋め込んで渡してくる相手自身のnodeId（vectorClock QR
   * デコード結果の`nodeId`。usePeerSync側で `decideRole(remoteVc, remoteNodeId)`
   * として渡す）。
   *
   * 修正前は `iCanSend >= theyAreAhead` という「同数なら常に自分がsend」
   * という対称な判定だったため、双方が"ちょうど同じ件数だけ"新しいデータを
   * 持つケースで両者が同時に'send'と判定し、互いのAnimated QRを映し合う
   * だけで永久にどちらもスキャンしない状態（相打ちデッドロック）が起こり得た
   * （ロードマップ 1-4 参照）。
   *
   * 修正後は、iCanSend === theyAreAhead（かつどちらも0より大きい）の
   * 同数タイブレークのケースに限り、nodeIdの文字列比較という決定的な
   * 優先順位を導入する（compareForLWWのタイブレーク設計と同じ発想）。
   * どちらのノードで判定しても必ず同じ結論になるため、両者が同時に
   * 'send'（または'receive'）になることがなくなる。
   */
  decideRole(remoteVc: VectorClock, remoteNodeId?: NodeId): 'send' | 'receive' | 'synced' {
    const iCanSend = this.crdt.getEntriesSince(remoteVc).length

    const myVc = this.crdt.getVectorClock()
    let theyAreAhead = 0
    for (const [nodeId, remoteCounter] of Object.entries(remoteVc)) {
      const myCounter = myVc[nodeId] ?? 0
      if (remoteCounter > myCounter) theyAreAhead += remoteCounter - myCounter
    }

    if (iCanSend === 0 && theyAreAhead === 0) return 'synced'

    if (iCanSend === theyAreAhead) {
      // 同数タイブレーク: nodeIdが渡されていない（後方互換の呼び出し等）場合は
      // 従来通り自分から送る。渡されている場合は文字列比較で一意に決める。
      if (!remoteNodeId) return 'send'
      return this.crdt.nodeId < remoteNodeId ? 'send' : 'receive'
    }

    return iCanSend > theyAreAhead ? 'send' : 'receive'
  }

  // ---------------------------------------------------------------------
  // v3要件3: ステーションモード
  // ---------------------------------------------------------------------

  /**
   * ステーションモード用の連続受付ループを開始する。
   * カメラ制御自体はUI側（QRScanner.tsx, 次回以降実装）の責務で、
   * このメソッドは「1件同期が完了するたびに onSyncComplete を呼ぶ」
   * という状態に切り替えるだけ。QRReceiverは元々バンドルIDが変われば
   * 自動リセットされる設計（qr-receiver.ts参照）なので、UI側は
   * これまで通り ingestQRFrame() を呼び続けるだけで次の避難者の
   * QRを受け付けられる。
   */
  startStationLoop(onSyncComplete: (event: StationSyncEvent) => void): void {
    this.stationLoopActive = true
    this.onStationSyncComplete = onSyncComplete
  }

  stopStationLoop(): void {
    this.stationLoopActive = false
    this.onStationSyncComplete = null
  }

  isStationLoopActive(): boolean {
    return this.stationLoopActive
  }

  // ---------------------------------------------------------------------
  // 同期ステータス
  // ---------------------------------------------------------------------

  private recordSyncEvent(method: SyncMethod, entryCount: number, snapshot: VectorClock): void {
    this.syncState = {
      lastSyncAt: Date.now(),
      lastSyncMethod: method,
      lastSyncEntryCount: entryCount,
      lastSyncSnapshot: snapshot,
    }
    this.onSyncStatusChange?.(this.getSyncStatus())
  }

  /** PeerPanel / SyncStatus.tsx（次回以降実装）向けの現在の同期状態。 */
  getSyncStatus(): SyncStatus {
    const pendingCount = this.syncState.lastSyncSnapshot
      ? this.crdt.getEntriesSince(this.syncState.lastSyncSnapshot).length
      : this.crdt.getEntries().length

    return {
      lastSyncAt: this.syncState.lastSyncAt,
      lastSyncMethod: this.syncState.lastSyncMethod,
      lastSyncEntryCount: this.syncState.lastSyncEntryCount,
      pendingCount,
      // WebRTC接続はエンジンではなくUI層（comm/webrtc.ts, PeerPanel.tsx）が
      // セッション単位で保持する設計のため、エンジンは接続数を把握できず常に0
      peerCount: 0,
    }
  }

  // ---------------------------------------------------------------------
  // データ操作 — §1.3
  // ---------------------------------------------------------------------

  async createRecord(data: DataRecord): Promise<CRDTEntry> {
    const entry = await this.crdt.create(data)
    await putEntries([entry])
    this.notifyEntriesChange()
    return entry
  }

  async updateRecord(id: RecordId, data: DataRecordPatch): Promise<void> {
    const entry = await this.crdt.update(id, data)
    await putEntries([entry])
    this.notifyEntriesChange()
  }

  async deleteRecord(id: RecordId): Promise<void> {
    const entry = await this.crdt.delete(id)
    await putEntries([entry])
    this.notifyEntriesChange()
  }

  getEntries(type?: RecordType): CRDTEntry[] {
    return this.crdt.getEntries(type)
  }

  // ---------------------------------------------------------------------
  // 内部ヘルパー
  // ---------------------------------------------------------------------

  private notifyEntriesChange(): void {
    this.onEntriesChange?.(this.crdt.getAllEntries())
  }

  /** §1.3の擬似コード中の `this.persistAll()` に対応。全件をまとめて永続化する。 */
  private async persistAll(): Promise<void> {
    await putEntries(this.crdt.getAllEntries())
  }
}
