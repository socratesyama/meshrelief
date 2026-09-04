/**
 * MeshRelief — SyncStatus
 * =============================================================================
 * 実装計画書 v2 §5.1 で定義した SyncStatus 型（types.ts）をそのまま表示する
 * 「接続状況」カード。
 *
 * 設計判断メモ:
 *  - Zustand storeの`syncStatus`を自分で購読する「自己接続型」の
 *    コンポーネントにしている（`<SyncStatus />` だけで使える）。
 *    PeerPanel/StationScreen 双方から props バケツリレー無しで
 *    埋め込めるようにするため。
 * =============================================================================
 */

import type { ReactNode } from 'react'
import { useMeshStore } from '../store'
import { INTL_LOCALE_TAG, type Dict, type Locale } from '../../i18n'
import type { SyncStatus as SyncStatusType, SyncMethod } from '../../types'

function formatSyncMethod(method: SyncMethod | null, t: Dict): string {
  switch (method) {
    case 'qr':
      return t.syncStatus.methodQr
    case 'webrtc':
      return t.syncStatus.methodWebrtc
    case 'text':
      return t.syncStatus.methodText
    default:
      return ''
  }
}

function formatDateTime(timestamp: number | null, t: Dict, locale: Locale): string {
  if (timestamp === null) return t.time.notSyncedYet
  return new Date(timestamp).toLocaleString(INTL_LOCALE_TAG[locale], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-right font-medium text-neutral-900 dark:text-neutral-50">{children}</dd>
    </div>
  )
}

export interface SyncStatusPanelProps {
  /** テスト・Storybook等で任意の状態を差し込みたい場合に上書きできる。通常は不要。 */
  status?: SyncStatusType
}

export default function SyncStatus({ status: statusOverride }: SyncStatusPanelProps = {}) {
  const storeStatus = useMeshStore((state) => state.syncStatus)
  const locale = useMeshStore((state) => state.locale)
  const t = useMeshStore((state) => state.t)
  const status = statusOverride ?? storeStatus

  return (
    <div className="rounded-card border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{t.syncStatus.title}</h3>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <Row label={t.syncStatus.lastSync}>
          {formatDateTime(status.lastSyncAt, t, locale)}
          {status.lastSyncMethod ? `（${formatSyncMethod(status.lastSyncMethod, t)}）` : ''}
        </Row>
        <Row label={t.syncStatus.lastSyncCount}>{t.syncStatus.unitEntries(status.lastSyncEntryCount)}</Row>
        <Row label={t.syncStatus.pending}>
          <span
            className={
              status.pendingCount > 0
                ? 'text-urgent-600 dark:text-urgent-400'
                : 'text-safe-600 dark:text-safe-400'
            }
          >
            {t.syncStatus.unitEntries(status.pendingCount)}
          </span>
        </Row>
        {status.peerCount > 0 ? <Row label={t.syncStatus.peerCount}>{t.syncStatus.unitPeers(status.peerCount)}</Row> : null}
      </dl>
    </div>
  )
}
