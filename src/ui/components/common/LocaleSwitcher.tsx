/**
 * MeshRelief — common/LocaleSwitcher
 * =============================================================================
 * 表示言語の切り替えUI。ネイティブの<select>を土台にしている
 * （カスタムのドロップダウンを自作するより、スクリーンリーダー・
 * キーボード操作・モバイルOSのピッカーUIとの相性が確実なため。
 * 防災アプリという性質上、見た目の凝った演出よりも「確実に動く」
 * ことを優先した）。
 *
 * 各言語は「その言語自身での自称」で表示する（LOCALE_LABELS参照）。
 * 例えば表示言語が英語の状態でも、選択肢には「日本語」「中文」
 * 「한국어」とそのまま表示し、自分の母語を探しやすくしている。
 * =============================================================================
 */
import type { SVGProps } from 'react'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '../../../i18n'

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 10l5 5 5-5" />
    </svg>
  )
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.7 9.5h16.6M3.7 14.5h16.6M12 3.5c2.2 2.3 3.4 5.2 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.2-3.4-8.5S9.8 5.8 12 3.5Z" />
    </svg>
  )
}

export interface LocaleSwitcherProps {
  locale: Locale
  onChange: (locale: Locale) => void
  label: string
  ariaLabel: string
  /** trueの場合コンパクト表示（App.tsxヘッダーのアイコンボタン用）。falseの場合はSetupScreen向けのラベル付き表示。 */
  compact?: boolean
  className?: string
}

export default function LocaleSwitcher({ locale, onChange, label, ariaLabel, compact = false, className = '' }: LocaleSwitcherProps) {
  return (
    <label
      className={`relative inline-flex min-h-tap items-center gap-1.5 rounded-card border border-neutral-300 px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 ${className}`}
    >
      <GlobeIcon className="h-4 w-4 shrink-0" />
      {compact ? null : <span className="whitespace-nowrap">{label}</span>}
      <span className="whitespace-nowrap">{LOCALE_LABELS[locale]}</span>
      <ChevronIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
      <select
        aria-label={ariaLabel}
        value={locale}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  )
}
