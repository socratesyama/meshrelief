/**
 * MeshRelief — QRScanner
 * =============================================================================
 * jsqrでカメラ映像を連続デコードし、QRコードを検出するたびに
 * onFrame(text) を呼ぶ。
 *
 * v3追加要件1「アウトカメラ限定」に対応するため、
 * `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`
 * で明示的に背面（アウト）カメラを要求している。
 *
 * 設計判断メモ:
 *
 *  - 検出した内容の重複排除（同じQRを連続して何度もonFrameしてしまう
 *    問題への対処）は、あえてこのコンポーネントでは行わない。
 *    「今のフレームで何が読めたか」をそのまま伝える最小限の部品とし、
 *    重複排除や「何をすべきか」の判断はPeerPanel/StationScreen側の
 *    責務とする（関心の分離。呼び出し側によって重複排除の要否・粒度が
 *    異なりうるため）。
 *
 *  - `active` prop で「カメラ映像の取得自体は継続したまま、デコード処理
 *    だけ一時停止する」を可能にしている。sending中にカメラを止めて
 *    また起動し直すと、権限再確認やストリーム起動の遅延が発生しうる
 *    ため、ストリームは維持したままデコードループだけ止める設計にした。
 *
 *  - onFrame/active は毎レンダーで変わりうるコールバック/値なので、
 *    ref経由で最新値を参照することで、requestAnimationFrameループを
 *    含む useEffect 自体は初回マウント時の1回しか実行されないように
 *    している（カメラストリームの再取得を防ぐため）。
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useMeshStore } from '../store'

export interface QRScannerProps {
  onFrame: (text: string) => void
  /** falseの間はカメラ映像の取得自体は継続するが、デコード処理を一時停止する。既定true。 */
  active?: boolean
  className?: string
}

export default function QRScanner({ onFrame, active = true, className }: QRScannerProps) {
  const t = useMeshStore((state) => state.t)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const activeRef = useRef(active)
  activeRef.current = active

  // 注記: エラーの「翻訳済み文言」ではなく「詳細メッセージの有無」だけを
  // stateに持たせ、実際の表示文言はレンダー時に現在のtから組み立てる。
  // こうすることで、エラー発生後に表示言語を切り替えても
  // （このuseEffect自体は依存配列が空で一度しか走らないため）
  // 表示が古い言語のまま固まってしまうのを避けられる。
  // hasError=false: エラー無し, hasError=true & detail=null: 詳細不明の汎用エラー,
  // hasError=true & detail=string: ブラウザから得られた詳細メッセージ付き
  const [errorState, setErrorState] = useState<{ hasError: boolean; detail: string | null }>({
    hasError: false,
    detail: null,
  })

  useEffect(() => {
    let stream: MediaStream | null = null
    let rafId: number | null = null
    let cancelled = false

    function tick() {
      if (cancelled) return
      const video = videoRef.current
      const canvas = canvasRef.current

      if (activeRef.current && video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const context = canvas.getContext('2d')
        if (context) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          })
          if (code?.data) {
            onFrameRef.current(code.data)
          }
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, // v3要件: アウトカメラ限定
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        tick()
      } catch (err) {
        setErrorState({ hasError: true, detail: err instanceof Error ? err.message : null })
      }
    }

    void start()

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <div className={`relative overflow-hidden rounded-card bg-neutral-900 ${className ?? ''}`}>
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {/* ビューファインダーの目安枠（装飾は最小限に留める。角丸はアプリ全体のrounded-cardに統一） */}
      <div className="pointer-events-none absolute inset-8 rounded-card border-2 border-white/60" />

      {errorState.hasError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-neutral-900/90 p-6 text-center text-sm text-white">
          <p>
            {errorState.detail ? t.qrScanner.cameraErrorWithDetail(errorState.detail) : t.qrScanner.cameraErrorGeneric}
          </p>
          <p className="text-white/70">{t.qrScanner.permissionHint}</p>
        </div>
      ) : null}
    </div>
  )
}
