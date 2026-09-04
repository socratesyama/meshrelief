/**
 * MeshRelief — エントリーポイント
 * =============================================================================
 * 付録チェックリスト「src/main.tsx — エンジン初期化フロー」に対応。
 *
 * フロー:
 *   1. マウント時に store.initialize() を呼び、MeshReliefEngine.restore()
 *      で永続化済みアイデンティティ（nodeId/nodeName/nodeRole/hmacKey等,
 *      storage/db.ts の meta ストア）の復元を試みる。
 *   2. 復元できなければ SetupScreen を表示する。SetupScreenでの入力→
 *      completeSetup() 経由で MeshReliefEngine.create() が呼ばれ、
 *      新規のCryptoKey（HMAC鍵）が生成された上で即座に storage/db.ts の
 *      meta ストアへ永続化される
 *      （mesh.ts の create()/persistIdentity()、db.ts の saveIdentity() 参照）。
 *   3. エンジンの準備ができたら（復元 or 新規作成のいずれでも）
 *      `src/ui/App.tsx` を描画する。
 *
 * 【App.tsxへの切り出し】前回セッションまでは、ここに直接
 * `MainAppPlaceholder` という暫定コンポーネントを書いていたが、
 * BottomNav・各Panelが揃った今回、予告通り `src/ui/App.tsx` として
 * 正式に切り出した。main.tsxは「エンジン初期化フローの入り口」という
 * 責務に専念し、実際の画面構成はApp.tsx側が持つ。
 * 【6-5対応】main.tsxのレンダリング開始前に initializeTheme() を1度呼び、
 * <html>要素へのdarkクラスの付け外しを開始する（src/ui/theme.ts参照）。
 * これが無かったため、tailwind.config.jsのdarkMode:'class'設定と各
 * コンポーネントのdark:バリアントが事実上デッドコードになっていた。
 * =============================================================================
 */

import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useMeshStore } from './ui/store'
import SetupScreen from './ui/components/SetupScreen'
import App from './ui/App'
import { initializeTheme } from './ui/theme'
import './styles/index.css'

initializeTheme()

function LoadingScreen() {
  const t = useMeshStore((state) => state.t)
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{t.common.loading}</p>
    </div>
  )
}

function Root() {
  const phase = useMeshStore((state) => state.phase)
  const initialize = useMeshStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (phase === 'loading') return <LoadingScreen />
  if (phase === 'needs-setup') return <SetupScreen />
  return <App />
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('main.tsx: #root 要素が見つかりません（index.htmlを確認してください）')
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
