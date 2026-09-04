/**
 * MeshRelief — SetupScreen
 * =============================================================================
 * 初回起動時に表示するセットアップ画面。
 *
 *  - v3要件: 最初に「個人として使う」/「同期ステーションにする」の2択を
 *    表示し、選択に応じて「お名前」または「避難所名」の入力へ進む。
 *  - §4.2 戦略1: 「このアプリをホーム画面に追加してください」という
 *    PWAインストール誘導を、ブラウザ標準のインストールプロンプトが
 *    使える場合はそれを、使えない場合（主にiOS Safari）は手順を
 *    案内する自前ガイドとして表示する。
 *  - デザインはセッション1で確定した design tokens
 *    （tailwind.config.js / src/styles/tokens.ts）にそのまま従う。
 *    防災アプリの第一印象として「信頼感・視認性」を優先し、
 *    派手な演出やアニメーションは入れていない。
 *
 * 設計判断メモ:
 *  - アイコンは新規ライブラリを追加せず、最小限の自作インラインSVGで
 *    済ませている（このアプリで使うアイコンは数個のみのため）。
 *  - インストールバナーの「閉じた」状態はlocalStorageに保存し、
 *    次回起動時は表示しない（毎回表示すると煩わしいため）。
 *    ※このlocalStorage利用は、Claudeのartifact環境における制限
 *    （in-chatプレビュー用サンドボックスの話）とは無関係の、
 *    実際のブラウザで動くアプリ本体のコードである。
 * =============================================================================
 */

import { useEffect, useState, type FormEvent, type ReactNode, type SVGProps } from 'react'
import { useMeshStore, type SetupInput } from '../store'
import type { NodeRole } from '../../types'
import type { Dict } from '../../i18n'
import LocaleSwitcher from './common/LocaleSwitcher'

// -----------------------------------------------------------------------------
// アイコン（自作の最小限インラインSVG）
// -----------------------------------------------------------------------------

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" {...props}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  )
}

function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M10 3v9M6.5 6.5L10 3l3.5 3.5" />
      <path d="M4 10v5.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
    </svg>
  )
}

function InstallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M10 3v9M6.5 8.5L10 12l3.5-3.5" />
      <path d="M4 14v1.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V14" />
    </svg>
  )
}

function PersonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" />
    </svg>
  )
}

function StationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
      <path d="M4 20h16" />
    </svg>
  )
}

function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 4l-6 6 6 6" />
    </svg>
  )
}

/**
 * MeshRelief のシグネチャーマーク。
 * 「シェルター（家の形）」のシルエットの中に、中央のハブを持たない
 * メッシュ構造（3ノードが直接つながる三角形ネットワーク）を重ねている。
 * public/icon-source.svg・public/favicon.svgと同一モチーフ
 * （taste-skill適用セッションで、旧来の「三角形+ノード」単体構成から
 * 刷新。単体だとネットワーク構成図に見えてしまいブランド識別性が
 * 弱かったため、"Relief"＝シェルターの家型シルエットを主形状にし、
 * "Mesh"＝内部の3ノード三角形を副形状として組み合わせた）。
 * ここではインライン表示用に線画（currentColor）で構成している。
 */
function MeshMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...props}>
      <path
        d="M32 14 L46 27 L46 47 L18 47 L18 27 Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={0.45}
      />
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M32 30 L26 40 M32 30 L38 40 M26 40 L38 40" />
      </g>
      <circle cx="32" cy="30" r="2.75" fill="currentColor" />
      <circle cx="26" cy="40" r="2.75" fill="currentColor" />
      <circle cx="38" cy="40" r="2.75" fill="currentColor" />
    </svg>
  )
}

// -----------------------------------------------------------------------------
// PWAインストール誘導（§4.2 戦略1）
// -----------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_BANNER_DISMISSED_KEY = 'meshrelief:install-banner-dismissed'

function detectIsIOSSafari(): boolean {
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua)
  return isIOS && isSafari
}

function detectIsStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function readInstallBannerDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function InstallBanner({ t }: { t: Dict }) {
  const [dismissed, setDismissed] = useState(readInstallBannerDismissed)
  const [standalone] = useState(detectIsStandalone)
  const [isIOSSafari] = useState(detectIsIOSSafari)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // beforeinstallprompt はブラウザ標準のインストールプロンプトが使える場合のみ発火する
    // （Chrome/Edge/Android等。iOS Safariでは発火しない）
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (standalone || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1')
    } catch {
      // プライベートブラウジング等でlocalStorageが使えない場合は、単に次回また表示される
    }
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    dismiss()
  }

  return (
    <div className="rounded-card border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/40">
      <div className="flex items-start gap-3">
        <InstallIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-300" />
        <div className="flex-1">
          <p className="text-sm font-medium text-primary-900 dark:text-primary-100">{t.setup.installBanner.title}</p>
          <p className="mt-1 text-sm text-primary-800/80 dark:text-primary-200/80">{t.setup.installBanner.body}</p>

          {deferredPrompt ? (
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="mt-3 min-h-tap rounded-card bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700 active:bg-primary-800"
            >
              {t.setup.installBanner.installButton}
            </button>
          ) : isIOSSafari ? (
            <p className="mt-2 text-sm text-primary-800/80 dark:text-primary-200/80">
              {t.setup.installBanner.iosHintPrefix}
              <ShareIcon className="mx-1 inline h-4 w-4 align-text-bottom" />
              {t.setup.installBanner.iosHintSuffix}
            </p>
          ) : (
            <p className="mt-2 text-sm text-primary-800/80 dark:text-primary-200/80">{t.setup.installBanner.menuHint}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.setup.installBanner.closeAria}
          className="flex h-tap w-tap shrink-0 items-center justify-center text-primary-700/60 hover:text-primary-900 dark:text-primary-300/60 dark:hover:text-primary-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// ステップ1: 個人 / ステーション選択（v3追加要件）
// -----------------------------------------------------------------------------

function RoleCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-tap-lg items-start gap-3 rounded-card border border-neutral-200 bg-neutral-50 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-primary-700 dark:hover:bg-primary-900/30"
    >
      <span className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-neutral-900 dark:text-neutral-50">{title}</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{description}</span>
      </span>
    </button>
  )
}

