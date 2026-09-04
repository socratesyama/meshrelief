/**
 * MeshRelief — usePeerSync
 * =============================================================================
 * PeerPanel.tsx / StationScreen.tsx で共通して必要になる
 * 「常時待機・自動役割交代」QR同期ステートマシン（v3追加要件1）を
 * フックとして切り出したもの。
 *
 * 依頼されたファイル一覧には無い追加だが、両コンポーネントに同じ
 * 複雑なステートマシン（重複排除・タイマー管理・decideRoleに基づく
 * 自動遷移）をそのままコピーすると、後から一方だけ直して整合性が崩れる
 * リスクが大きいと判断し、共有フックとして抽出した。
 *
 * 状態遷移:
 *   idle → （相手のvectorClock QR検出）→ decideRole() →
 *     'synced'  : トースト表示、idleのまま
 *     'send'    : 振動 + sending へ（Animated QR表示。一定時間後に自動でidleへ）
 *     'receive' : receiving へ（ingestQRFrame()で蓄積、完了で振動+トースト+idleへ）
 * =============================================================================
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMeshStore } from '../store'
import { QRCodec } from '../../comm/qr-codec'
import { FRAME_INTERVAL_MS } from '../components/AnimatedQR'
import type { DiffScope, IngestFrameResult } from '../../engine/mesh'
import type { VectorClock } from '../../types'
const qrCodec = new QRCodec()

const SEND_LOOPS = 3
const MIN_SEND_DURATION_MS = 6000
const STALL_THRESHOLD_MS = 4000
const TOAST_DURATION_MS = 3000

function computeSendDurationMs(frameCount: number): number {
  if (frameCount <= 1) return MIN_SEND_DURATION_MS
  return Math.max(frameCount * FRAME_INTERVAL_MS * SEND_LOOPS, MIN_SEND_DURATION_MS)
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export type PeerSyncMode = 'idle' | 'sending' | 'receiving'

export interface UsePeerSyncOptions {
  /** prepareDiffBundleに渡すscope。既定'default'（v3要件2）。実行中に変わっても即座に反映される。 */
  scope?: DiffScope
  /** 受信が完了するたびに追加で呼ばれる（ステーションの累計件数カウント等に使う）。 */
  onReceiveComplete?: (mergedCount: number) => void
}

export interface UsePeerSyncResult {
  mode: PeerSyncMode
  /** sending中に表示するAnimated QRのフレーム配列。 */
  frames: string[]
  /** receiving中の進捗（0.0〜1.0）。 */
  receiveProgress: number
  /** フレームが読み取れない等のガイド文言。無ければnull。 */
  guidance: string | null
  /** 直近のトースト文言。無ければnull。 */
  toast: string | null
  /** 自分のvectorClock QR（idle/receiving中に表示する）。 */
  myVcQR: string
  /** QRScannerのonFrameにそのまま渡すハンドラ。 */
  handleFrame: (text: string) => void
  /** sending中の表示を手動で打ち切ってidleへ戻す（UIの「スキャンに戻る」ボタン用）。 */
  cancelSending: () => void
}

