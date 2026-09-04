/**
 * MeshRelief — common/Card
 * 4パネル（Safety/Supply/Shelter/Message）で使い回す汎用カード。
 * デザインはセッション1のトークン（rounded-card, shadow-card等）に従う。
 */

import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  className?: string
  /** trueの場合、タップ可能な要素であることを示すホバースタイルを付与する。 */
  interactive?: boolean
}

export default function Card({ children, className = '', interactive = false }: CardProps) {
  return (
    <div
      className={`rounded-card border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 ${
        interactive ? 'transition-colors hover:border-primary-300 dark:hover:border-primary-700' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}
