/**
 * MeshRelief — SupplyPanel
 * =============================================================================
 * 実装計画書 v2 §7.4「SupplyPanel: engine経由に変更、避難所ドロップダウン追加」
 * に対応。データ登録は必ず `store.createRecord()` 経由で行う。
 *
 * v3追加要件: priority（'normal'|'urgent'、既定'normal'）選択UIを追加。
 * 一覧ではurgentのみBadgeで強調表示する。
 * =============================================================================
 */

import { useMemo, useState, type FormEvent } from 'react'
import Card from './common/Card'
import Badge from './common/Badge'
import EmptyState from './common/EmptyState'
import LoadingIndicator from './common/LoadingIndicator'
import Toast from './common/Toast'
import FormField, { INPUT_CLASSES } from './common/FormField'
import PrioritySelector from './common/PrioritySelector'
import ShelterSelect from './common/ShelterSelect'
import { formatRelativeTime } from './common/formatTime'
import { useMeshStore } from '../store'
import { useToast } from '../hooks/useToast'
import type { CRDTEntry, Priority, RecordId, ShelterRecord, SupplyRecord } from '../../types'

function isSupplyEntry(entry: CRDTEntry): entry is CRDTEntry & { data: SupplyRecord } {
  return entry.data.type === 'supply'
}

function isShelterEntry(entry: CRDTEntry): entry is CRDTEntry & { data: ShelterRecord } {
  return entry.data.type === 'shelter'
}

