/**
 * MeshRelief — DemoMode
 * =============================================================================
 * 実装計画書 v2 §7.3「デモモード」に対応。
 * `src/engine/scenario.ts` の4幕を順に再生するUI。
 *
 *  - 各幕は`store.createRecord()`（＝他パネルと全く同じ、engine経由の
 *    正規のデータ登録経路）を通じて1件ずつ投入する。
 *  - Act 1は常に再生可能。Act Nを再生すると、Act N+1のロックが解除される
 *    （§7.3のUIスケッチ通り）。
 *  - 再生済みの幕は「再生済み」表示にしてボタンを無効化する。
 *    再度押せる状態にすると、createRecord()が呼ばれるたびに新規エントリが
 *    増え続けてしまう（同じデータの重複投入は意図しないため）。
 *  - 「デモをリセット」は`storage/db.ts`の`clearAllEntries()`
 *    （db.ts実装セッションで用意していた「デモの最初からやり直す」用の
 *    補助関数）を使い、その後ページを再読み込みする。CRDTEngineの
 *    メモリ上の状態とIndexedDBの内容がズレないよう、リロードで
 *    確実に同期させている。全データ（デモ以外も含む）を消すため、
 *    実行前に確認ダイアログを出す。
 * =============================================================================
 */

import { useState } from 'react'
import type { SVGProps } from 'react'
import Card from './common/Card'
import Badge from './common/Badge'
import LoadingIndicator from './common/LoadingIndicator'
import Toast from './common/Toast'
import { useMeshStore } from '../store'
import { useToast } from '../hooks/useToast'
import { clearAllEntries } from '../../storage/db'
import { demoActs } from '../../engine/scenario'

function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 6c-1.5-1-3.5-1.5-5.5-1.5-.6 0-1.1.05-1.5.14V17c.4-.09.9-.14 1.5-.14 2 0 4 .5 5.5 1.5V6Z" />
      <path d="M12 6c1.5-1 3.5-1.5 5.5-1.5.6 0 1.1.05 1.5.14V17c-.4-.09-.9-.14-1.5-.14-2 0-4 .5-5.5 1.5V6Z" />
    </svg>
  )
}

export default function DemoMode() {
  const createRecord = useMeshStore((state) => state.createRecord)
  const t = useMeshStore((state) => state.t)
  const { toast, showToast } = useToast()

  const [playedCount, setPlayedCount] = useState(0)
  const [playingActId, setPlayingActId] = useState<number | null>(null)

  async function handlePlay(actId: number): Promise<void> {
    const act = demoActs.find((a) => a.id === actId)
    if (!act) return

    setPlayingActId(act.id)
    try {
      for (const data of act.entries) {
        await createRecord(data)
      }
      setPlayedCount((count) => Math.max(count, act.id))
      showToast(t.demoMode.playedToast(act.entries.length))
    } catch {
      showToast(t.demoMode.playFailedToast)
    } finally {
      setPlayingActId(null)
    }
  }

  async function handleReset(): Promise<void> {
    const confirmed = window.confirm(t.demoMode.resetConfirm)
    if (!confirmed) return
    await clearAllEntries()
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Toast message={toast} />

      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          <BookIcon className="h-5 w-5" />
          {t.demoMode.heading}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t.demoMode.scenarioTitle}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {demoActs.map((act) => {
          const isUnlocked = act.id <= playedCount + 1
          const isPlayed = act.id <= playedCount
          const isPlaying = playingActId === act.id
          const actText = t.demoMode.acts[act.id - 1] ?? { title: act.title, subtitle: act.subtitle }

          return (
            <li key={act.id}>
              <Card className={isUnlocked ? '' : 'opacity-50'}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">{t.demoMode.actLabel(act.id)}</span>
                  {isPlayed ? <Badge variant="safe">{t.demoMode.playedBadge}</Badge> : null}
                </div>
                <p className="mt-1 font-medium text-neutral-900 dark:text-neutral-50">{actText.title}</p>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{actText.subtitle}</p>

                <button
                  type="button"
                  onClick={() => void handlePlay(act.id)}
                  disabled={!isUnlocked || isPlaying || isPlayed}
                  className="mt-3 flex min-h-tap w-full items-center justify-center gap-2 rounded-card bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
                >
                  {isPlaying ? (
                    <LoadingIndicator label={t.demoMode.playing} />
                  ) : isPlayed ? (
                    t.demoMode.played
                  ) : isUnlocked ? (
                    t.demoMode.play
                  ) : (
                    t.demoMode.locked
                  )}
                </button>
              </Card>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => void handleReset()}
        className="self-center text-xs text-neutral-400 underline decoration-dotted hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        {t.demoMode.resetButton}
      </button>
    </div>
  )
}
