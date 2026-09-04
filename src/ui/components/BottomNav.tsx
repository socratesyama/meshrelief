/**
 * MeshRelief — BottomNav
 * =============================================================================
 * 5タブ（Safety/Supply/Shelter/Message/Peer）の下部固定ナビゲーション。
 * App.tsxから使う。デザインはセッション1のトークン（nav-height,
 * zIndex.bottomNav, pb-safe）にそのまま従う。
 * =============================================================================
 */

import type { ComponentType, SVGProps } from 'react'
import type { BottomNavTab } from '../../styles/tokens'
import { useMeshStore } from '../store'
import type { Dict } from '../../i18n'

function SafetyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
    </svg>
  )
}

function SupplyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 8l9-5 9 5-9 5-9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  )
}

function ShelterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

function MessageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  )
}

function PeerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9" />
      <path d="M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6" />
    </svg>
  )
}

function buildTabs(t: Dict): { key: BottomNavTab; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] {
  return [
    { key: 'safety', label: t.nav.safety, Icon: SafetyIcon },
    { key: 'supply', label: t.nav.supply, Icon: SupplyIcon },
    { key: 'shelter', label: t.nav.shelter, Icon: ShelterIcon },
    { key: 'message', label: t.nav.message, Icon: MessageIcon },
    { key: 'peer', label: t.nav.peer, Icon: PeerIcon },
  ]
}

export interface BottomNavProps {
  active: BottomNavTab
  onChange: (tab: BottomNavTab) => void
}

export default function BottomNav({ active, onChange }: BottomNavProps) {
  const t = useMeshStore((state) => state.t)
  const tabs = buildTabs(t)
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-bottomNav w-full max-w-app -translate-x-1/2 border-t border-neutral-200 bg-white pb-safe dark:border-neutral-800 dark:bg-neutral-900 sm:border-x"
    >
      <div className="flex h-nav-height items-stretch">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-500'
              }`}
            >
              <tab.Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
