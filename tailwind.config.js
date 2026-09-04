import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * MeshRelief デザインシステム
 * -----------------------------------------------------------------------
 * 方針:
 *  - 防災・避難所という文脈を最優先: 「映える」より「信頼できる／読める」
 *  - urgent（緊急）はオレンジ〜レッドで他の状態と混同しないよう明確に分離
 *  - 停電・夜間避難所を想定したダークモード（class戦略）
 *  - タップ領域は最低44px四方を厳守（spacing.tap系 / minHeight.tap系）
 *  - 実際のRGB値は src/styles/tokens.ts にも複製しており、
 *    JS/TSロジック側（優先度バッジの動的色分けなど）から参照する。
 *    ★色を変更する場合は両ファイルを必ず同期させること。
 *
 * 【taste-skill適用による配色の全面刷新（v4）】
 *  当初の配色（背景#FAF8F5＋アクセント#A6611F＋テキスト#1C1815という
 *  「暖色クリーム＋テラコッタ／琥珀＋エスプレッソ」の組み合わせ）は、
 *  taste-skillが名指しで「AIが最も多用する使い古された配色」として
 *  警告している組み合わせにほぼ一致していた。「暖色＝信頼感」という
 *  理屈で選んだつもりが、結果的に量産型のAIっぽい配色になっていた。
 *  防災・公共インフラという文脈により合う、シグナルブルー（緊急サービス・
 *  行政・防災アプリで広く使われる、機能的な信頼感を持つ色）を基調に、
 *  背景は暖色クリームではなく寒色寄りのクールニュートラル（slate系）に
 *  変更した。urgent/safeは意味を持つ状態色（警告=オレンジ赤、安全=緑）
 *  として機能が明確なため維持し、infoは新しいprimaryの青と衝突しない
 *  ようティール（青緑）に寄せた。
 * -----------------------------------------------------------------------
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ベースカラー: クールなスレート系ニュートラル（暖色クリームのAIクリシェを避けた）
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
        // ブランドカラー: シグナルブルー（防災・行政・救急サービスで広く使われる、
        // 機能的な信頼感を持つ色域。テラコッタ系のAIクリシェから転換）
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
        // 緊急度urgent: 他の状態色と明確に分離できるオレンジ〜レッド（維持）
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
        // 安全・平常状態: 落ち着いたグリーン（無事・在庫充足など。維持）
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
        // 情報提示用（避難所情報カード、メッセージ本文の引用枠など）: ティール
        // （primaryが青になったため、混同を避けteal寄りに変更）
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
      },
      fontFamily: {
        // 完全オフライン運用が前提のため、Webフォント(CDN)には依存しない。
        // Android/Windows/macOS/iOSがそれぞれ標準搭載する日本語フォントの
        // フォールバックスタックのみで構成する（index.htmlにフォントCDN linkは置かない）。
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Hiragino Sans"',
          '"Hiragino Kaku Gothic ProN"',
          '"Noto Sans JP"',
          '"Yu Gothic"',
          'Meiryo',
          ...defaultTheme.fontFamily.sans,
        ],
      },
      fontSize: {
        // 夜間・高ストレス下でも読めるよう、行間を広めに取ったタイプスケール
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.875rem', { lineHeight: '1.6' }],
        base: ['1rem', { lineHeight: '1.7' }],
        lg: ['1.125rem', { lineHeight: '1.7' }],
        xl: ['1.25rem', { lineHeight: '1.6' }],
        '2xl': ['1.5rem', { lineHeight: '1.5' }],
        '3xl': ['1.875rem', { lineHeight: '1.4' }],
      },
      spacing: {
        // タップ領域は最低44px四方（Apple HIG / Material両基準）を明示的なトークンとして用意
        tap: '2.75rem', // 44px
        'tap-lg': '3rem', // 48px（主要CTA・送信/受信ボタン等）
        'nav-height': '4.25rem', // 下部固定ナビ（5タブ）の高さ
      },
      minHeight: {
        tap: '2.75rem',
        'tap-lg': '3rem',
      },
      minWidth: {
        tap: '2.75rem',
        'tap-lg': '3rem',
      },
      maxWidth: {
        // 「スマホ1台分」の画面幅の基準値。タブレット/PCの広い画面でも
        // このアプリはスマホ相当のカラムを中央に固定表示する方針
        // （taste-skillセッションでのレスポンシブ点検により導入。
        // src/ui/App.tsx のヘッダー/本文と、BottomNav.tsx のタブ列を
        // 必ず同じ値で揃えること。値自体はTailwindのmax-w-mdと同じ28rem）。
        app: '28rem',
      },
      borderRadius: {
        card: '0.875rem',
      },
      boxShadow: {
        // 影の色はneutral-900（純黒ではない）にティントし、なじみを良くする
        card: '0 1px 2px 0 rgb(25 29 33 / 0.06), 0 1px 3px 0 rgb(25 29 33 / 0.08)',
        elevated: '0 4px 12px -2px rgb(25 29 33 / 0.15)',
      },
      zIndex: {
        // レイヤー管理: BottomNav / Toast / Scanner等の重なり順を一元管理
        bottomNav: '40',
        toast: '50',
        modalBackdrop: '60',
        modal: '70',
        scannerOverlay: '80',
      },
    },
  },
  plugins: [
    // ノッチ付き端末向け: 下部固定ナビ用のセーフエリア対応ユーティリティ
    function safeAreaPlugin({ addUtilities, theme }) {
      addUtilities({
        '.pt-safe': { paddingTop: 'env(safe-area-inset-top)' },
        '.pb-safe': { paddingBottom: 'env(safe-area-inset-bottom)' },
        // 下部固定ナビの高さ分＋セーフエリア分を確保する（本文がナビに隠れないように）
        '.pb-safe-nav': {
          paddingBottom: `calc(${theme('spacing.nav-height')} + env(safe-area-inset-bottom))`,
        },
      })
    },
  ],
}
