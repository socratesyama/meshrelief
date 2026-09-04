/**
 * MeshRelief デザイントークン（実行時参照用）
 * =============================================================================
 * tailwind.config.js の theme.extend.colors と同じ値を、実行時のTS/JSロジック
 * から参照できる形で保持したもの。
 *
 * 用途例（次回以降のセッションで使用予定）:
 *  - AnimatedQR / QRScanner の枠線・進捗インジケーター色を状態に応じて動的に変更
 *  - qrcode.react の bgColor/fgColor など、Canvas/SVGへ直接渡す色指定
 *  - Priority(優先度) や SafetyStatus(安否) に応じたバッジ色の動的な出し分け
 *
 * ⚠️ 重要: この値は tailwind.config.js の色定義の複製です。
 *   Tailwindのconfigはビルド時（Node）でしか読み込めず、ブラウザ実行時の
 *   ロジックからは参照できないため、あえて値を重複させています。
 *   色を変更する際は、必ず tailwind.config.js とこのファイルの両方を
 *   更新してください（今後のセッションで変更する場合も同様）。
 * =============================================================================
 */

import type { Priority, SafetyStatus, ShelterStatus } from '../types'

export const colors = {
  // ベースカラー: クールなスレート系ニュートラル（tailwind.config.js v4と同一値）
  neutral: {
    50: '#F6F7F8',
    100: '#ECEEF0',
    200: '#DBDFE3',
    300: '#C0C6CC',
    400: '#969FA8',
    500: '#6E7680',
    600: '#525A63',
    700: '#3C424A',
    800: '#282D33',
    900: '#191D21',
    950: '#0F1113',
  },
  // ブランドカラー: シグナルブルー（防災・行政・救急サービス系の配色。tailwind.config.js v4と同一値）
  primary: {
    50: '#EEF4FC',
    100: '#D9E8F8',
    200: '#AECDEF',
    300: '#7BACE2',
    400: '#4488D1',
    500: '#2569B8',
    600: '#1B529A',
    700: '#17417B',
    800: '#143561',
    900: '#112B4D',
  },
  urgent: {
    50: '#FFF3EC',
    100: '#FFE1D0',
    200: '#FFC2A1',
    300: '#FF9D6E',
    400: '#FF7640',
    500: '#F04E23',
    600: '#D93613',
    700: '#B02A10',
    800: '#862112',
    900: '#5C1A11',
  },
  safe: {
    50: '#EEF7EE',
    100: '#D7EDD8',
    200: '#AFDAB2',
    300: '#82C187',
    400: '#57A75F',
    500: '#368C40',
    600: '#297033',
    700: '#21572A',
    800: '#1B4423',
    900: '#15351B',
  },
  // 情報提示用: ティール（primaryが青になったため衝突を避けteal寄りに。tailwind.config.js v4と同一値）
  info: {
    50: '#EAFAF8',
    100: '#CCF1EC',
    200: '#99E1D8',
    300: '#5FC9BC',
    400: '#34AC9E',
    500: '#228C81',
    600: '#1C7168',
    700: '#1A5B54',
    800: '#194A45',
    900: '#183D3A',
  },
} as const

/** タップ領域（44px四方以上を厳守。48pxは主要CTA向けの推奨値）。 */
export const tapSize = {
  min: 44,
  comfortable: 48,
} as const

/** 下部固定ナビゲーション（5タブ）関連のレイアウト定数。 */
export const bottomNav = {
  heightPx: 68,
  tabs: ['safety', 'supply', 'shelter', 'message', 'peer'] as const,
} as const

export type BottomNavTab = (typeof bottomNav.tabs)[number]

/** 優先度 → 色トークンのマッピング（バッジ・アイコン等で使用）。 */
export const priorityColor: Record<Priority, string> = {
  normal: colors.neutral[400],
  urgent: colors.urgent[500],
}

/** 安否ステータス → 色トークンのマッピング。 */
export const safetyStatusColor: Record<SafetyStatus, string> = {
  safe: colors.safe[500],
  injured: colors.urgent[500],
  needs_help: colors.urgent[400],
  unknown: colors.neutral[400],
}

/** 避難所ステータス → 色トークンのマッピング。 */
export const shelterStatusColor: Record<ShelterStatus, string> = {
  open: colors.safe[500],
  limited: colors.primary[400],
  full: colors.urgent[400],
  closed: colors.neutral[500],
}

/** z-indexレイヤー（tailwind.config.jsのtheme.extend.zIndexと対応）。 */
export const zLayers = {
  bottomNav: 40,
  toast: 50,
  modalBackdrop: 60,
  modal: 70,
  scannerOverlay: 80,
} as const
