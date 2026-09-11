/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// MeshRelief — Vite設定（最終調整版 / 実装計画書 v2 §4 PWA配布戦略）
//
// 方針:
//  - 完全オフライン運用が前提のアプリのため、PWAは「平時インストール推奨」戦略
//    （§4.2 戦略1）に沿って積極的にプリキャッシュする。
//  - 2台のスマホ実機間でQR同期をテストできるよう、開発サーバーはLAN上に公開する
//    （server.host: true）。
//  - Vitestの設定はこのファイルに同居させる（vitest/config の型参照のみ利用し、
//    defineConfigはvite本体のものを使うことで、Viteプラグインの型と衝突しない
//    現行の推奨パターンに従う）。
//
// 【このセッションでの変更点】
//  - manifest: false にし、vite-plugin-pwaによるmanifest.webmanifestの
//    自動生成をやめた。代わりに public/manifest.json を手書きの静的
//    ファイルとして用意し、index.html から明示的に参照する形にした
//    （依頼が「public/manifest.json」という具体的なファイル名を指定して
//    いたため、生成物ではなく実体のあるファイルとして用意した）。
//  - workbox.globPatterns に json を追加（manifest.jsonもプリキャッシュ
//    対象に含める）。
//  - prompt更新戦略を明示。registerType:'prompt' と
//    組み合わせ、新しいService Workerが即座に有効化されるようにする
//    （完全オフライン運用中に「更新はあるが古い版のまま動き続ける」
//    状態を避けるため）。
//  - §4.2 戦略3「単一HTMLファイル配布」用のbuildオプションを、
//    コメントアウトした状態で用意した（通常運用では戦略1のPWAとして
//    ビルドし、AirDrop/Bluetooth/USBメモリでの物理配布が必要になった
//    場合にのみ有効化して別途ビルドする想定）。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // 独自のpublic/manifest.jsonを使うため、プラグインによる自動生成は無効化する
      manifest: false,
      // publicディレクトリ内の「JSから直接importされないが必要なファイル」を明示する。
      // アイコンは maskable/any 兼用のため icon-512.png を1つだけ用意する運用にしている
      // （public/icon-source.svg のコメント参照）。
      includeAssets: ['favicon.svg', 'favicon.ico', 'icon-192.png', 'icon-512.png', 'manifest.json'],
      // 開発中でもオフライン時の挙動・Service Workerの更新フローを確認できるようにする
      devOptions: {
        enabled: true,
        type: 'module',
      },
      workbox: {
        // 完全オフライン運用が前提のため、ビルド成果物一式をあらかじめ全てキャッシュする
        // （= プリキャッシュされたアセットは常にキャッシュから配信される「キャッシュ優先」の
        // 挙動になる。このアプリは外部APIを一切呼ばないため、追加のruntimeCachingルールは
        // 不要と判断した）。
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2,json}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // 新しいService Workerは待機させ、業務完了後に更新する（registerType:'prompt'と対）。
        // オフライン運用中でも、次回オンライン復帰時や再訪問時に業務中の強制切替を避けるようにする
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  resolve: {
    alias: {
      // import ... from '@/engine/mesh' のような絶対パスライクなimportを可能にする
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // LAN上の実機（スマホ2台）からアクセスし、QR差分同期を実機で検証するため
    host: true,
    port: 5173,
  },
  // build: {
  //   // §4.2 戦略3「単一HTMLファイル配布（究極のフォールバック）」
  //   // 通常はコメントアウトしたままにする。全JS/CSSを1つのHTMLファイルに
  //   // インライン化し、AirDrop/Bluetooth/USBメモリで物理配布する必要が
  //   // 生じた場合にのみ有効化して別ビルドする（この構成にすると通常の
  //   // マルチファイルPWAとしてのインストール導線=戦略1とは両立しない）。
  //   // 有効化する場合は `vite-plugin-singlefile` 等の追加、または下記の
  //   // rollupOptions単体でどこまでインライン化できるか要検証。
  //   // file://での直接オープンではカメラAPIが使えない場合があるため、
  //   // このモードではテキストペースト同期のみが動作する前提（§4.2）。
  //   rollupOptions: {
  //     output: {
  //       inlineDynamicImports: true,
  //     },
  //   },
  // },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
