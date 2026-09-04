/**
 * MeshRelief — common/Toast
 * トースト通知の表示専用コンポーネント。状態管理（表示/自動消去タイマー）
 * は `src/ui/hooks/useToast.ts` が担当し、このコンポーネントは
 * `message` を渡されたら表示するだけの純粋な見た目のみを持つ。
 *
 * 注記: StationScreen.tsxは常時ダーク基調固定というこの画面固有の事情
 * （キオスク的な設置画面で、アプリ全体のライト/ダーク設定に連動させない
 * 意図的な設計。詳細はStationScreen.tsx冒頭のコメント参照）により、
 * 本コンポーネントの`dark:`前提の配色とは相容れないため、引き続き
 * 独自のトーストUIをインラインで持つ。PeerPanel.tsxは本コンポーネントへの
 * 移行が完了済み（taste-skill適用セッションでSafety/Supply/Shelter/
 * Messageの4パネルと同じ経路に揃えた）。
 */

export interface ToastProps {
  message: string | null
}

export default function Toast({ message }: ToastProps) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-toast flex justify-center px-4">
      <div className="rounded-card bg-neutral-900 px-4 py-2 text-sm text-white shadow-elevated dark:bg-neutral-100 dark:text-neutral-900">
        {message}
      </div>
    </div>
  )
}
