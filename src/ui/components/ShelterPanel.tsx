/**
 * MeshRelief — ShelterPanel
 * =============================================================================
 * 実装計画書 v2 §7.4「ShelterPanel: engine経由に変更」に対応。
 * データ登録は必ず `store.createRecord()` 経由で行う。
 *
 * priority選択UIは対象外（v3追加要件は「緊急性が意味を持つ種別」＝
 * Safety/Supply/Messageのみとされており、Shelterは含まれない）。
 * 避難所ドロップダウンも対象外（このパネル自体が避難所を新規登録する
 * 側であり、参照する側ではないため）。
 * =============================================================================
 */

import { useMemo, useState, type FormEvent } from 'react'
import Card from './common/Card'
import Badge from './common/Badge'
import EmptyState from './common/EmptyState'
import LoadingIndicator from './common/LoadingIndicator'
import Toast from './common/Toast'
import FormField, { INPUT_CLASSES } from './common/FormField'
import { formatRelativeTime } from './common/formatTime'
import { useMeshStore } from '../store'
import { useToast } from '../hooks/useToast'
import type { BadgeVariant } from './common/Badge'
import type { CRDTEntry, RecordId, ShelterRecord, ShelterStatus } from '../../types'

const STATUS_BADGE_VARIANT: Record<ShelterStatus, BadgeVariant> = {
  open: 'safe',
  limited: 'primary',
  full: 'urgent',
  closed: 'neutral',
}

function isShelterEntry(entry: CRDTEntry): entry is CRDTEntry & { data: ShelterRecord } {
  return entry.data.type === 'shelter'
}