export function usePeerSync(options: UsePeerSyncOptions = {}): UsePeerSyncResult {
  const { scope = 'default', onReceiveComplete } = options

  const engine = useMeshStore((state) => state.engine)
  const entries = useMeshStore((state) => state.entries)
  const t = useMeshStore((state) => state.t)

  const [mode, setMode] = useState<PeerSyncMode>('idle')
  const [frames, setFrames] = useState<string[]>([])
  const [receiveProgress, setReceiveProgress] = useState(0)
  const [guidance, setGuidance] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // scope/onReceiveCompleteは呼び出し側の都合で毎レンダー変わりうるため、
  // refで最新値を参照する（非同期コールバック内から安全に読むため）
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const onReceiveCompleteRef = useRef(onReceiveComplete)
  onReceiveCompleteRef.current = onReceiveComplete

  const lastProcessedVcTextRef = useRef<string | null>(null)
  const lastProgressChangeAtRef = useRef<number>(Date.now())
  const sendTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const myVcQR = useMemo(() => engine?.generateVectorClockQR() ?? '', [engine, entries])

  function showToast(message: string): void {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), TOAST_DURATION_MS)
  }

  // sending状態を一定時間で自動的に終わらせる
  useEffect(() => {
    if (mode !== 'sending') return
    const duration = computeSendDurationMs(frames.length)
    sendTimerRef.current = window.setTimeout(() => {
      setMode('idle')
      setFrames([])
      // 【1-4修正】送信完了時にリセットしないと、相手のvectorClock QRの
      // 中身が変化していない場合（お互いのデータが変わっていない）に
      // 「直前と同一内容だから無視」され続け、再スキャンしても二度と
      // 同期が成立しない状態になる（ロードマップ1-4「相打ちデッドロック」参照）。
      lastProcessedVcTextRef.current = null
    }, duration)
    return () => {
      if (sendTimerRef.current !== null) window.clearTimeout(sendTimerRef.current)
    }
  }, [mode, frames.length])

  // receiving中、進捗が止まっていたら読み取りガイドを出す（§7.2）
  useEffect(() => {
    if (mode !== 'receiving') {
      setGuidance(null)
      return
    }
    const interval = window.setInterval(() => {
      if (Date.now() - lastProgressChangeAtRef.current > STALL_THRESHOLD_MS) {
        setGuidance(t.peerSync.badScan)
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [mode])

  useEffect(() => {
    return () => {
      if (sendTimerRef.current !== null) window.clearTimeout(sendTimerRef.current)
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  async function startSending(remoteVcText: string): Promise<void> {
    if (!engine) return
    vibrate(200)
    setMode('sending')
    try {
      const bundle = await engine.prepareDiffBundle(remoteVcText, scopeRef.current)
      const newFrames = await engine.generateAnimatedQR(bundle)
      setFrames(newFrames)
    } catch {
      showToast(t.peerSync.sendPrepFailed)
      setMode('idle')
    }
  }

  async function handleReceiveFrame(text: string): Promise<void> {
    if (!engine) return
    setMode((prev) => (prev === 'sending' ? prev : 'receiving'))

    let result: IngestFrameResult
    try {
      result = await engine.ingestQRFrame(text)
    } catch {
      return
    }

    if (result.error) {
      setGuidance(t.peerSync.badScan)
      return
    }

    lastProgressChangeAtRef.current = Date.now()
    setGuidance(null)
    setReceiveProgress(result.progress)

    if (result.complete) {
      const mergedCount = result.mergedCount ?? 0
      vibrate([80, 50, 80])
      showToast(t.peerSync.syncedCount(mergedCount))
      setMode('idle')
      setReceiveProgress(0)
      lastProcessedVcTextRef.current = null // 次のラウンドの判定を取りこぼさないようにリセット
      onReceiveCompleteRef.current?.(mergedCount)
    }
  }

  async function handleVectorClockDetected(vcText: string): Promise<void> {
    if (!engine) return
    let remoteVc: VectorClock
    let remoteNodeId: string
    try {
      const decoded = qrCodec.decodeVectorClock(vcText)
      remoteVc = decoded.vectorClock
      remoteNodeId = decoded.nodeId
    } catch {
      return // 壊れた/無関係なQRは無視
    }

    // 【1-4修正】相打ちデッドロック対策のタイブレークにnodeIdを使うため、
    // 相手のvectorClock QRから得たnodeIdをdecideRoleへ渡す。
    const decision = engine.decideRole(remoteVc, remoteNodeId)
    if (decision === 'synced') {
      showToast(t.peerSync.syncedAlready)
      return
    }
    if (decision === 'send') {
      await startSending(vcText)
      return
    }
    // 'receive': 状態を切り替えるだけ。実データはhandleReceiveFrame側で処理される
    setMode('receiving')
    setReceiveProgress(0)
    lastProgressChangeAtRef.current = Date.now()
  }

  function handleFrame(text: string): void {
    if (mode === 'sending') return // 送信中は画面が相手を向いているのでスキャン結果を無視

    const kind = qrCodec.detectQRKind(text)
    if (kind === 'frame') {
      void handleReceiveFrame(text)
      return
    }
    if (kind === 'vector-clock') {
      if (mode === 'receiving') return // 受信中は割り込ませない
      if (text === lastProcessedVcTextRef.current) return // 直前と同一内容は無視（デバウンス）
      lastProcessedVcTextRef.current = text
      void handleVectorClockDetected(text)
    }
  }

  function cancelSending(): void {
    setMode('idle')
    setFrames([])
  }

  return { mode, frames, receiveProgress, guidance, toast, myVcQR, handleFrame, cancelSending }
}
