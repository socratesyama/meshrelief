/**
 * MeshRelief — common/EmptyState
 * 一覧が0件のときに表示するプレースホルダー。
 */

import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
}

export default function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-neutral-300 px-4 py-10 text-center dark:border-neutral-700">
      {icon ? <div className="text-neutral-300 dark:text-neutral-600">{icon}</div> : null}
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{title}</p>
      {description ? <p className="text-xs text-neutral-400 dark:text-neutral-500">{description}</p> : null}
    </div>
  )
}
