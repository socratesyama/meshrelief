/**
 * MeshRelief — 表示言語の永続化
 * =============================================================================
 * 表示言語は「同期される安否/避難所データ」ではなく、端末ごとのUI設定
 * （docs/DECISIONS.md参照）。そのため、CRDTエンジンが管理する
 * storage/db.ts（IndexedDB）ではなく、より単純で同期不要なlocalStorageに
 * 保存する。IndexedDBと違って読み込みが同期的に完了するため、
 * SetupScreen表示前や、そもそもエンジンの初期化が終わる前の
 * 一番最初の画面（main.tsxのローディング表示）でも、選択済みの言語を
 * 即座に反映できる。
 * =============================================================================
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, detectLocale, type Locale } from './index'

const STORAGE_KEY = 'meshrelief:locale'

function isSupportedLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** 保存済みの手動選択があればそれを、無ければ端末設定から自動判定した言語を返す。 */
export function loadInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isSupportedLocale(saved)) return saved
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない場合は自動判定にフォールバック
  }
  return detectLocale() ?? DEFAULT_LOCALE
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // 保存できなくても、その場でのUI言語切り替え自体は継続させる
  }
}
