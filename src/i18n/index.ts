/**
 * MeshRelief — i18nコア
 * =============================================================================
 * 対応ロケールの一覧、端末設定からの自動判定、辞書の取得をまとめる。
 * 表示言語は「同期される安否/避難所データ」とは完全に独立した、
 * 端末ごとのUI設定として扱う（詳細はsrc/ui/store.tsのコメント参照）。
 * =============================================================================
 */
import { ja, type Dict } from './locales/ja'
import { jaEasy } from './locales/jaEasy'
import { en } from './locales/en'
import { zh } from './locales/zh'
import { ko } from './locales/ko'

export type { Dict }

export const SUPPORTED_LOCALES = ['ja', 'ja-easy', 'en', 'zh', 'ko'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ja'

/** 言語切り替えUIに出す、各言語での自称（他の言語のUIで表示していても分かるように）。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  ja: '日本語',
  'ja-easy': 'やさしい にほんご',
  en: 'English',
  zh: '中文',
  ko: '한국어',
}

const DICTIONARIES: Record<Locale, Dict> = {
  ja,
  'ja-easy': jaEasy,
  en,
  zh,
  ko,
}

export function getDictionary(locale: Locale): Dict {
  return DICTIONARIES[locale] ?? ja
}

/**
 * 「やさしい日本語」は端末の言語設定として存在しないため自動判定の対象にせず、
 * 手動での切り替えでのみ選べるようにする。それ以外の4言語は
 * navigator.languages（優先順位付きの言語リスト）から先頭一致で判定する。
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const candidates = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language]

  for (const raw of candidates) {
    if (!raw) continue
    const base = raw.toLowerCase().split('-')[0]
    if (base === 'ja') return 'ja'
    if (base === 'en') return 'en'
    if (base === 'zh') return 'zh'
    if (base === 'ko') return 'ko'
  }
  return DEFAULT_LOCALE
}

/** Intl.DateTimeFormat等に渡す、ロケールごとのBCP47言語タグ。 */
export const INTL_LOCALE_TAG: Record<Locale, string> = {
  ja: 'ja-JP',
  'ja-easy': 'ja-JP',
  en: 'en-US',
  zh: 'zh-CN',
  ko: 'ko-KR',
}

/** Array.prototype.sort等での文字列比較（言語ごとの並び順）に使うベース言語コード。 */
export const COLLATION_LOCALE: Record<Locale, string> = {
  ja: 'ja',
  'ja-easy': 'ja',
  en: 'en',
  zh: 'zh',
  ko: 'ko',
}