export default function SupplyPanel() {
  const entries = useMeshStore((state) => state.entries)
  const createRecord = useMeshStore((state) => state.createRecord)
  const updateRecord = useMeshStore((state) => state.updateRecord)
  const deleteRecord = useMeshStore((state) => state.deleteRecord)
  const locale = useMeshStore((state) => state.locale)
  const t = useMeshStore((state) => state.t)
  const { toast, showToast } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 【6-1追加】編集対象のエントリID。nullなら新規登録モード（SafetyPanel参照）。 */
  const [editingId, setEditingId] = useState<RecordId | null>(null)

  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [shelterId, setShelterId] = useState<RecordId | null>(null)
  const [priority, setPriority] = useState<Priority>('normal')
  const [notes, setNotes] = useState('')

  const items = useMemo(
    () =>
      entries
        .filter((e): e is CRDTEntry & { data: SupplyRecord } => !e.deleted && isSupplyEntry(e))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  )

  const shelterNameById = useMemo(() => {
    const map = new Map<RecordId, string>()
    for (const entry of entries) {
      if (!entry.deleted && isShelterEntry(entry)) map.set(entry.id, entry.data.name)
    }
    return map
  }, [entries])

  function resetForm(): void {
    setItemName('')
    setQuantity('')
    setUnit('')
    setShelterId(null)
    setPriority('normal')
    setNotes('')
    setEditingId(null)
  }

  /** 【6-1追加】一覧の「編集」ボタンから呼ばれる。既存値をフォームへ読み込む。 */
  function startEditing(entry: CRDTEntry & { data: SupplyRecord }): void {
    setEditingId(entry.id)
    setItemName(entry.data.itemName)
    setQuantity(String(entry.data.quantity))
    setUnit(entry.data.unit)
    setShelterId(entry.data.shelterId ?? null)
    setPriority(entry.data.priority ?? 'normal')
    setNotes(entry.data.notes ?? '')
    setFormOpen(true)
  }

  function handleToggleForm(): void {
    if (formOpen) resetForm()
    setFormOpen((v) => !v)
  }

  /** 【6-1追加】数量のワンタップ増減。補充/消費の反映コストを下げる。 */
  async function handleQuickQuantityChange(entry: CRDTEntry & { data: SupplyRecord }, delta: number): Promise<void> {
    const next = Math.max(0, entry.data.quantity + delta)
    if (next === entry.data.quantity) return
    try {
      await updateRecord(entry.id, { quantity: next })
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
    const trimmedItemName = itemName.trim()
    const parsedQuantity = Number(quantity)
    if (!trimmedItemName || !unit.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity < 0) return

    setSubmitting(true)
    try {
      const patch: SupplyRecord = {
        type: 'supply',
        itemName: trimmedItemName,
        quantity: parsedQuantity,
        unit: unit.trim(),
        shelterId: shelterId ?? undefined,
        priority,
        notes: notes.trim() || undefined,
      }
      if (editingId) {
        await updateRecord(editingId, patch)
        showToast(t.common.updatedToast)
      } else {
        await createRecord(patch)
        showToast(t.supplyPanel.successToast)
      }
      resetForm()
      setFormOpen(false)
    } catch {
      showToast(editingId ? t.common.updateFailedToast : t.supplyPanel.errorToast)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-safe-nav">
      <Toast message={toast} />

      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t.supplyPanel.title}</h1>
        <span className="text-sm text-neutral-400 dark:text-neutral-500">{t.supplyPanel.count(items.length)}</span>
      </header>

      <button
        type="button"
        onClick={handleToggleForm}
        className="min-h-tap rounded-card border border-primary-300 bg-primary-50 px-4 text-sm font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
      >
        {formOpen ? t.common.close : t.supplyPanel.addButton}
      </button>

      {formOpen ? (
        <Card>
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <FormField label={t.supplyPanel.itemNameLabel}>
              <input
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder={t.supplyPanel.itemNamePlaceholder}
                maxLength={60}
                className={INPUT_CLASSES}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label={t.supplyPanel.quantityLabel}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder={t.supplyPanel.quantityPlaceholder}
                  className={INPUT_CLASSES}
                />
              </FormField>
              <FormField label={t.supplyPanel.unitLabel}>
                <input
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder={t.supplyPanel.unitPlaceholder}
                  maxLength={20}
                  className={INPUT_CLASSES}
                />
              </FormField>
            </div>

            <ShelterSelect value={shelterId} onChange={setShelterId} />

            <PrioritySelector value={priority} onChange={setPriority} />

            <FormField label={t.supplyPanel.notesLabel}>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={INPUT_CLASSES} />
            </FormField>

            <button
              type="submit"
              disabled={!itemName.trim() || !unit.trim() || submitting}
              className="flex min-h-tap-lg items-center justify-center gap-2 rounded-card bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700"
            >
              {submitting ? (
                <LoadingIndicator label={t.supplyPanel.submitting} />
              ) : editingId ? (
                t.common.saveButton
              ) : (
                t.supplyPanel.submitButton
              )}
            </button>
          </form>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title={t.supplyPanel.emptyTitle} description={t.supplyPanel.emptyDesc} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((entry) => {
            const shelterName = entry.data.shelterId ? shelterNameById.get(entry.data.shelterId) : undefined
            return (
              <li key={entry.id}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-neutral-900 dark:text-neutral-50">{entry.data.itemName}</span>
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {entry.data.quantity} {entry.data.unit}
                        </span>
                        {entry.data.priority === 'urgent' ? <Badge variant="urgent">{t.supplyPanel.urgentBadge}</Badge> : null}
                      </div>
                      {shelterName ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{shelterName}</p> : null}
                      {entry.data.notes ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{entry.data.notes}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                      {formatRelativeTime(entry.updatedAt, t, locale)}
                    </span>
                  </div>

                  {/* 【6-1追加】数量のワンタップ増減 + 編集/削除 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <button
                      type="button"
                      onClick={() => void handleQuickQuantityChange(entry, -1)}
                      disabled={entry.data.quantity <= 0}
                      className="min-h-tap min-w-tap rounded-full border border-neutral-200 text-sm font-medium text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      −1
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleQuickQuantityChange(entry, 1)}
                      className="min-h-tap min-w-tap rounded-full border border-neutral-200 text-sm font-medium text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      +1
                    </button>
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
            )
          })}
        </ul>
      )}
    </div>
  )
}
