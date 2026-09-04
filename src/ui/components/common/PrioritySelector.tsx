/**
 * MeshRelief — common/PrioritySelector
 * v3追加要件: Safety/Supply/MessagePanel（緊急性が意味を持つ種別）に
 * 共通の priority（'normal' | 'urgent'）選択UI。既定は'normal'
 * （呼び出し側のuseStateの初期値で担保する）。
 */

import type { Priority } from '../../../types'
import { useMeshStore } from '../../store'

export interface PrioritySelectorProps {
  value: Priority
  onChange: (value: Priority) => void
}

export default function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  const t = useMeshStore((state) => state.t)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-neutral-600 dark:text-neutral-300">{t.prioritySelector.label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange('normal')}
          aria-pressed={value === 'normal'}
          className={`min-h-tap flex-1 rounded-card border px-3 text-sm font-medium transition-colors ${
            value === 'normal'
              ? 'border-neutral-400 bg-neutral-100 text-neutral-800 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100'
              : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
          }`}
        >
          {t.prioritySelector.normal}
        </button>
        <button
          type="button"
          onClick={() => onChange('urgent')}
          aria-pressed={value === 'urgent'}
          className={`min-h-tap flex-1 rounded-card border px-3 text-sm font-medium transition-colors ${
            value === 'urgent'
              ? 'border-urgent-500 bg-urgent-100 text-urgent-700 dark:border-urgent-500 dark:bg-urgent-900/40 dark:text-urgent-300'
              : 'border-neutral-200 text-neutral-500 hover:bg-urgent-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-urgent-900/20'
          }`}
        >
          {t.prioritySelector.urgent}
        </button>
      </div>
    </div>
  )
}
