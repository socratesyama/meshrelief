/**
 * MeshRelief — テーマ（ダークモード）
 * =============================================================================
 * ロードマップ6-5「tailwind.config.jsはdarkMode:'class'で、各コンポーネントに
 * dark:バリアントのクラスが大量に書かれているが、<html>要素にdarkクラスを
 * 付与する処理がコードのどこにも存在しない」への対応。
 *
 * 【6-5修正】これまで`dark:`クラス群は事実上デッドコードだった。本モジュールは
 * `document.documentElement.classList`に`dark`を付け外しする「実際に効かせる」
 * 処理を提供する。
 *
 * 設計判断メモ:
 *  - 既定は「端末設定に従う（'system'）」。`window.matchMedia
 *    ('(prefers-color-scheme: dark)')`を購読し、OS側の設定変更にも
 *    リアルタイムに追従する（避難所では日中/夜間で端末設定を切り替える
 *    運用が想定されるため、起動時の一度きりの判定では不十分）。
 *  - ロードマップの「余裕があれば」の提案通り、設定画面から
 *    「端末設定に従う/常にライト/常にダーク」を選べるよう、選択自体は
 *    localStorageに永続化する。表示言語（src/i18n/persistence.ts）と
 *    同じく「同期されるデータ」ではなく端末ごとのUI設定のため、
 *    IndexedDB（CRDTエンジン）ではなくlocalStorageに保存する設計を踏襲した。
 *  - localStorageが使えない環境（プライベートブラウジング等の一部ブラウザ）
 *    でも例外で落ちないよう、読み書きは必ずtry/catchで囲む。
 * =============================================================================
 */

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'meshrelief:theme'

function readStoredPreference(): ThemePreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null
  } catch {
    return null
  }
}

function writeStoredPreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // localStorageが使えない環境ではメモリ上の状態のみで動作継続する
  }
}

function prefersDarkBySystem(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyDarkClass(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
}

let currentPreference: ThemePreference = readStoredPreference() ?? 'system'
let mediaQuery: MediaQueryList | null = null

function resolveAndApply(): void {
  const isDark = currentPreference === 'system' ? prefersDarkBySystem() : currentPreference === 'dark'
  applyDarkClass(isDark)
}

/**
 * アプリ起動時に一度だけ呼ぶ。現在の設定（保存済み設定 or 'system'）を
 * 即座に適用し、'system'選択時はOS設定の変更も継続して反映するよう
 * リスナーを登録する。
 */
export function initializeTheme(): void {
  resolveAndApply()
  if (mediaQuery) return // StrictMode等での二重初期化を防ぐ
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (currentPreference === 'system') resolveAndApply()
  })
}

/** 現在の設定（'system' | 'light' | 'dark'）を返す。設定画面での表示用。 */
export function getThemePreference(): ThemePreference {
  return currentPreference
}

/** 設定画面から呼ばれる。設定を変更し、即座に反映・永続化する。 */
export function setThemePreference(pref: ThemePreference): void {
  currentPreference = pref
  writeStoredPreference(pref)
  resolveAndApply()
}
