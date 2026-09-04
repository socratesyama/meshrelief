/**
 * MeshRelief — PeerPanel（個人モード用）
 * =============================================================================
 * 実装計画書 v2 §7.1をベースにしつつ、v3追加要件1により「向かい合わせで
 * 同時に表示・スキャン」方式を廃し、**アウトカメラ限定・自動交代方式**に
 * 置き換えている。実際の状態遷移・重複排除・タイマー管理は
 * `src/ui/hooks/usePeerSync.ts`（StationScreen.tsxと共有）に集約した。
 *
 * v3要件2: prepareDiffBundleは既定でscope='default'
 *   （urgent + 自避難所のみ）を使う。「全データを同期する」は目立たない
 *   detail的な位置に置く。
 *
 * 「テキストで同期（緊急時）」（§7.1）は原案通り残しているが、折りたたみ式
 * にして目立たせすぎないようにした。
 *
 * ⚡高速モード（WebRTC, §3）は今回 `comm/webrtc.ts` を実装し、実際に
 * 呼び出す形にした。設計判断メモ:
 *
 *  - 高速モードは、常時自動で動いているメインのQRスキャン（usePeerSync）
 *    とは別に、ユーザーが明示的に開始する独立したミニフローとして実装
 *    した。Offer/Answerの役割は自動判定せず、「オファーを作成する
 *    （先にはじめる）」「相手の合図を読み取る」の2ボタンで明示的に選ばせる
 *    （データ同期のdecideRoleのような自動判定は、接続の開始者を決める
 *    という性質上そぐわないと判断した）。
 *  - 高速モードのシグナリングQRスキャン中（offer-scan/answer-scan）は、
 *    メインのQRScannerを**アンマウント**してカメラを解放してから、
 *    高速モード用の別のQRScannerインスタンスを使う。QRScanner.tsxの
 *    `active` propはデコードループの一時停止のみでカメラストリーム自体は
 *    維持する設計のため、CSSで隠すだけでは2つのgetUserMediaが同時に
 *    競合してしまう。高速モードは低頻度なユーザー操作なので、
 *    このタイミングでのカメラ再取得コストは許容している。
 *  - 接続失敗時（`onFallback`）は、エラーメッセージを表示して高速モードの
 *    フローを`role-choice`へ戻すだけにしている。メインのQR同期は
 *    PeerPanelを開いている間ずっと動き続けているため、改めて何かを
 *    開始する必要が無い（＝それ自体がフォールバック先になっている）。
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import type { SVGProps } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import AnimatedQR from './AnimatedQR'
import QRScanner from './QRScanner'
import SyncStatus from './SyncStatus'
import Toast from './common/Toast'
import Badge from './common/Badge'
import LoadingIndicator from './common/LoadingIndicator'
import { usePeerSync } from '../hooks/usePeerSync'
import { useMeshStore } from '../store'
import { colors } from '../../styles/tokens'
import { SignalingReceiver, WebRTCMesh, detectSignalingKind, isWebRTCSupported } from '../../comm/webrtc'
import type { WebRTCConnectionState, SignalingIngestResult } from '../../comm/webrtc'
import type { Dict } from '../../i18n'

function BoltIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" />
    </svg>
  )
}

function ProgressBar({ value }: { value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
      <div
        className="h-full rounded-full bg-primary-600 transition-[width] duration-200 dark:bg-primary-400"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

type WebRTCStep =
  | 'closed'
  | 'role-choice'
  | 'offer-show'
  | 'offer-scan'
  | 'answer-scan'
  | 'answer-show'
  | 'connecting'
  | 'done'

/**
 * comm/webrtc.tsから渡される`reason`は、既知のエラーであれば翻訳辞書の
 * キー文字列、ブラウザ由来の未知のエラーであれば`describeError()`が
 * 返した生のメッセージ文字列のどちらか（詳細はwebrtc.tsの
 * `onFallback`コメント参照）。前者ならここで表示言語に翻訳し、
 * 後者（辞書に無いキー）ならそのまま表示するフォールバックにする。
 */
function translateWebrtcError(reasonKey: string, t: Dict): string {
  const dict = t.peerPanel.webrtcErrors as Record<string, string>
  return dict[reasonKey] ?? reasonKey
}

