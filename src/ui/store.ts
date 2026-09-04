/**
 * MeshRelief — Zustand store
 * =============================================================================
 * UI（React）とMeshReliefEngineをつなぐ唯一の窓口。
 * 付録チェックリスト「src/ui/store.ts — engine参照, SyncStatus状態」に対応。
 * 加えてUI状態（activeTab）と、v3要件のnodeRole状態も一元管理する。
 *
 * 設計判断メモ:
 *
 *  - engineの`onEntriesChange`/`onSyncStatusChange`コールバックをここで
 *    購読し、storeの`entries`/`syncStatus`へ反映する。createRecord等の
 *    store側ラッパーは、engineを呼ぶだけで自分でstateを更新しない
 *    （コールバック経由で自動的に反映されるため。二重更新を避ける設計）。
 *
 *  - `initialize()`はReactの StrictMode（開発時のuseEffect二重実行）で
 *    2回呼ばれても`MeshReliefEngine.restore()`を2回実行しないよう、
 *    モジュールスコープの簡易フラグ（`restoreStarted`）でガードしている。
 *
 *  - v3要件「個人/ステーション選択」: `completeSetup()`が
 *    `{mode:'personal', nodeName}` / `{mode:'station', shelterName}` を
 *    受け取り、後者の場合は `MeshReliefEngine.create(shelterName, 'station')`
 *    に加えて、その避難所自体をShelterRecordとして自動登録し、
 *    `engine.setHomeShelterId()` で紐づける（mesh.ts実装セッションで
 *    追加した「自ノードのshelterId」の概念を、ステーションモードでは
 *    "そのステーションが設置されている避難所" として自然に埋める）。
 *
 *  - `locale`（表示言語）はi18n対応セッションで追加。安否/避難所データと
 *    違い、これはCRDTで同期される「データ」ではなく端末ごとのUI設定
 *    なので、engineとは完全に独立させ、`src/i18n/persistence.ts`
 *    （localStorage）で永続化している。IndexedDBと違い読み込みが
 *    同期的なので、`initialize()`が完了する前の最初の画面
 *    （main.tsxのローディング表示やSetupScreen）でも、選択済みの言語を
 *    ストアの初期値として即座に反映できる。
 * =============================================================================
 */

import { create } from 'zustand'
import { MeshReliefEngine } from '../engine/mesh'
import type { BottomNavTab } from '../styles/tokens'
import { type Locale, getDictionary, type Dict } from '../i18n'
import { loadInitialLocale, persistLocale } from '../i18n/persistence'
import type {
  CRDTEntry,
  DataRecord,
  DataRecordPatch,
  NodeRole,
  RecordId,
  RecordType,
  SyncStatus,
} from '../types'

export type SetupInput = { mode: 'personal'; nodeName: string } | { mode: 'station'; shelterName: string }

const EMPTY_SYNC_STATUS: SyncStatus = {
  lastSyncAt: null,
  lastSyncMethod: null,
  lastSyncEntryCount: 0,
  pendingCount: 0,
  peerCount: 0,
}

export interface MeshStoreState {
  // --- 初期化フェーズ ---------------------------------------------------
  phase: 'loading' | 'needs-setup' | 'ready'
  setupError: string | null
  isSettingUp: boolean

  // --- エンジン参照 -------------------------------------------------------
  engine: MeshReliefEngine | null

  // --- ノード情報（engineから複製。リアクティブ表示用） ------------------
  nodeId: string | null
  nodeName: string | null
  nodeRole: NodeRole
  homeShelterId: RecordId | null

  // --- UI状態 --------------------------------------------------------------
  activeTab: BottomNavTab
  /** 表示言語。端末設定からの自動判定 or 手動選択（src/i18n/persistence.ts）。 */
  locale: Locale
  /** 現在のlocaleに対応する翻訳辞書。localeを直接読むのではなく、
   *  基本的にコンポーネントからはこの`t`経由で文言を参照する。 */
  t: Dict

  // --- データ / 同期状態 ----------------------------------------------------
  entries: CRDTEntry[]
  syncStatus: SyncStatus