function RoleChoiceStep({ t, onSelect }: { t: Dict; onSelect: (role: NodeRole) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-50">{t.setup.roleChoice.heading}</h2>
      <div className="flex flex-col gap-3">
        <RoleCard
          icon={<PersonIcon className="h-6 w-6" />}
          title={t.setup.roleChoice.personalTitle}
          description={t.setup.roleChoice.personalDesc}
          onClick={() => onSelect('personal')}
        />
        <RoleCard
          icon={<StationIcon className="h-6 w-6" />}
          title={t.setup.roleChoice.stationTitle}
          description={t.setup.roleChoice.stationDesc}
          onClick={() => onSelect('station')}
        />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// ステップ2: 名前 / 避難所名 入力
// -----------------------------------------------------------------------------

function NameInputStep({
  t,
  role,
  name,
  onNameChange,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: {
  t: Dict
  role: NodeRole
  name: string
  onNameChange: (value: string) => void
  onBack: () => void
  onSubmit: (event: FormEvent) => void
  isSubmitting: boolean
  error: string | null
}) {
  const isStation = role === 'station'
  const s = t.setup.nameStep

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          aria-label={s.backAria}
          className="-ml-2 flex h-tap w-tap items-center justify-center text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <h2 className="text-base font-medium text-neutral-900 dark:text-neutral-50">
          {isStation ? s.stationHeading : s.personalHeading}
        </h2>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-neutral-600 dark:text-neutral-300">{isStation ? s.stationLabel : s.personalLabel}</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={isStation ? s.stationPlaceholder : s.personalPlaceholder}
          maxLength={40}
          className="min-h-tap rounded-card border border-neutral-300 bg-white px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500"
        />
      </label>

      {isStation ? (
        <p className="text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">{s.stationHint}</p>
      ) : null}

      {error ? (
        <p className="rounded-card bg-urgent-50 px-3 py-2 text-sm text-urgent-700 dark:bg-urgent-900/30 dark:text-urgent-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!name.trim() || isSubmitting}
        className="min-h-tap-lg rounded-card bg-primary-600 px-4 font-medium text-white transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-400"
      >
        {isSubmitting ? s.submitting : s.start}
      </button>
    </form>
  )
}

// -----------------------------------------------------------------------------
// SetupScreen 本体
// -----------------------------------------------------------------------------

type Step = 'role' | 'name'

function SetupScreen() {
  const completeSetup = useMeshStore((state) => state.completeSetup)
  const isSettingUp = useMeshStore((state) => state.isSettingUp)
  const setupError = useMeshStore((state) => state.setupError)
  const locale = useMeshStore((state) => state.locale)
  const setLocale = useMeshStore((state) => state.setLocale)
  const t = useMeshStore((state) => state.t)

  const [step, setStep] = useState<Step>('role')
  const [role, setRole] = useState<NodeRole | null>(null)
  const [name, setName] = useState('')

  const handleSelectRole = (selected: NodeRole) => {
    setRole(selected)
    setStep('name')
  }

  const handleBack = () => {
    setStep('role')
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !role) return

    const input: SetupInput =
      role === 'station' ? { mode: 'station', shelterName: trimmed } : { mode: 'personal', nodeName: trimmed }
    void completeSetup(input)
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 px-5 pb-safe pt-safe dark:bg-neutral-950">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-10">
        {/* 言語切り替えは、最初にこの画面を見た人が自分の言語をすぐ探せるよう、
            一番上の目立つ位置に置く（端末設定からの自動判定が外れていた場合の
            手動修正の入口としても機能する）。 */}
        <div className="flex justify-center">
          <LocaleSwitcher locale={locale} onChange={setLocale} label={t.localeSwitcher.label} ariaLabel={t.localeSwitcher.aria} />
        </div>

        <InstallBanner t={t} />

        <header className="flex flex-col items-center gap-3 text-center">
          <MeshMark className="h-12 w-12 text-primary-600 dark:text-primary-400" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              MeshRelief
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t.setup.tagline}</p>
          </div>
        </header>

        <div className="rounded-card bg-white p-5 shadow-card dark:bg-neutral-900">
          {step === 'role' ? (
            <RoleChoiceStep t={t} onSelect={handleSelectRole} />
          ) : (
            <NameInputStep
              t={t}
              role={role ?? 'personal'}
              name={name}
              onNameChange={setName}
              onBack={handleBack}
              onSubmit={handleSubmit}
              isSubmitting={isSettingUp}
              error={setupError}
            />
          )}
        </div>

        <p className="text-center text-xs leading-relaxed text-neutral-400 dark:text-neutral-500">{t.setup.footerNote}</p>
      </div>
    </div>
  )
}

export default SetupScreen