export default function PeerPanel() {
  const engine = useMeshStore((state) => state.engine)
  const t = useMeshStore((state) => state.t)
  // ensureMesh()が作るWebRTCMeshのコールバックは、接続確立中ずっと
  // 同じインスタンスが使い回される（生成時にしか登録されない）ため、
  // 通常のクロージャでtを参照すると、接続中に表示言語を切り替えた場合に
  // 古い言語のまま固まる。tRef経由で常に最新値を参照する。
  const tRef = useRef(t)
  tRef.current = t

  const [syncEverything, setSyncEverything] = useState(false)
  const [textSyncOpen, setTextSyncOpen] = useState(false)
  const [textSyncOutput, setTextSyncOutput] = useState('')
  const [textSyncInput, setTextSyncInput] = useState('')
  const [textSyncMessage, setTextSyncMessage] = useState<string | null>(null)

  const { mode, frames, receiveProgress, guidance, toast, myVcQR, handleFrame, cancelSending } = usePeerSync({
    scope: syncEverything ? 'all' : 'default',
  })

  // --- ⚡高速モード（WebRTC, §3） -------------------------------------------

  const [webrtcStep, setWebrtcStep] = useState<WebRTCStep>('closed')
  const [webrtcConnState, setWebrtcConnState] = useState<WebRTCConnectionState>('idle')
  const [webrtcFrames, setWebrtcFrames] = useState<string[]>([])
  const [webrtcError, setWebrtcError] = useState<string | null>(null)
  const [webrtcMergedCount, setWebrtcMergedCount] = useState<number | null>(null)
  const [webrtcScanProgress, setWebrtcScanProgress] = useState(0)

  const webrtcMeshRef = useRef<WebRTCMesh | null>(null)
  const signalingReceiverRef = useRef(new SignalingReceiver())

  const webrtcUsingCamera = webrtcStep === 'offer-scan' || webrtcStep === 'answer-scan'

  useEffect(() => {
    // アンマウント時に確立中/確立済みの接続を確実に閉じる
    return () => {
      webrtcMeshRef.current?.close()
    }
  }, [])

  function openWebRTC(): void {
    setWebrtcError(null)
    setWebrtcMergedCount(null)
    setWebrtcStep('role-choice')
  }

  function closeWebRTC(): void {
    webrtcMeshRef.current?.close()
    webrtcMeshRef.current = null
    signalingReceiverRef.current.reset()
    setWebrtcStep('closed')
    setWebrtcFrames([])
    setWebrtcConnState('idle')
  }

  function ensureMesh(): WebRTCMesh | null {
    if (!engine) return null
    if (!webrtcMeshRef.current) {
      webrtcMeshRef.current = new WebRTCMesh(engine, {
        onStateChange: (state) => {
          setWebrtcConnState(state)
          if (state === 'connected' || state === 'syncing') {
            setWebrtcStep('connecting')
          }
        },
        onFallback: (reason) => {
          setWebrtcError(translateWebrtcError(reason, tRef.current))
          setWebrtcStep('role-choice')
          webrtcMeshRef.current = null
        },
        onSyncComplete: (mergedCount) => {
          setWebrtcMergedCount(mergedCount)
          setWebrtcStep('done')
        },
      })
    }
    return webrtcMeshRef.current
  }

  async function startAsOfferer(): Promise<void> {
    setWebrtcError(null)
    const mesh = ensureMesh()
    if (!mesh) return
    const generatedFrames = await mesh.createOffer()
    if (generatedFrames.length === 0) return // 失敗時はonFallback経由でwebrtcErrorがセットされる
    setWebrtcFrames(generatedFrames)
    setWebrtcStep('offer-show')
  }

  function proceedToScanAnswer(): void {
    signalingReceiverRef.current.reset()
    setWebrtcScanProgress(0)
    setWebrtcStep('offer-scan')
  }

  function startAsAnswerer(): void {
    setWebrtcError(null)
    signalingReceiverRef.current.reset()
    setWebrtcScanProgress(0)
    setWebrtcStep('answer-scan')
  }

  async function handleSignalingFrame(text: string): Promise<void> {
    const kind = detectSignalingKind(text)
    if (kind === 'unknown') return

    const expectedRole = webrtcStep === 'offer-scan' ? 'answer' : webrtcStep === 'answer-scan' ? 'offer' : null
    if (!expectedRole || kind !== expectedRole) return

    let result: SignalingIngestResult
    try {
      result = await signalingReceiverRef.current.ingestFrame(text)
    } catch (err) {
      setWebrtcError(translateWebrtcError(err instanceof Error ? err.message : String(err), t))
      return
    }
    setWebrtcScanProgress(result.progress)
    if (!result.complete || !result.sdp) return

    const mesh = ensureMesh()
    if (!mesh) return

    if (webrtcStep === 'offer-scan') {
      // 端末A（オファー側）: 相手のAnswerを読み取り終えた → 接続完了へ
      await mesh.acceptAnswer(result.sdp)
      setWebrtcStep('connecting')
    } else if (webrtcStep === 'answer-scan') {
      // 端末B（アンサー側）: 相手のOfferを読み取り終えた → Answerを作成して見せる
      const answerFrames = await mesh.createAnswerFromOffer(result.sdp)
      if (answerFrames.length === 0) return
      setWebrtcFrames(answerFrames)
      setWebrtcStep('answer-show')
    }
  }

  // --- テキストで同期（緊急時） -------------------------------------------

  async function handleCreateTextBundle(): Promise<void> {
    if (!engine) return
    try {
      const bundle = await engine.prepareTextBundle(syncEverything ? 'all' : 'default')
      setTextSyncOutput(JSON.stringify(bundle))
      setTextSyncMessage(t.peerPanel.textSync.createdToast(bundle.entryCount))
    } catch {
      setTextSyncMessage(t.peerPanel.textSync.createFailedToast)
    }
  }

  async function handleCopyTextBundle(): Promise<void> {
    try {
      await navigator.clipboard.writeText(textSyncOutput)
      setTextSyncMessage(t.peerPanel.textSync.copiedToast)
    } catch {
      setTextSyncMessage(t.peerPanel.textSync.copyFailedToast)
    }
  }

  async function handleImportTextBundle(): Promise<void> {
    if (!engine) return
    let parsed: unknown
    try {
      parsed = JSON.parse(textSyncInput)
    } catch {
      setTextSyncMessage(t.peerPanel.textSync.invalidFormatToast)
      return
    }
    try {
      // 1-3修正: ここでは`as QRBundle`のような無検証キャストをせず、
      // engine.ingestBundle内部のzodスキーマ検証に委ねる
      const { mergedCount } = await engine.ingestBundle(parsed)
      setTextSyncMessage(t.peerPanel.textSync.importedToast(mergedCount))
      setTextSyncInput('')
    } catch {
      setTextSyncMessage(t.peerPanel.textSync.importFailedToast)
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-safe-nav">
      <Toast message={toast} />

      {/* --- スキャン待機 / 受信中（sending中・高速モードのカメラ使用中はCSSで非表示 or アンマウント） --- */}
      <div className={mode === 'sending' ? 'hidden' : 'flex flex-col items-center gap-4'}>
        {webrtcUsingCamera ? (
          <div className="flex aspect-square w-full max-w-xs items-center justify-center rounded-card bg-neutral-100 text-center text-sm text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
            {t.peerPanel.webrtc.cameraYielded}
            <br />
            {t.peerPanel.webrtc.cameraYieldedSuffix}
          </div>
        ) : (
          <QRScanner onFrame={handleFrame} active={mode !== 'sending'} className="aspect-square w-full max-w-xs" />
        )}

        <div className="flex w-full max-w-xs items-center gap-4 rounded-card border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="shrink-0 rounded-card bg-white p-1.5 shadow-card">
            {myVcQR ? <QRCodeSVG value={myVcQR} size={72} level="H" bgColor="#FFFFFF" fgColor={colors.neutral[900]} /> : null}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {mode === 'receiving' ? t.peerPanel.receivingLabel : t.peerPanel.waitingLabel}
            </p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">{t.peerPanel.myStatusHint}</p>
            {mode === 'receiving' ? <ProgressBar value={receiveProgress} /> : null}
          </div>
        </div>

        {guidance ? <p className="text-center text-sm text-urgent-600 dark:text-urgent-400">{guidance}</p> : null}
      </div>

      {/* --- 送信中（Animated QR） --- */}
      {mode === 'sending' ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-center text-sm font-medium text-primary-700 dark:text-primary-300">{t.peerPanel.sendingHint}</p>
          <AnimatedQR frames={frames} />
          <button
            type="button"
            onClick={cancelSending}
            className="text-xs text-neutral-400 underline decoration-dotted hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            {t.peerPanel.backToScan}
          </button>
        </div>
      ) : null}

      {/* v3要件2: デフォルトスコープの切り替えは目立たない詳細設定として配置 */}
      <button
        type="button"
        onClick={() => setSyncEverything((value) => !value)}
        className="self-center text-xs text-neutral-400 underline decoration-dotted hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        {t.peerPanel.scopeDetailPrefix}
        {syncEverything ? t.peerPanel.scopeAll : t.peerPanel.scopeDefault}
      </button>

      <SyncStatus />

      {/* --- テキストで同期（緊急時） --- */}
      <div className="rounded-card border border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => setTextSyncOpen((value) => !value)}
          className="flex min-h-tap w-full items-center justify-between px-4 text-sm font-medium text-neutral-600 dark:text-neutral-300"
        >
          <span>{t.peerPanel.textSync.title}</span>
          <span className="text-neutral-400 dark:text-neutral-500">{textSyncOpen ? t.common.close : t.common.open}</span>
        </button>

        {textSyncOpen ? (
          <div className="flex flex-col gap-3 border-t border-neutral-200 p-4 dark:border-neutral-700">
            <p className="text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">{t.peerPanel.textSync.hint}</p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleCreateTextBundle()}
                className="min-h-tap rounded-card bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800"
              >
                {t.peerPanel.textSync.createButton}
              </button>
              {textSyncOutput ? (
                <>
                  <textarea
                    readOnly
                    value={textSyncOutput}
                    rows={4}
                    className="rounded-card border border-neutral-300 bg-neutral-50 p-2 text-xs text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyTextBundle()}
                    className="min-h-tap rounded-card border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    {t.peerPanel.textSync.copyButton}
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{t.peerPanel.textSync.pasteLabel}</span>
                <textarea
                  value={textSyncInput}
                  onChange={(event) => setTextSyncInput(event.target.value)}
                  rows={4}
                  placeholder={t.peerPanel.textSync.pastePlaceholder}
                  className="rounded-card border border-neutral-300 bg-white p-2 text-xs text-neutral-800 outline-none focus:border-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleImportTextBundle()}
                disabled={!textSyncInput.trim()}
                className="min-h-tap rounded-card bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700"
              >
                {t.peerPanel.textSync.importButton}
              </button>
            </div>

            {textSyncMessage ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{textSyncMessage}</p> : null}
          </div>
        ) : null}
      </div>

      {/* --- ⚡高速モード（WebRTC, §3） --- */}
      <div className="rounded-card border border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => (webrtcStep === 'closed' ? openWebRTC() : closeWebRTC())}
          className="flex min-h-tap w-full items-center justify-between px-4 text-sm font-medium text-neutral-600 dark:text-neutral-300"
        >
          <span className="flex items-center gap-1.5">
            <BoltIcon className="h-4 w-4" />
            {t.peerPanel.webrtc.title}
          </span>
          <span className="text-neutral-400 dark:text-neutral-500">{webrtcStep === 'closed' ? t.common.open : t.common.close}</span>
        </button>

        {webrtcStep !== 'closed' ? (
          <div className="flex flex-col gap-3 border-t border-neutral-200 p-4 dark:border-neutral-700">
            {!isWebRTCSupported() ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t.peerPanel.webrtc.unsupported}</p>
            ) : (
              <>
                {webrtcError ? (
                  <p className="rounded-card bg-urgent-50 px-3 py-2 text-sm text-urgent-700 dark:bg-urgent-900/30 dark:text-urgent-300">
                    {webrtcError}
                    <br />
                    {t.peerPanel.webrtc.fallbackNote}
                  </p>
                ) : null}

                {webrtcStep === 'role-choice' ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">{t.peerPanel.webrtc.roleChoiceHint}</p>
                    <button
                      type="button"
                      onClick={() => void startAsOfferer()}
                      className="min-h-tap rounded-card bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800"
                    >
                      {t.peerPanel.webrtc.offerButton}
                    </button>
                    <button
                      type="button"
                      onClick={startAsAnswerer}
                      className="min-h-tap rounded-card border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      {t.peerPanel.webrtc.answerButton}
                    </button>
                  </div>
                ) : null}

                {webrtcStep === 'offer-show' ? (
                  <div className="flex flex-col items-center gap-3">
                    <AnimatedQR frames={webrtcFrames} showGuideText={false} size={200} />
                    <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">{t.peerPanel.webrtc.offerShowHint}</p>
                    <button
                      type="button"
                      onClick={proceedToScanAnswer}
                      className="min-h-tap w-full rounded-card bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800"
                    >
                      {t.peerPanel.webrtc.nextButton}
                    </button>
                  </div>
                ) : null}

                {webrtcStep === 'offer-scan' || webrtcStep === 'answer-scan' ? (
                  <div className="flex flex-col items-center gap-3">
                    <QRScanner onFrame={(text) => void handleSignalingFrame(text)} className="aspect-square w-full max-w-xs" />
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {webrtcStep === 'offer-scan' ? t.peerPanel.webrtc.scanHintOffer : t.peerPanel.webrtc.scanHintAnswer}
                    </p>
                    <ProgressBar value={webrtcScanProgress} />
                  </div>
                ) : null}

                {webrtcStep === 'answer-show' ? (
                  <div className="flex flex-col items-center gap-3">
                    <AnimatedQR frames={webrtcFrames} showGuideText={false} size={200} />
                    <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">{t.peerPanel.webrtc.answerShowHint}</p>
                  </div>
                ) : null}

                {webrtcStep === 'connecting' ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <LoadingIndicator label={webrtcConnState === 'syncing' ? t.peerPanel.webrtc.syncing : t.peerPanel.webrtc.connecting} />
                  </div>
                ) : null}

                {webrtcStep === 'done' ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <Badge variant="safe">{t.peerPanel.webrtc.doneBadge}</Badge>
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">{t.peerPanel.webrtc.doneCount(webrtcMergedCount ?? 0)}</p>
                    <button
                      type="button"
                      onClick={closeWebRTC}
                      className="min-h-tap w-full rounded-card border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      {t.common.close}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