  // --- actions --------------------------------------------------------------
  /** アプリ起動時に一度だけ呼ぶ。永続化済みならready、無ければneeds-setupへ。 */
  initialize: () => Promise<void>
  /** SetupScreenからの初回セットアップ完了時に呼ぶ。 */
  completeSetup: (input: SetupInput) => Promise<void>
  setActiveTab: (tab: BottomNavTab) => void
  /** 表示言語を手動で切り替える。localStorageにも永続化する。 */
  setLocale: (locale: Locale) => void
  setNodeRole: (role: NodeRole) => Promise<void>
  setHomeShelterId: (shelterId: RecordId | null) => Promise<void>
  createRecord: (data: DataRecord) => Promise<CRDTEntry>
  updateRecord: (id: RecordId, patch: DataRecordPatch) => Promise<void>
  deleteRecord: (id: RecordId) => Promise<void>
  /** getEntries(type?)相当。Panelコンポーネントから直接呼べる参照系ヘルパー。 */
  getEntriesByType: (type?: RecordType) => CRDTEntry[]
}

/** StrictModeでのuseEffect二重実行対策。同一モジュール内で一度だけrestoreする。 */
let restoreStarted = false

/** アプリ起動時（モジュール読み込み時）に一度だけ計算する初期表示言語。 */
const initialLocale: Locale = loadInitialLocale()

export const useMeshStore = create<MeshStoreState>((set, get) => {
  function attachEngine(engine: MeshReliefEngine): void {
    engine.onEntriesChange = (entries) => set({ entries })
    engine.onSyncStatusChange = (syncStatus) => set({ syncStatus })

    set({
      engine,
      phase: 'ready',
      isSettingUp: false,
      setupError: null,
      nodeId: engine.nodeId,
      nodeName: engine.nodeName,
      nodeRole: engine.nodeRole,
      homeShelterId: engine.homeShelterId,
      entries: engine.getEntries(),
      syncStatus: engine.getSyncStatus(),
    })
  }

  return {
    phase: 'loading',
    setupError: null,
    isSettingUp: false,

    engine: null,

    nodeId: null,
    nodeName: null,
    nodeRole: 'personal',
    homeShelterId: null,

    activeTab: 'safety',
    locale: initialLocale,
    t: getDictionary(initialLocale),

    entries: [],
    syncStatus: EMPTY_SYNC_STATUS,

    async initialize() {
      if (restoreStarted) return
      restoreStarted = true

      const engine = await MeshReliefEngine.restore()
      if (!engine) {
        set({ phase: 'needs-setup' })
        return
      }
      attachEngine(engine)
    },

    async completeSetup(input) {
      set({ isSettingUp: true, setupError: null })
      try {
        if (input.mode === 'personal') {
          const engine = await MeshReliefEngine.create(input.nodeName, 'personal')
          attachEngine(engine)
        } else {
          const engine = await MeshReliefEngine.create(input.shelterName, 'station')
          // ステーションが設置されている避難所自体を、避難所情報として自動登録する
          const shelterEntry = await engine.createRecord({
            type: 'shelter',
            name: input.shelterName,
            status: 'open',
          })
          await engine.setHomeShelterId(shelterEntry.id)
          attachEngine(engine)
        }
      } catch (err) {
        set({
          isSettingUp: false,
          setupError: err instanceof Error ? err.message : String(err),
        })
      }
    },

    setActiveTab(tab) {
      set({ activeTab: tab })
    },

    setLocale(locale) {
      persistLocale(locale)
      set({ locale, t: getDictionary(locale) })
    },

    async setNodeRole(role) {
      const engine = get().engine
      if (!engine) return
      await engine.setNodeRole(role)
      set({ nodeRole: engine.nodeRole })
    },

    async setHomeShelterId(shelterId) {
      const engine = get().engine
      if (!engine) return
      await engine.setHomeShelterId(shelterId)
      set({ homeShelterId: engine.homeShelterId })
    },

    async createRecord(data) {
      const engine = get().engine
      if (!engine) throw new Error('createRecord: エンジンが初期化されていません')
      // entriesの更新はengine.onEntriesChange経由で自動的にstoreへ反映される
      return engine.createRecord(data)
    },

    async updateRecord(id, patch) {
      const engine = get().engine
      if (!engine) throw new Error('updateRecord: エンジンが初期化されていません')
      await engine.updateRecord(id, patch)
    },

    async deleteRecord(id) {
      const engine = get().engine
      if (!engine) throw new Error('deleteRecord: エンジンが初期化されていません')
      await engine.deleteRecord(id)
    },

    getEntriesByType(type) {
      const engine = get().engine
      return engine ? engine.getEntries(type) : []
    },
  }
})