export default function ShelterPanel() {
  const entries = useMeshStore((state) => state.entries)
  const createRecord = useMeshStore((state) => state.createRecord)
  const updateRecord = useMeshStore((state) => state.updateRecord)
  const deleteRecord = useMeshStore((state) => state.deleteRecord)
  const locale = useMeshStore((state) => state.locale)
  const t = useMeshStore((state) => state.t)
  const { toast, showToast } = useToast()

  const STATUS_OPTIONS: { value: ShelterStatus; label: string }[] = [
    { value: 'open', label: t.shelterPanel.status.open },
    { value: 'limited', label: t.shelterPanel.status.limited },
    { value: 'full', label: t.shelterPanel.status.full },
    { value: 'closed', label: t.shelterPanel.status.closed },
  ]

  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 【6-1追加】編集対象のエントリID。nullなら新規登録モード（SafetyPanel参照）。 */
  const [editingId, setEditingId] = useState<RecordId | null>(null)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [capacity, setCapacity] = useState('')
  const [currentOccupancy, setCurrentOccupancy] = useState('')
  const [status, setStatus] = useState<ShelterStatus>('open')
  const [notes, setNotes] = useState('')

  const items = useMemo(
    () =>
      entries
        .filter((e): e is CRDTEntry & { data: ShelterRecord } => !e.deleted && isShelterEntry(e))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  )

  function resetForm(): void {
    setName('')
    setAddress('')
    setCapacity('')
    setCurrentOccupancy('')
    setStatus('open')
    setNotes('')
    setEditingId(null)
  }

  /** 【6-1追加】一覧の「編集」ボタンから呼ばれる。既存値をフォームへ読み込む。 */
  function startEditing(entry: CRDTEntry & { data: ShelterRecord }): void {
    setEditingId(entry.id)
    setName(entry.data.name)
    setAddress(entry.data.address ?? '')
    setCapacity(entry.data.capacity !== undefined ? String(entry.data.capacity) : '')
    setCurrentOccupancy(entry.data.currentOccupancy !== undefined ? String(entry.data.currentOccupancy) : '')
    setStatus(entry.data.status)
    setNotes(entry.data.notes ?? '')
    setFormOpen(true)
  }

  function handleToggleForm(): void {
    if (formOpen) resetForm()
    setFormOpen((v) => !v)
  }

  /** 【6-1追加】受け入れ状況のワンタップ変更。開閉・満員判定を素早く更新できるようにする。 */
  async function handleQuickStatusChange(entry: CRDTEntry & { data: ShelterRecord }, next: ShelterStatus): Promise<void> {
    if (next === entry.data.status) return
    try {
      await updateRecord(entry.id, { status: next })
      showToast(t.common.updatedToast)
    } catch {
      showToast(t.common.updateFailedToast)
    }
  }

  async function handleDelete(id: RecordId): Promise<void> {
    if (!window.confirm(t.common.deleteConfirm)) return
    try {
      await deleteRecord(id)
      showToast(t.common.deletedToast)
    } catch {
      showToast(t.common.deleteFailedToast)
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    const parsedCapacity = capacity.trim() ? Number(capacity) : undefined
    const parsedOccupancy = currentOccupancy.trim() ? Number(currentOccupancy) : undefined
    if (parsedCapacity !== undefined && !Number.isFinite(parsedCapacity)) return
    if (parsedOccupancy !== undefined && !Number.isFinite(parsedOccupancy)) return

    setSubmitting(true)
    try {
      const patch: ShelterRecord = {
        type: 'shelter',
        name: trimmedName,
        address: address.trim() || undefined,
        capacity: parsedCapacity,
        currentOccupancy: parsedOccupancy,
        status,
        notes: notes.trim() || undefined,
      }
      if (editingId) {
        await updateRecord(editingId, patch)
        showToast(t.common.updatedToast)
      } else {
        await createRecord(patch)
        showToast(t.shelterPanel.successToast)
      }
      resetForm()
      setFormOpen(false)
    } catch {
      showToast(editingId ? t.common.updateFailedToast : t.shelterPanel.errorToast)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-safe-nav">
      <Toast message={toast} />

      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t.shelterPanel.title}</h1>
        <span className="text-sm text-neutral-400 dark:text-neutral-500">{t.shelterPanel.count(items.length)}</span>
      </header>

      <button
        type="button"
        onClick={handleToggleForm}
        className="min-h-tap rounded-card border border-primary-300 bg-primary-50 px-4 text-sm font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
      >
        {formOpen ? t.common.close : t.shelterPanel.addButton}
      </button>

      {formOpen ? (
        <Card>
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <FormField label={t.shelterPanel.nameLabel}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.shelterPanel.namePlaceholder}
                maxLength={60}
                className={INPUT_CLASSES}
              />
            </FormField>

            <FormField label={t.shelterPanel.addressLabel} hint={t.shelterPanel.addressHint}>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={t.shelterPanel.addressPlaceholder}
                maxLength={60}
                className={INPUT_CLASSES}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label={t.shelterPanel.capacityLabel}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  className={INPUT_CLASSES}
                />
              </FormField>
              <FormField label={t.shelterPanel.occupancyLabel}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={currentOccupancy}
                  onChange={(event) => setCurrentOccupancy(event.target.value)}
                  className={INPUT_CLASSES}
                />
              </FormField>
            </div>

            <FormField label={t.shelterPanel.statusLabel} asLabel={false}>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    aria-pressed={status === option.value}
                    className={`min-h-tap rounded-card border px-3 text-sm font-medium transition-colors ${
                      status === option.value
                        ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-600 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label={t.shelterPanel.notesLabel}>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={INPUT_CLASSES} />
            </FormField>

            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex min-h-tap-lg items-center justify-center gap-2 rounded-card bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700"
            >
              {submitting ? (
                <LoadingIndicator label={t.shelterPanel.submitting} />
              ) : editingId ? (
                t.common.saveButton
              ) : (
                t.shelterPanel.submitButton
              )}
            </button>
          </form>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title={t.shelterPanel.emptyTitle} description={t.shelterPanel.emptyDesc} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((entry) => (
            <li key={entry.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-neutral-50">{entry.data.name}</span>
                      <Badge variant={STATUS_BADGE_VARIANT[entry.data.status]}>{t.shelterPanel.status[entry.data.status]}</Badge>
                    </div>
                    {entry.data.address ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">{entry.data.address}</p>
                    ) : null}
                    {entry.data.capacity !== undefined || entry.data.currentOccupancy !== undefined ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {entry.data.currentOccupancy ?? '?'} / {entry.data.capacity ?? '?'} {t.shelterPanel.occupancyUnit}
                      </p>
                    ) : null}
                    {entry.data.notes ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{entry.data.notes}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                    {formatRelativeTime(entry.updatedAt, t, locale)}
                  </span>
                </div>

                {/* 【6-1追加】受け入れ状況のワンタップ変更 + 編集/削除 */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  {STATUS_OPTIONS.filter((option) => option.value !== entry.data.status).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void handleQuickStatusChange(entry, option.value)}
                      className="min-h-tap rounded-full border border-neutral-200 px-3 text-xs font-medium text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      → {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => startEditing(entry)}
                    className="min-h-tap rounded-full border border-primary-200 px-3 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-400 dark:hover:bg-primary-900/30"
                  >
                    {t.common.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(entry.id)}
                    className="min-h-tap rounded-full border border-neutral-200 px-3 text-xs font-medium text-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800"
                  >
                    {t.common.deleteButton}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
