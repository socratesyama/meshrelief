/** MeshRelief — 4パネル共通の相対時刻フォーマット。 */
import type { Dict, Locale } from '../../../i18n'
import { INTL_LOCALE_TAG } from '../../../i18n'

export function formatRelativeTime(timestamp: number, t: Dict, locale: Locale): string {
  const diffMs = Date.now() - timestamp
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return t.time.justNow
  if (diffMin < 60) return t.time.minutesAgo(diffMin)
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t.time.hoursAgo(diffHour)
  return new Date(timestamp).toLocaleString(INTL_LOCALE_TAG[locale], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
