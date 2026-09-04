/**
 * MeshRelief — SafetyPanel
 * =============================================================================
 * 実装計画書 v2 §7.4「SafetyPanel: engine経由に変更、避難所ドロップダウン追加」
 * および §5.2「個人情報の取り扱い」に対応。
 *
 *  - データ登録は必ず `store.createRecord()`（内部で`engine.createRecord()`
 *    を呼ぶだけで、storeのentries自体は直接書き換えない）経由で行う。
 *  - 氏名: §5.2により「イニシャルでも構わない」ことをヒントで明示。
 *    型上は必須フィールド（`SafetyRecord.name: string`）のため、
 *    空文字での送信はUI側でブロックする。
 *  - 電話番号: §5.2「任意、QRには含めないオプション」。
 *    ただしCRDTEntryは常に丸ごと同期される設計（フィールド単位での
 *    同期除外の仕組みは無い）ため、「入力するが同期はしない」という
 *    技術的な仕組みは実装できない。誠実な実装として、電話番号欄自体を
 *    「共有する」チェックボックス（既定OFF）でオン/オフし、オンにした
 *    場合は同期で共有される旨を明示する形にした（DECISIONS.md参照）。
 *  - v3追加要件: priority（'normal'|'urgent'、既定'normal'）選択UIを追加。
 *    一覧ではurgentのみBadgeで強調表示する。
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
import type { BadgeVariant } from './common/Badge'
import type { CRDTEntry, Priority, RecordId, SafetyRecord, SafetyStatus } from '../../types'

const STATUS_BADGE_VARIANT: Record<SafetyStatus, BadgeVariant> = {
  safe: 'safe',
  injured: 'urgent',
  needs_help: 'urgent',
  unknown: 'neutral',
}

function isSafetyEntry(entry: CRDTEntry): entry is CRDTEntry & { data: SafetyRecord } {
  return entry.data.type === 'safety'
}

export default function SafetyPanel() {
  const entries = useMeshStore((state) => state.entries)
  const createRecord = useMeshStore((state) => state.createRecord)
  const updateRecord = useMeshStore((state) => state.updateRecord)
  const deleteRecord = useMeshStore((state) => state.deleteRecord)
  const locale = useMeshStore((state) => state.locale)
  const t = useMeshStore((state) => state.t)
  const { toast, showToast } = useToast()

  const STATUS_OPTIONS: { value: SafetyStatus; label: string }[] = [
    { value: 'safe', label: t.safetyPanel.status.safe },
    { value: 'injured', label: t.safetyPanel.status.injured },
    { value: 'needs_help', label: t.safetyPanel.status.needs_help },
    { value: 'unknown', label: t.safetyPanel.status.unknown },
  ]

  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /**
   * 【6-1追加】編集対象のエントリID。nullなら新規登録モード。
   * 一覧の「編集」をタップすると、既存の値をフォームに読み込んだ上で
   * このIDをセットし、送信時は createRecord ではなく
   * updateRecord(editingId, patch) を呼ぶ（エンジン側は既に対応済み。
   * ロードマップ6-1「エンジン層は対応済みなのでUIを足すだけで解決する」
   * に対応する変更）。
   */
  const [editingId, setEditingId] = useState<RecordId | null>(null)

  const [name, setName] = useState('')
  const [status, setStatus] = useState<SafetyStatus>('safe')
  const [sharePhone, setSharePhone] = useState(false)
  const [phone, setPhone] = useState('')
  const [needsMedicine, setNeedsMedicine] = useState(false)
  const [needsCare, setNeedsCare] = useState(false)
  const [shelterId, setShelterId] = useState<RecordId | null>(null)
  const [priority, setPriority] = useState<Priority>('normal')
  const [notes, setNotes] = useState('')

  const items = useMemo(
    () =>
      entries
        .filter((e): e is CRDTEntry & { data: SafetyRecord } => !e.deleted && isSafetyEntry(e))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  )

  function resetForm(): void {
    setName('')
    setStatus('safe')
    setSharePhone(false)
    setPhone('')
    setNeedsMedicine(false)
    setNeedsCare(false)
    setShelterId(null)
    setPriority('normal')
    setNotes('')
    setEditingId(null)
  }

  /** 【6-1追加】一覧の「編集」ボタンから呼ばれる。既存値をフォームへ読み込む。 */
  function startEditing(entry: CRDTEntry & { data: SafetyRecord }): void {
    setEditingId(entry.id)
    setName(entry.data.name)
    setStatus(entry.data.status)
    setSharePhone(Boolean(entry.data.phone))
    setPhone(entry.data.phone ?? '')
    setNeedsMedicine(Boolean(entry.data.needsMedicine))
    setNeedsCare(Boolean(entry.data.needsCare))
    setShelterId(entry.data.shelterId ?? null)
    setPriority(entry.data.priority ?? 'normal')
    setNotes(entry.data.notes ?? '')
    setFormOpen(true)
  }

  function handleToggleForm(): void {
    if (formOpen) {
      resetForm()
    }
    setFormOpen((v) => !v)
  }

  /**
   * 【6-1追加】SafetyPanelの一覧カードに置く「ワンタップ状態変更」。
   * フォームを開かずその場で updateRecord を呼ぶ。緊急時の操作コストを
   * 下げるための機能（ロードマップ6-1の具体案参照）。
   */
  async function handleQuickStatusChange(entry: CRDTEntry & { data: SafetyRecord }, next: SafetyStatus): Promise<void> {
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

    setSubmitting(true)
    try {
      const patch: SafetyRecord = {
        type: 'safety',
        name: trimmedName,
        status,
        phone: sharePhone && phone.trim() ? phone.trim() : undefined,
        needsMedicine: needsMedicine || undefined,
        needsCare: needsCare || undefined,
        shelterId: shelterId ?? undefined,
        priority,
        notes: notes.trim() || undefined,
      }
      if (editingId) {
        await updateRecord(editingId, patch)
        showToast(t.common.updatedToast)
      } else {
        await createRecord(patch)
        showToast(t.safetyPanel.successToast)
      }
      resetForm()
      setFormOpen(false)
    } catch {
      showToast(editingId ? t.common.updateFailedToast : t.safetyPanel.errorToast)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-safe-nav">
      <Toast message={toast} />

      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t.safetyPanel.title}</h1>
        <span className="text-sm text-neutral-400 dark:text-neutral-500">{t.safetyPanel.count(items.length)}</span>
      </header>

      <button
        type="button"
        onClick={handleToggleForm}
        className="min-h-tap rounded-card border border-primary-300 bg-primary-50 px-4 text-sm font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
      >
        {formOpen ? t.common.close : t.safetyPanel.addButton}
      </button>

      {formOpen ? (
        <Card>
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <FormField label={t.safetyPanel.nameLabel} hint={t.safetyPanel.nameHint}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.safetyPanel.namePlaceholder}
                maxLength={40}
                className={INPUT_CLASSES}
              />
            </FormField>

            <FormField label={t.safetyPanel.statusLabel} asLabel={false}>
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

            <FormField label={t.safetyPanel.phoneLabel} asLabel={false}>
              <label className="flex min-h-tap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={sharePhone}
                  onChange={(event) => setSharePhone(event.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                {t.safetyPanel.phoneShareLabel}
              </label>
              {sharePhone ? (
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={t.safetyPanel.phonePlaceholder}
                  className={`${INPUT_CLASSES} mt-2`}
                />
              ) : null}
              {/* 【1-2追加】「緊急」フラグはapplyDefaultScope()により避難所の
                  垣根を越えて拡散される（engine/mesh.ts参照）。電話番号を
                  含めた状態でこの組み合わせを選ぶと、電話番号もその拡散範囲に
                  乗ってしまうため、この場で気づけるように警告を出す
                  （DECISIONS.md「1-2. 個人情報の拡散範囲」参照）。 */}
              {sharePhone && priority === 'urgent' ? (
                <p className="mt-2 rounded-card bg-urgent-50 px-3 py-2 text-xs text-urgent-700 dark:bg-urgent-900/30 dark:text-urgent-300">
                  {t.safetyPanel.phoneUrgentWarning}
                </p>
              ) : null}
            </FormField>

            <FormField label={t.safetyPanel.needsLabel} asLabel={false}>
              <div className="flex flex-col gap-2">
                <label className="flex min-h-tap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={needsMedicine}
                    onChange={(event) => setNeedsMedicine(event.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  {t.safetyPanel.needsMedicine}
                </label>
                <label className="flex min-h-tap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={needsCare}
                    onChange={(event) => setNeedsCare(event.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                  />
                  {t.safetyPanel.needsCare}
                </label>
              </div>
            </FormField>

            <ShelterSelect value={shelterId} onChange={setShelterId} />

            <PrioritySelector value={priority} onChange={setPriority} />

            <FormField label={t.safetyPanel.notesLabel}>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={INPUT_CLASSES} />
            </FormField>

            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex min-h-tap-lg items-center justify-center gap-2 rounded-card bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700"
            >
              {submitting ? (
                <LoadingIndicator label={t.safetyPanel.submitting} />
              ) : editingId ? (
                t.common.saveButton
              ) : (
                t.safetyPanel.submitButton
              )}
            </button>
          </form>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title={t.safetyPanel.emptyTitle} description={t.safetyPanel.emptyDesc} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((entry) => (
            <li key={entry.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-neutral-50">{entry.data.name}</span>
                      <Badge variant={STATUS_BADGE_VARIANT[entry.data.status]}>{t.safetyPanel.status[entry.data.status]}</Badge>
                      {entry.data.priority === 'urgent' ? <Badge variant="urgent">{t.safetyPanel.urgentBadge}</Badge> : null}
                    </div>
                    {entry.data.phone ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {t.safetyPanel.telPrefix}
                        {entry.data.phone}
                      </p>
                    ) : null}
                    {entry.data.needsMedicine || entry.data.needsCare ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {[
                          entry.data.needsMedicine ? t.safetyPanel.needsMedicine : null,
                          entry.data.needsCare ? t.safetyPanel.needsCare : null,
                        ]
                          .filter(Boolean)
                          .join(' / ')}
                      </p>
                    ) : null}
                    {entry.data.notes ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{entry.data.notes}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                    {formatRelativeTime(entry.updatedAt, t, locale)}
                  </span>
                </div>

                {/* 【6-1追加】ワンタップ状態変更。現在の状態以外の選択肢だけを
                    小さなボタンとして並べる（緊急時の操作コストを下げる）。 */}
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
