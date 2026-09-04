/**
 * MeshRelief — common/ShelterSelect
 * §7.4: SafetyPanel/SupplyPanelに追加する「避難所ドロップダウン」。
 * 既存のShelterRecordエントリを選択肢として表示する。
 *
 * store.entries（onEntriesChange経由で更新される安定した配列参照）から
 * useMemoで導出している。store.getEntriesByType('shelter')を毎レンダー
 * 呼ぶと（内部でengine.getEntries()のフィルタ・ソート済み新規配列を
 * 都度作るため）不要な再レンダーを招くので、あえてこちらの経路にしている。
 */

import { useMemo } from 'react'
import { useMeshStore } from '../../store'
import { COLLATION_LOCALE } from '../../../i18n'
import type { CRDTEntry, RecordId, ShelterRecord } from '../../../types'

export interface ShelterSelectProps {
  value: RecordId | null
  onChange: (shelterId: RecordId | null) => void
}

export default function ShelterSelect({ value, onChange }: ShelterSelectProps) {
  const entries = useMeshStore((state) => state.entries)
  const locale = useMeshStore((state) => state.locale)
  const t = useMeshStore((state) => state.t)

  const shelters = useMemo(
    () =>
      entries
        .filter(
          (entry): entry is CRDTEntry & { data: ShelterRecord } => !entry.deleted && entry.data.type === 'shelter',
        )
        .sort((a, b) => a.data.name.localeCompare(b.data.name, COLLATION_LOCALE[locale])),
    [entries, locale],
  )

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-neutral-600 dark:text-neutral-300">{t.shelterSelect.label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="min-h-tap rounded-card border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none focus:border-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-50"
      >
        <option value="">{t.shelterSelect.none}</option>
        {shelters.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.data.name}
          </option>
        ))}
      </select>
      {shelters.length === 0 ? (
        <span className="text-xs text-neutral-400 dark:text-neutral-500">{t.shelterSelect.emptyHint}</span>
      ) : null}
    </label>
  )
}
