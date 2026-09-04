/**
 * MeshRelief — WebRTC同期（高速モード）
 * =============================================================================
 * 実装計画書 v2 §3「WebRTC同期（オプション仕様）」に対応。
 *
 *  §3.1 位置づけ: 「同一Wi-Fi環境がある場合の高速化オプション」。QR同期が
 *       基本であり、これはあくまで追加のオプション。
 *  §3.3 接続フロー（QRシグナリング）:
 *       1. 端末A: createOffer() → SDP OfferをQR表示
 *       2. 端末B: QRスキャン → createAnswer() → SDP AnswerをQR表示
 *       3. 端末A: QRスキャン → acceptAnswer() → DataChannel接続確立
 *       4. hello → sync-request → sync-response → ack（自動同期）
 *  §3.4 実装上の注意:
 *       - iceServers: []（STUN/TURN不使用）
 *       - iOS Safariでの動作は保証しない
 *       - 接続に失敗した場合はQR同期にフォールバック
 *
 * 設計判断メモ:
 *
 *  - SDP（Offer/Answer）はQRコードで運ぶ必要があるが、サイズが
 *    MAX_QR_PAYLOAD（1800文字。qr-codec.ts参照）を超える可能性がある
 *    （iceServers:[]によりhost候補のみでサーバー由来候補は無いため
 *    比較的小さくなる見込みだが、確実に1枚に収まる保証は無い）。
 *    そのため、データ同期用のQRBundle形式（"MR2|..."）とは別の、
 *    シグネチャの異なる独自プロトコル（"MRTC|..."）で、qr-codec.tsが
 *    export済みの sha256Hex/base64urlEncode/base64urlDecode を再利用して
 *    チャンク分割・ハッシュ検証を行う。プロトコルタグを分けているのは、
 *    データ同期用のQRスキャンフロー（usePeerSync.ts）が誤ってこちらを
 *    データフレームとして解釈しないようにするため。
 *
 *  - シグナリングQRの表示・スキャン自体は、既存の `AnimatedQR.tsx` /
 *    `QRScanner.tsx` をそのまま再利用できる（どちらも「フレーム文字列の
 *    配列を渡す/onFrameで文字列を受け取る」だけの汎用コンポーネントの
 *    ため）。新しいUIコンポーネントの追加は不要で、PeerPanel.tsx側の
 *    配線だけで済む。
 *
 *  - データ同期フェーズ（hello以降）はDataChannel経由でJSON文字列を
 *    やり取りするだけなので、QRのようなチャンク分割は不要
 *    （DataChannelにQRほど厳しいペイロード制約は無く、§2.8の想定
 *    データ規模（最大200件程度）なら1メッセージで十分収まる）。
 *    メッセージ型は既存の `SyncMessage`/`SyncMessageType`（types.ts,
 *    session1で先行定義済み）をそのまま使う。
 *
 *  - WebRTC接続（RTCPeerConnection/RTCDataChannel）は
 *    `MeshReliefEngine`には保持させず、この`WebRTCMesh`クラスが
 *    `MeshReliefEngine`への参照を持つ形にした（逆ではない）。
 *    高速モードはPeerPanel.tsxでのユーザー操作に応じて開始・終了する
 *    セッションスコープの機能であり、エンジンが恒久的に保持するような
 *    ものではないと判断したため（mesh.ts側の`WebRTCMesh`プレースホルダー
 *    は削除した。DECISIONS.md参照）。
 *
 *  - 「接続失敗時はQR同期にフォールバック」は、既にQRによる自動同期
 *    （usePeerSync.ts）が常時バックグラウンドで動いているという前提の
 *    上に成り立っている。そのためWebRTC側の failure/fallback は
 *    「高速モードのUIを閉じてエラーを表示するだけ」でよい
 *    （＝QR同期の方はPeerPanelを開いている間ずっと動き続けているので、
 *    改めて何かを開始する必要が無い）。
 *
 *  - iOS Safariを事前にUser-Agent判定でブロックすることはしていない
 *    （§3.4は「保証しない」であって「使えない」ではなく、実際に動く
 *    場合もあるため）。代わりに、接続タイムアウトやICE失敗など
 *    汎用的な失敗経路のエラーメッセージの中で、iOS Safariでは特に
 *    起きやすい旨を案内する形にした。
 * =============================================================================
 */

import { base64urlDecode, base64urlEncode, shortHash } from './qr-codec'
import { syncMessageSchema } from './schema'
import type { MeshReliefEngine } from '../engine/mesh'
import type { SyncMessage } from '../types'

// -----------------------------------------------------------------------------
// シグナリングQR（Offer/Answer専用の独自プロトコル）
// -----------------------------------------------------------------------------

