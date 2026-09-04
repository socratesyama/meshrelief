/**
 * MeshRelief — common/Badge
 * 状態・緊急度を示すバッジ。urgent系はセッション1のデザイントークン
 * （urgent-*スケール）でオレンジ〜レッドに統一し、他の状態色と混同しない
 * ようにする（v3追加要件のpriority可視化にも使う）。
 */

import type { ReactNode } from 'react'

export type BadgeVariant = 'urgent' | 'safe' | 'neutral' | 'info' | 'primary'

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  urgent: 'bg-urgent-100 text-urgent-700 dark:bg-urgent-900/40 dark:text-urgent-300',
  safe: 'bg-safe-100 text-safe-700 dark:bg-safe-900/40 dark:text-safe-300',
  neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  info: 'bg-info-100 text-info-700 dark:bg-info-900/40 dark:text-info-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
}

export interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

export default function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
