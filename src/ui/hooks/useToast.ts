/**
 * MeshRelief — useToast
 * common/Toast.tsxと対になる、トーストの表示/自動消去タイマーを
 * 管理する共通フック。4パネルで使用する。
 */

import { useRef, useState } from 'react'

const DEFAULT_DURATION_MS = 3000

export interface UseToastResult {
  toast: string | null
  showToast: (message: string, durationMs?: number) => void
}

export function useToast(): UseToastResult {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  function showToast(text: string, durationMs: number = DEFAULT_DURATION_MS): void {
    setMessage(text)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setMessage(null), durationMs)
  }

  return { toast: message, showToast }
}