const SIGNALING_PROTOCOL = 'MRTC'
const SIGNALING_MAX_PAYLOAD = 1800 // qr-codec.tsのMAX_QR_PAYLOADと揃える
const FIELD_DELIMITER = '|'

export type SignalingRole = 'offer' | 'answer'

interface SignalingFrame {
  role: SignalingRole
  index: number
  total: number
  hash: string
  chunk: string
}

function encodeSignalingFrame(frame: SignalingFrame): string {
  return [
    SIGNALING_PROTOCOL,
    frame.role,
    String(frame.index),
    String(frame.total),
    frame.hash,
    base64urlEncode(frame.chunk),
  ].join(FIELD_DELIMITER)
}

function decodeSignalingFrame(text: string): SignalingFrame {
  // 注記: ここで投げるErrorのmessageは表示用の日本語文ではなく、
  // 翻訳辞書のキー文字列にしている（i18n対応セッションでの変更）。
  // 呼び出し元（PeerPanel.tsx）がこのキーを引いて表示言語に翻訳する。
  // 万一未知のキーだった場合は、そのままフォールバック表示される。
  const parts = text.split(FIELD_DELIMITER)
  if (parts.length !== 6 || parts[0] !== SIGNALING_PROTOCOL) {
    throw new Error('invalidSignalingFormat')
  }
  const [, roleStr, indexStr, totalStr, hash, encodedChunk] = parts
  if (roleStr !== 'offer' && roleStr !== 'answer') {
    throw new Error('invalidSignalingRole')
  }
  const index = Number(indexStr)
  const total = Number(totalStr)
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total <= 0 || index >= total) {
    throw new Error('invalidSignalingFrameNumber')
  }
  let chunk: string
  try {
    chunk = base64urlDecode(encodedChunk)
  } catch {
    throw new Error('signalingChunkDecodeFailed')
  }
  return { role: roleStr, index, total, hash, chunk }
}

/**
 * スキャンしたQRテキストがシグナリングQR（offer/answer）かどうか、
 * またどちらの役割かを判定する。データ同期用のQR（"MR2|..."）とは
 * プロトコルタグが異なるため、既存のQRScanner/usePeerSyncの経路と
 * 混同することなく判別できる。
 */
export function detectSignalingKind(text: string): SignalingRole | 'unknown' {
  const parts = text.split(FIELD_DELIMITER)
  if (parts[0] !== SIGNALING_PROTOCOL) return 'unknown'
  if (parts[1] === 'offer' || parts[1] === 'answer') return parts[1]
  return 'unknown'
}

async function encodeSignalingFrames(
  role: SignalingRole,
  sdp: string,
  maxPayload: number = SIGNALING_MAX_PAYLOAD,
): Promise<string[]> {
  const total = Math.max(1, Math.ceil(sdp.length / maxPayload))
  const hash = await shortHash(sdp)
  const frames: string[] = []
  for (let i = 0; i < total; i += 1) {
    const chunk = sdp.slice(i * maxPayload, (i + 1) * maxPayload)
    frames.push(encodeSignalingFrame({ role, index: i, total, hash, chunk }))
  }
  return frames
}

export interface SignalingIngestResult {
  complete: boolean
  /** 0.0〜1.0 */
  progress: number
  sdp?: string
  role?: SignalingRole
}

/**
 * シグナリングQR（Offer/Answer）の受信側。comm/qr-receiver.tsのQRReceiverと
 * 同じ「フレーム蓄積→別セッション検知でリセット→完成時にハッシュ検証」
 * という設計方針を踏襲しているが、QRBundleを扱うQRReceiverとは対象が
 * 異なる（SDP文字列のみ）ため、独立した小さなクラスとして実装した。
 */
export class SignalingReceiver {
  private readonly frames = new Map<number, string>()
  private role: SignalingRole | null = null
  private total = 0
  private expectedHash: string | null = null

  async ingestFrame(frameText: string): Promise<SignalingIngestResult> {
    const parsed = decodeSignalingFrame(frameText)

    if (this.role !== parsed.role || this.expectedHash !== parsed.hash) {
      // role または hash が変わった＝別のシグナリング試行とみなしてリセット
      this.frames.clear()
      this.role = parsed.role
      this.total = parsed.total
      this.expectedHash = parsed.hash
    }

    this.frames.set(parsed.index, parsed.chunk)
    const progress = this.total > 0 ? this.frames.size / this.total : 0

    if (this.frames.size < this.total) {
      return { complete: false, progress }
    }

    const parts: string[] = []
    for (let i = 0; i < this.total; i += 1) {
      const chunk = this.frames.get(i)
      if (chunk === undefined) {
        throw new Error('signalingMissingFrame')
      }
      parts.push(chunk)
    }
    const sdp = parts.join('')

    const actualHash = await shortHash(sdp)
    if (actualHash !== this.expectedHash) {
      throw new Error('signalingHashMismatch')
    }

    return { complete: true, progress: 1, sdp, role: this.role ?? undefined }
  }

