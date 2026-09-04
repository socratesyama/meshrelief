/**
 * MeshRelief — AnimatedQR
 * =============================================================================
 * 実装計画書 v2 §2.7「Animated QRの表示」に対応。
 * フレーム配列を300ms間隔で切り替え表示し、「N/M枚表示中」カウンターを出す。
 *
 * 設計判断メモ:
 *
 *  - 誤り訂正レベルについて: 屋外・スマホ画面越しのスキャンでも読み取り
 *    やすいよう、できるだけ高いレベル（'H'=約30%冗長）にしたいところだが、
 *    qr-codec.ts の MAX_QR_PAYLOAD=1800 という既存の設計と両立しない。
 *    QR Version 40（最大バージョン）のByte modeでの実容量はおよそ
 *      L: 2953文字 / M: 2331文字 / Q: 1663文字 / H: 1273文字
 *    であり、1フレーム最大 約1,855文字（チャンク1800文字＋ヘッダ約55文字）
 *    は 'Q' や 'H' には収まらない（'Q'の1663文字すら僅かに不足しうる）。
 *    そのため、1800文字でも確実に収まり、かつ'L'よりは頑健な 'M'
 *    （約15%冗長）を既定値として採用した。
 *    ※ MAX_QR_PAYLOADを下げれば誤り訂正レベルを上げる余地は生まれるが、
 *      既存の合意事項（qr-codec.ts実装セッションで確定）を今回は
 *      変更しないという判断にした。
 *
 *  - QRコード自体の配色は、アプリのダークモード設定によらず常に
 *    黒地に白（実際は白背景に濃い前景色）で固定している。スキャン
 *    信頼性を最優先し、テーマの統一感より優先した。
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { colors } from '../../styles/tokens'
import { useMeshStore } from '../store'

/** フレーム切り替え間隔(ms)。§2.7の目安(200-500ms)の中で明示されている値。 */
export const FRAME_INTERVAL_MS = 300

export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/** ファイル冒頭コメント参照。MAX_QR_PAYLOAD=1800との両立を優先した既定値。 */
const DEFAULT_ERROR_CORRECTION_LEVEL: QRErrorCorrectionLevel = 'M'

export interface AnimatedQRProps {
  /** qr-codec.tsの splitIntoFrames() が返すフレーム文字列の配列。 */
  frames: string[]
  /** QRコードの一辺のサイズ(px)。屋外・画面越しでの視認性を優先し大きめを既定にする。 */
  size?: number
  errorCorrectionLevel?: QRErrorCorrectionLevel
  /** 「相手のカメラを〜」の案内文を表示するか。既定true。 */
  showGuideText?: boolean
}

export default function AnimatedQR({
  frames,
  size = 280,
  errorCorrectionLevel = DEFAULT_ERROR_CORRECTION_LEVEL,
  showGuideText = true,
}: AnimatedQRProps) {
  const t = useMeshStore((state) => state.t)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    // frames自体が別のバンドルに切り替わったら、必ず先頭から再生し直す
    setCurrentIndex(0)
    if (frames.length <= 1) return
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % frames.length)
    }, FRAME_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [frames])

  const currentFrame = frames[currentIndex]
  if (!currentFrame) return null

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-card bg-white p-4 shadow-elevated">
        <QRCodeSVG value={currentFrame} size={size} level={errorCorrectionLevel} bgColor="#FFFFFF" fgColor={colors.neutral[900]} />
      </div>

      {frames.length > 1 ? (
        <p
          className="text-sm font-medium tabular-nums text-neutral-600 dark:text-neutral-300"
          aria-live="polite"
        >
          {t.animatedQR.frameCounter(currentIndex + 1, frames.length)}
        </p>
      ) : null}

      {showGuideText ? (
        <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">{t.animatedQR.guideText}</p>
      ) : null}
    </div>
  )
}
