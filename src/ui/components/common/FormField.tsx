/**
 * MeshRelief — common/FormField
 * 4パネルのフォームで使い回す、ラベル付き入力欄の共通ラッパー。
 * `INPUT_CLASSES` はtext/select/textarea共通の見た目を揃えるための
 * クラス文字列。各パネルの `<input>`/`<select>`/`<textarea>` にそのまま
 * 適用する。
 */

import type { ReactNode } from 'react'

export const INPUT_CLASSES =
  'min-h-tap rounded-card border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500'

export interface FormFieldProps {
  label: string
  hint?: string
  children: ReactNode
  /** falseの場合<label>ではなく<div>で囲む（チェックボックス群など、ラベルクリックでの誤操作を避けたい場合）。既定true。 */
  asLabel?: boolean
}

export default function FormField({ label, hint, children, asLabel = true }: FormFieldProps) {
  const Wrapper = asLabel ? 'label' : 'div'
  return (
    <Wrapper className="flex flex-col gap-1.5">
      <span className="text-sm text-neutral-600 dark:text-neutral-300">{label}</span>
      {children}
      {hint ? <span className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</span> : null}
    </Wrapper>
  )
}
