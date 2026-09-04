/**
 * MeshRelief — MessagePanel
 * =============================================================================
 * 実装計画書 v2 §7.4「MessagePanel: engine経由に変更」に対応。
 * データ登録は必ず `store.createRecord()` 経由で行う。
 *
 * §7.4の表にはSafety/Supplyのような「避難所ドロップダウン追加」の
 * 指示が無いため、本パネルでは追加していない（MessageRecordは型上
 * shelterIdを持てるが、この画面からは設定しない）。
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
import { formatRelativeTime } from './common/formatTime'
import { useMeshStore } from '../store'
import { useToast } from '../hooks/useToast'
import type { CRDTEntry, MessageRecord, Priority, RecordId } from '../../types'

function isMessageEntry(entry: CRDTEntry): entry is CRDTEntry & { data: MessageRecord } {
  return entry.data.type === 'message'
}

export default function MessagePanel() {
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

  const [authorName, setAuthorName] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')

  const items = useMemo(
    () =>
      entries
        .filter((e): e is CRDTEntry & { data: MessageRecord } => !e.deleted && isMessageEntry(e))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  )

  function resetForm(): void {
    setAuthorName('')
    setBody('')
    setPriority('normal')
    setEditingId(null)
  }

  /** 【6-1追加】一覧の「編集」ボタンから呼ばれる。既存値をフォームへ読み込む。 */
  function startEditing(entry: CRDTEntry & { data: MessageRecord }): void {
    setEditingId(entry.id)
    setAuthorName(entry.data.authorName)
    setBody(entry.data.body)
    setPriority(entry.data.priority ?? 'normal')
    setFormOpen(true)
  }

  function handleToggleForm(): void {
    if (formOpen) resetForm()
    setFormOpen((v) => !v)
  }

  /** 【6-1追加】誤登録の取り下げ用。確認ダイアログ付きでtombstone化する。 */
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
    const trimmedAuthor = authorName.trim()
    const trimmedBody = body.trim()
    if (!trimmedAuthor || !trimmedBody) return

    setSubmitting(true)
    try {
      const patch: MessageRecord = {
        type: 'message',
        authorName: trimmedAuthor,
        body: trimmedBody,
        priority,
      }
      if (editingId) {
        await updateRecord(editingId, patch)
        showToast(t.common.updatedToast)
      } else {
        await createRecord(patch)
        showToast(t.messagePanel.successToast)
      }
      resetForm()
      setFormOpen(false)
    } catch {
      showToast(editingId ? t.common.updateFailedToast : t.messagePanel.errorToast)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-safe-nav">
      <Toast message={toast} />

      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t.messagePanel.title}</h1>
        <span className="text-sm text-neutral-400 dark:text-neutral-500">{t.messagePanel.count(items.length)}</span>
      </header>

      <button
        type="button"
        onClick={handleToggleForm}
        className="min-h-tap rounded-card border border-primary-300 bg-primary-50 px-4 text-sm font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
      >
        {formOpen ? t.common.close : t.messagePanel.addButton}
      </button>

      {formOpen ? (
        <Card>
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            <FormField label={t.messagePanel.authorLabel} hint={t.messagePanel.authorHint}>
              <input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                placeholder={t.messagePanel.authorPlaceholder}
                maxLength={40}
                className={INPUT_CLASSES}
              />
            </FormField>

            <FormField label={t.messagePanel.bodyLabel}>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t.messagePanel.bodyPlaceholder}
                rows={3}
                maxLength={280}
                className={INPUT_CLASSES}
              />
            </FormField>

            <PrioritySelector value={priority} onChange={setPriority} />

            <button
              type="submit"
              disabled={!authorName.trim() || !body.trim() || submitting}
              className="flex min-h-tap-lg items-center justify-center gap-2 rounded-card bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700"
            >
              {submitting ? (
                <LoadingIndicator label={t.messagePanel.submitting} />
              ) : editingId ? (
                t.common.saveButton
              ) : (
                t.messagePanel.submitButton
              )}
            </button>
          </form>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title={t.messagePanel.emptyTitle} description={t.messagePanel.emptyDesc} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((entry) => (
            <li key={entry.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-900 dark:text-neutral-50">{entry.data.authorName}</span>
                      {entry.data.priority === 'urgent' ? <Badge variant="urgent">{t.messagePanel.urgentBadge}</Badge> : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200">{entry.data.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
                    {formatRelativeTime(entry.updatedAt, t, locale)}
                  </span>
                </div>

                {/* 【6-1追加】誤登録の取り下げ（tombstone化）+ 編集 */}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
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
