/**
 * MeshRelief — StationScreen
 * =============================================================================
 * v3追加要件3: 同期ステーション専用の全画面UI。
 * `nodeRole === 'station'` の場合にのみ表示される、5タブUIとは別の画面
 * （5タブへ出し分ける処理自体はApp.tsx側の責務。次回以降実装予定。
 * ここでは念のため自分自身でも nodeRole をチェックしている）。
 *
 * 実際のQR同期の状態遷移（自動役割交代・スキャン・Animated QR表示）は
 * PeerPanel.tsxと共通の `usePeerSync` フックを再利用している。
 * StationScreen固有なのは以下の3点:
 *   1. 常にscope='all'で同期する（mesh.ts側でもnodeRole==='station'なら
 *      強制的に'all'として扱われるが、ここでの指定は意図の明示）
 *   2. `engine.startStationLoop()` を使い、1件同期が完了するたびに
 *      「本日の累計同期件数」を加算し続ける
 *   3. 画面上部に「本日の累計同期件数」「最終同期時刻」を常時表示する
 *
 * 設計判断メモ:
 *  - 「本日の累計同期件数」はこのセッション中（アプリを開いてから）の
 *    インメモリなカウントに留めている。日付をまたいだリセットや
 *    アプリ再起動後の永続化は行っていない（今回のスコープ外の判断。
 *    必要であれば別途 storage/db.ts 側に統計用のストアを追加する
 *    実装が必要になる）。
 *  - 「最終同期時刻」は Zustand store の syncStatus.lastSyncAt
 *    （mesh.tsが同期のたびに更新）をそのまま使っている。
 *  - 配色は常時ダーク基調に固定している（アプリ全体のライト/ダーク設定に
 *    連動させていない）。受付に据え置くキオスク的な画面という性質上、
 *    グレア低減や「個人モードとは違う画面である」という視覚的な
 *    区別を優先した。
 * =============================================================================
 */

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import AnimatedQR from './AnimatedQR'
import QRScanner from './QRScanner'
import { usePeerSync } from '../hooks/usePeerSync'
import { useMeshStore } from '../store'
import { colors } from '../../styles/tokens'
import { INTL_LOCALE_TAG, type Dict, type Locale } from '../../i18n'

function ProgressBar({ value }: { value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-700">
      <div
        className="h-full rounded-full bg-primary-400 transition-[width] duration-200"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function formatTime(timestamp: number | null, t: Dict, locale: Locale): string {
  if (timestamp === null) return t.stationScreen.notSyncedTime
  return new Date(timestamp).toLocaleTimeString(INTL_LOCALE_TAG[locale], { hour: '2-digit', minute: '2-digit' })
}

export default function StationScreen() {
  const engine = useMeshStore((state) => state.engine)
  const nodeRole = useMeshStore((state) => state.nodeRole)
  const nodeName = useMeshStore((state) => state.nodeName)
  const syncStatus = useMeshStore((state) => state.syncStatus)
  const locale = useMeshStore((state) => state.locale)
  const t = useMeshStore((state) => state.t)

  const [syncCount, setSyncCount] = useState(0)

  const { mode, frames, receiveProgress, guidance, toast, myVcQR, handleFrame, cancelSending } = usePeerSync({
    scope: 'all',
  })

  // engine.startStationLoop: 1件同期が完了するたびに累計件数を加算する。
  // 待機状態への復帰自体はQRReceiver/usePeerSyncが既に自動で行うため、
  // ここでは「カウントアップ」という通知の受け口として使っている。
  useEffect(() => {
    if (!engine) return
    engine.startStationLoop(() => {
      setSyncCount((count) => count + 1)
    })
    return () => engine.stopStationLoop()
  }, [engine])

  if (nodeRole !== 'station') {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 pb-safe pt-safe text-neutral-50">
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-toast flex justify-center px-4">
          <div className="rounded-card bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-900 shadow-elevated">
            {toast}
          </div>
        </div>
      ) : null}

      {/* 上部: 本日の累計同期件数 / 最終同期時刻（区切り線は全幅、中身のみ極端な横広がりを避けるため幅を制限） */}
      <header className="border-b border-neutral-800 px-5 py-4">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-neutral-400">
              {nodeName}
              {t.stationScreen.roleSuffix}
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {syncCount}
              <span className="ml-1 text-sm font-normal text-neutral-400">{t.stationScreen.todayUnit}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-400">{t.stationScreen.lastSync}</p>
            <p className="text-lg font-medium tabular-nums">{formatTime(syncStatus.lastSyncAt, t, locale)}</p>
          </div>
        </div>
      </header>

      {/* メイン: 常時アウトカメラ待機、または送信中はAnimated QR */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-6">
        <div className={mode === 'sending' ? 'hidden' : 'flex w-full max-w-sm flex-col items-center gap-4'}>
          <QRScanner onFrame={handleFrame} active={mode !== 'sending'} className="aspect-square w-full" />

          <p className="text-sm text-neutral-300">
            {mode === 'receiving' ? t.stationScreen.receivingText : t.stationScreen.waitingText}
          </p>

          {mode === 'receiving' ? (
            <div className="w-full max-w-xs">
              <ProgressBar value={receiveProgress} />
            </div>
          ) : null}

          {guidance ? <p className="text-center text-sm text-urgent-400">{guidance}</p> : null}

          <div className="mt-2 rounded-card bg-white p-2">
            {myVcQR ? <QRCodeSVG value={myVcQR} size={88} level="H" bgColor="#FFFFFF" fgColor={colors.neutral[900]} /> : null}
          </div>
        </div>

        {mode === 'sending' ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-4">
            <p className="text-center text-sm font-medium text-primary-300">{t.stationScreen.sendingText}</p>
            <AnimatedQR frames={frames} />
            <button
              type="button"
              onClick={cancelSending}
              className="text-xs text-neutral-500 underline decoration-dotted hover:text-neutral-300"
            >
              {t.stationScreen.backToWaiting}
            </button>
          </div>
        ) : null}
      </div>

      <footer className="px-5 pb-4 text-center text-xs text-neutral-500">{t.stationScreen.footerNote}</footer>
    </div>
  )
}
