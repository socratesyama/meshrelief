/**
 * MeshRelief — App
 * =============================================================================
 * これまでのセッションで作った全コンポーネントを1つのアプリとして
 * 組み上げるルート。5タブ（Safety/Supply/Shelter/Message/Peer）の
 * 下部固定ナビゲーション、同期状態の簡易表示、デモモードの起動導線を持つ。
 *
 * 【v3追加要件】nodeRoleによる出し分け:
 *   - 'personal' → 従来どおりの5タブUI
 *   - 'station'  → StationScreen（session8実装）を全画面表示。5タブUIは出さない
 *
 * 【余裕枠: デモ実演モード】
 *   station側の右下に小さく「デモ実演モード」ボタンを置き、押すと
 *   一時的に5タブUIをプレビュー表示できるようにした。これは
 *   `engine.setNodeRole()` を呼ばない、純粋にローカルな見た目だけの
 *   切り替え（"一時"切替という要求に合わせ、実際のnodeRoleやDBの内容は
 *   一切変更しない）。「ステーション画面に戻る」でいつでも元に戻せる。
 *
 * main.tsxはこのApp.tsxを「phase==='ready'」の中身として描画する
 * （main.tsx側の編集も参照）。
 * =============================================================================
 */

import { useState } from 'react'
import type { SVGProps } from 'react'
import SafetyPanel from './components/SafetyPanel'
import SupplyPanel from './components/SupplyPanel'
import ShelterPanel from './components/ShelterPanel'
import MessagePanel from './components/MessagePanel'
import PeerPanel from './components/PeerPanel'
import StationScreen from './components/StationScreen'
import BottomNav from './components/BottomNav'
import DemoMode from './components/DemoMode'
import LocaleSwitcher from './components/common/LocaleSwitcher'
import { useMeshStore } from './store'

function BookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 6c-1.5-1-3.5-1.5-5.5-1.5-.6 0-1.1.05-1.5.14V17c.4-.09.9-.14 1.5-.14 2 0 4 .5 5.5 1.5V6Z" />
      <path d="M12 6c1.5-1 3.5-1.5 5.5-1.5.6 0 1.1.05 1.5.14V17c-.4-.09-.9-.14-1.5-.14-2 0-4 .5-5.5 1.5V6Z" />
    </svg>
  )
}

function SyncGlance({ onOpenPeer }: { onOpenPeer: () => void }) {
  const syncStatus = useMeshStore((state) => state.syncStatus)
  const t = useMeshStore((state) => state.t)
  const hasPending = syncStatus.pendingCount > 0

  return (
    <button
      type="button"
      onClick={onOpenPeer}
      className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${hasPending ? 'bg-urgent-500' : 'bg-safe-500'}`} />
      {hasPending ? t.appHeader.pending(syncStatus.pendingCount) : t.appHeader.synced}
    </button>
  )
}

function PersonalApp() {
  const activeTab = useMeshStore((state) => state.activeTab)
  const setActiveTab = useMeshStore((state) => state.setActiveTab)
  const locale = useMeshStore((state) => state.locale)
  const setLocale = useMeshStore((state) => state.setLocale)
  const t = useMeshStore((state) => state.t)
  const [demoOpen, setDemoOpen] = useState(false)

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-black">
      {/*
        タブレット/PCなど画面幅が広い環境でも、このアプリは
        「スマホ1台分」のカラム（max-w-app）を中央に固定表示する。
        QRカメラ操作が前提のアプリのため、PC向けに複数カラムの
        別レイアウトを作るのではなく、スマホと同じ縦一列のUIを
        そのまま中央表示するのが適切という判断（詳細はdocs/DECISIONS.md）。
        BottomNav.tsx側も同じmax-w-appで揃えている。
      */}
      <div className="mx-auto flex min-h-screen w-full max-w-app flex-col bg-neutral-50 shadow-elevated dark:bg-neutral-950 sm:border-x sm:border-neutral-200 sm:dark:border-neutral-800">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-neutral-200 bg-white/95 px-4 py-3 pt-safe backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
          <span className="shrink-0 text-base font-semibold text-neutral-900 dark:text-neutral-50">MeshRelief</span>
          <div className="flex min-w-0 items-center gap-1.5">
            <SyncGlance onOpenPeer={() => setActiveTab('peer')} />
            <LocaleSwitcher compact locale={locale} onChange={setLocale} label={t.localeSwitcher.label} ariaLabel={t.localeSwitcher.aria} />
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-card border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <BookIcon className="h-3.5 w-3.5" />
              {t.appHeader.demo}
            </button>
          </div>
        </header>

        <main className="flex-1">
          {activeTab === 'safety' ? <SafetyPanel /> : null}
          {activeTab === 'supply' ? <SupplyPanel /> : null}
          {activeTab === 'shelter' ? <ShelterPanel /> : null}
          {activeTab === 'message' ? <MessagePanel /> : null}
          {activeTab === 'peer' ? <PeerPanel /> : null}
        </main>
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />

      {demoOpen ? (
        <div className="fixed inset-0 z-modal flex justify-center bg-neutral-900/40">
          <div className="flex w-full max-w-app flex-col bg-neutral-50 dark:bg-neutral-950">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 pt-safe dark:border-neutral-800">
              <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{t.demoOverlay.label}</span>
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="min-h-tap px-2 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                {t.common.close}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DemoMode />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function App() {
  const nodeRole = useMeshStore((state) => state.nodeRole)
  const [previewPersonal, setPreviewPersonal] = useState(false)

  if (nodeRole === 'station' && !previewPersonal) {
    return (
      <div className="relative">
        <StationScreen />
        <button
          type="button"
          onClick={() => setPreviewPersonal(true)}
          className="fixed bottom-4 right-4 z-bottomNav rounded-full bg-neutral-800/90 px-3 py-1.5 text-xs text-white shadow-elevated hover:bg-neutral-700"
        >
          デモ実演モード
        </button>
      </div>
    )
  }

  if (nodeRole === 'station' && previewPersonal) {
    return (
      <div className="relative">
        <PersonalApp />
        <button
          type="button"
          onClick={() => setPreviewPersonal(false)}
          className="fixed bottom-20 right-4 z-bottomNav rounded-full bg-neutral-800/90 px-3 py-1.5 text-xs text-white shadow-elevated hover:bg-neutral-700"
        >
          ステーション画面に戻る
        </button>
      </div>
    )
  }

  return <PersonalApp />
}
