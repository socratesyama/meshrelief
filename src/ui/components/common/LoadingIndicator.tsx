/**
 * MeshRelief — common/LoadingIndicator
 * 送信中・処理中を示す小さなスピナー。ボタン内インライン表示にも使う。
 */

export interface LoadingIndicatorProps {
  label?: string
  size?: number
  className?: string
}

export default function LoadingIndicator({ label, size = 20, className = '' }: LoadingIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-current ${className}`}>
      <svg className="animate-spin" style={{ width: size, height: size }} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span className="text-sm">{label}</span> : null}
    </span>
  )
}