  reset(): void {
    this.frames.clear()
    this.role = null
    this.total = 0
    this.expectedHash = null
  }
}

// -----------------------------------------------------------------------------
// 内部ユーティリティ
// -----------------------------------------------------------------------------

/** このブラウザでWebRTC（RTCPeerConnection）が利用可能か。UI側で事前に判定し、非対応なら「高速モード」自体を出さない用途を想定。 */
export function isWebRTCSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined'
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * ICE候補の収集完了を待つ。§3.4の通りiceServers:[]（STUN/TURN不使用）
 * のためhost候補のみで、通常は高速に完了するはずだが、万一完了しない
 * 場合に備えタイムアウト後は「その時点で集まった候補」で先に進む
 * （QRによる非trickle ICE交換のため、事前に全候補を確定させておく
 * 必要がある。逐次candidateを追加QRで送るのは非現実的なため）。
 */
function waitForIceGatheringComplete(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }, timeoutMs)
    function onChange() {
      if (pc.iceGatheringState === 'complete') {
        window.clearTimeout(timer)
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

// -----------------------------------------------------------------------------
// WebRTCMesh
// -----------------------------------------------------------------------------

const RTC_CONFIG: RTCConfiguration = { iceServers: [] } // §3.4: STUN/TURN不使用
const DATA_CHANNEL_LABEL = 'meshrelief-sync'
const ICE_GATHERING_TIMEOUT_MS = 3000
const CONNECTION_TIMEOUT_MS = 15000

export type WebRTCConnectionState =
  | 'idle'
  | 'gathering'
  | 'awaiting-answer'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'closed'

export interface WebRTCMeshCallbacks {
  onStateChange?: (state: WebRTCConnectionState) => void
  /**
   * 接続に失敗した場合に呼ばれる（§3.4「接続に失敗した場合はQR同期に
   * フォールバック」）。UI側はこれを受けて高速モードのUIを閉じ、
   * 常時動作しているQR同期（usePeerSync）の利用を案内すればよい。
   *
   * 注記（i18n対応セッション）: `reason`は表示用の日本語文ではなく、
   * 翻訳辞書のキー文字列（既知のキー）か、`describeError()`経由の
   * ブラウザ生成エラーメッセージ（未知の文字列。この場合はキーとして
   * ヒットしないので、呼び出し側でそのまま表示するフォールバックにする）
   * のどちらか。
   */
  onFallback?: (reason: string) => void
  onSyncComplete?: (mergedCount: number) => void
}

/**
 * WebRTC同期（高速モード）1セッション分の状態を保持するクラス。
 * PeerPanel.tsxが「高速モードを開始」した時点でインスタンス化し、
 * セクションを閉じる／同期完了／失敗したタイミングで破棄する想定
 * （MeshReliefEngineが保持する恒久的なオブジェクトではない）。
 */
export class WebRTCMesh {
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private state: WebRTCConnectionState = 'idle'
  private connectionTimer: number | null = null
  private sentSyncRequest = false

  constructor(
    private readonly engine: MeshReliefEngine,
    private readonly callbacks: WebRTCMeshCallbacks = {},
  ) {}

  getState(): WebRTCConnectionState {
    return this.state
  }

  private setState(next: WebRTCConnectionState): void {
    this.state = next
    this.callbacks.onStateChange?.(next)
  }

  private startConnectionTimeout(): void {
    this.clearConnectionTimeout()
    this.connectionTimer = window.setTimeout(() => {
      this.fail('webrtcTimeout')
    }, CONNECTION_TIMEOUT_MS)
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimer !== null) {
      window.clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }
  }

  private fail(reason: string): void {
    if (this.state === 'failed' || this.state === 'closed') return
    this.setState('failed')
    this.callbacks.onFallback?.(reason)
    this.teardown()
  }

  // ---------------------------------------------------------------------
  // §3.3 手順1・3: オファー側（端末A）
  // ---------------------------------------------------------------------

  /** Offerを作成し、シグナリングQR用のフレーム配列を返す。 */
  async createOffer(): Promise<string[]> {
    if (!isWebRTCSupported()) {
      this.fail('webrtcUnsupported')
      return []
    }
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG)
      this.pc = pc
      this.attachConnectionStateHandlers(pc)

      const channel = pc.createDataChannel(DATA_CHANNEL_LABEL)
      this.channel = channel
      this.attachChannelHandlers(channel)

      this.setState('gathering')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIceGatheringComplete(pc, ICE_GATHERING_TIMEOUT_MS)

      const sdp = pc.localDescription?.sdp
      if (!sdp) throw new Error('webrtcOfferGenerationFailed')

      this.setState('awaiting-answer')
      this.startConnectionTimeout()
      return await encodeSignalingFrames('offer', sdp)
    } catch (err) {
      this.fail(describeError(err))
      return []
    }
  }

  /** §3.3手順3: スキャンして組み立てたAnswer SDPを渡し、接続を完了させる。 */
  async acceptAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) {
      this.fail('webrtcNotReady')
      return
    }
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
      this.setState('connecting')
      this.startConnectionTimeout()
    } catch (err) {
      this.fail(describeError(err))
    }
  }

  // ---------------------------------------------------------------------
  // §3.3 手順2: アンサー側（端末B）
  // ---------------------------------------------------------------------

  /** スキャンして組み立てたOffer SDPを受け取り、Answerを作成してシグナリングQR用のフレーム配列を返す。 */
  async createAnswerFromOffer(offerSdp: string): Promise<string[]> {
    if (!isWebRTCSupported()) {
      this.fail('webrtcUnsupported')
      return []
    }
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG)
      this.pc = pc
      this.attachConnectionStateHandlers(pc)
      pc.ondatachannel = (event) => {
        this.channel = event.channel
        this.attachChannelHandlers(event.channel)
      }

      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })

      this.setState('gathering')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await waitForIceGatheringComplete(pc, ICE_GATHERING_TIMEOUT_MS)

      const sdp = pc.localDescription?.sdp
      if (!sdp) throw new Error('webrtcAnswerGenerationFailed')

      this.setState('connecting')
      this.startConnectionTimeout()
      return await encodeSignalingFrames('answer', sdp)
    } catch (err) {
      this.fail(describeError(err))
      return []
    }
  }

  // ---------------------------------------------------------------------
  // 共通: 接続状態 / DataChannel / 自動同期（§3.3手順4）
  // ---------------------------------------------------------------------

  private attachConnectionStateHandlers(pc: RTCPeerConnection): void {
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this.fail('webrtcIceFailed')
      }
    }
  }

  private attachChannelHandlers(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.clearConnectionTimeout()
      this.setState('connected')
      // §3.3手順4: hello → sync-request → sync-response → ack
      this.send({ type: 'hello', nodeId: this.engine.nodeId, nodeName: this.engine.nodeName })
    }
    channel.onclose = () => {
      if (this.state !== 'synced') {
        this.fail('webrtcDisconnected')
      }
    }
    channel.onerror = () => {
      this.fail('webrtcChannelError')
    }
    channel.onmessage = (event: MessageEvent) => {
      void this.handleMessage(event.data as string)
    }
  }

  private send(message: SyncMessage): void {
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(message))
    }
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch {
      return // 壊れたメッセージは無視（接続自体は継続する）
    }

    // 1-3修正: `as SyncMessage`の無検証キャストをやめ、zodスキーマで検証する。
    // DataChannel越しの相手も他のQR/テキスト同期経路と同様「信頼できない入力」
    // であることに変わりはないため、壊れた/悪意ある形式のメッセージは
    // ここで静かに無視し、接続自体は継続する（QRReceiver同様、1件の異常が
    // セッション全体を壊さない設計）。
    const validation = syncMessageSchema.safeParse(parsedJson)
    if (!validation.success) return
    const message: SyncMessage = validation.data

    switch (message.type) {
      case 'hello': {
        if (this.sentSyncRequest) return
        this.sentSyncRequest = true
        this.setState('syncing')
        this.send({
          type: 'sync-request',
          nodeId: this.engine.nodeId,
          vectorClock: this.engine.getVectorClock(),
        })
        break
      }

      case 'sync-request': {
        if (!message.vectorClock) return
        // 高速モードはQRのペイロード制約が無いため、常に全件を対象にする
        const diff = this.engine.getEntriesSince(message.vectorClock)
        this.send({ type: 'sync-response', nodeId: this.engine.nodeId, entries: diff })
        break
      }

      case 'sync-response': {
        const entries = message.entries ?? []
        const mergedCount = await this.engine.mergeEntriesFromPeer(
          entries,
          message.nodeId,
          message.nodeName ?? message.nodeId,
        )
        this.send({ type: 'ack', nodeId: this.engine.nodeId })
        this.setState('synced')
        this.callbacks.onSyncComplete?.(mergedCount)
        break
      }

      case 'ack':
        // 相手が自分からの差分を受け取り終えたことの確認。今回は特別な処理はしない
        break

      default:
        break
    }
  }

  private teardown(): void {
    this.clearConnectionTimeout()
    this.channel?.close()
    this.pc?.close()
    this.channel = null
    this.pc = null
  }

  /** 高速モードのセクションを閉じる際に呼ぶ。 */
  close(): void {
    const wasSynced = this.state === 'synced'
    this.teardown()
    if (!wasSynced) this.setState('closed')
  }
}
