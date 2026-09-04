/**
 * MeshReliefEngine スモークテスト
 * =============================================================================
 * 網羅的なユニットテストではなく、「モジュールを繋いだ結果、意図通りの
 * エンドツーエンドの流れが動くか」を確認するための最小限の確認スクリプト。
 *
 * 3ケース:
 *  1. ローカルCRUD（createRecord/updateRecord/deleteRecord/getEntries）
 *  2. QR差分同期のフルフロー（vectorClock QR → 差分抽出 → Animated QR →
 *     連続スキャン → マージ）と、v3要件の scope絞り込み / decideRole
 *  3. 永続化からの復元（create → restore）
 *
 * 【重要】ケース2は `MeshReliefEngine.createEphemeral()` を使い、ストレージに
 * 一切触れずに2台の端末（nodeA/nodeB）をシミュレートしている。
 * storage/db.ts の meta ストアは単一レコードのため、同一プロセス内で
 * `create()` を複数回呼ぶと後勝ちで上書きされてしまうため（詳細は
 * mesh.tsファイル冒頭コメント参照）。
 *
 * entries ストア自体はケース間で共有される（fake-indexeddbはプロセス内で
 * 永続化される単一のインメモリDB）ため、各テストの先頭で clearAllEntries()
 * している。
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { MeshReliefEngine } from './mesh'
import { QRCodec } from '../comm/qr-codec'
import { clearAllEntries } from '../storage/db'
import type { VectorClock } from '../types'

const codec = new QRCodec()

/** vectorClock QR文字列から中身のVectorClockだけ取り出す小さなヘルパー。 */
function decodeVc(vcQR: string): VectorClock {
  return codec.decodeVectorClock(vcQR).vectorClock
}

beforeEach(async () => {
  await clearAllEntries()
})

describe('MeshReliefEngine スモークテスト', () => {
  it('ローカルCRUDが一通り動作する', async () => {
    const engine = await MeshReliefEngine.createEphemeral('たなか')

    const created = await engine.createRecord({
      type: 'safety',
      name: 'たなか',
      status: 'safe',
    })
    expect(engine.getEntries('safety')).toHaveLength(1)
    expect(engine.getEntries('safety')[0]?.id).toBe(created.id)

    // DataRecordPatch修正の確認: レコード種別固有のフィールド(status)も更新できる
    await engine.updateRecord(created.id, { status: 'needs_help', priority: 'urgent' })
    const updated = engine.getEntries('safety')[0]
    expect(updated?.data).toMatchObject({ status: 'needs_help', priority: 'urgent' })

    await engine.deleteRecord(created.id)
    // tombstone化されたエントリはgetEntriesの結果から除外される
    expect(engine.getEntries('safety')).toHaveLength(0)
    expect(engine.getEntries()).toHaveLength(0)
  })

  it('QR差分同期のフルフローが完了し、双方の状態が収束する（scope絞り込み・decideRole込み）', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    await nodeA.createRecord({ type: 'safety', name: 'たなか', status: 'safe' })
    await nodeA.createRecord({
      type: 'supply',
      itemName: '水',
      quantity: 10,
      unit: '本',
      priority: 'urgent',
    })
    await nodeA.createRecord({
      type: 'message',
      authorName: 'たなか',
      body: '道路が冠水しています',
      shelterId: 'shelter-other', // nodeAのhomeShelterIdとは異なる避難所
    })

    // --- decideRole: 同期前は「Aが送るべき」と判定されること ---
    const bVcQrBeforeSync = nodeB.generateVectorClockQR()
    expect(nodeA.decideRole(decodeVc(bVcQrBeforeSync))).toBe('send')
    expect(nodeB.decideRole(decodeVc(nodeA.generateVectorClockQR()))).toBe('receive')

    // --- v3要件1: scope='default'（省略時）は urgent以外・他避難所のメッセージを除外する ---
    const defaultBundle = await nodeA.prepareDiffBundle(bVcQrBeforeSync)
    expect(defaultBundle.entryCount).toBe(1)
    expect(defaultBundle.entries[0]?.data).toMatchObject({ priority: 'urgent' })

    // --- scope='all': フィルタなしで全件 ---
    const bundle = await nodeA.prepareDiffBundle(bVcQrBeforeSync, 'all')
    expect(bundle.entryCount).toBe(3)

    // --- Animated QR化 → 連続スキャン ---
    const frames = await nodeA.generateAnimatedQR(bundle)
    expect(frames.length).toBeGreaterThan(0)

    let lastResult
    for (const frame of frames) {
      lastResult = await nodeB.ingestQRFrame(frame)
      expect(lastResult.error).toBeUndefined()
    }
    expect(lastResult?.complete).toBe(true)

    // --- Bの状態がAと一致しているか ---
    expect(nodeB.getEntries()).toHaveLength(3)
    expect(nodeB.getEntries('supply')[0]?.data).toMatchObject({ priority: 'urgent' })

    // --- 収束確認: 同期後はsynced ---
    const aVcAfterSync = nodeA.generateVectorClockQR()
    expect(nodeB.decideRole(decodeVc(aVcAfterSync))).toBe('synced')
  })

  it('永続化からの復元（create → restore）でエントリと識別情報が引き継がれる', async () => {
    const engine = await MeshReliefEngine.create('さとう', 'station')
    const nodeId = engine.nodeId
    await engine.setHomeShelterId('shelter-1')
    await engine.createRecord({ type: 'shelter', name: '第一小学校体育館', status: 'open' })

    const restored = await MeshReliefEngine.restore()

    expect(restored).not.toBeNull()
    expect(restored?.nodeId).toBe(nodeId)
    expect(restored?.nodeName).toBe('さとう')
    expect(restored?.nodeRole).toBe('station')
    expect(restored?.homeShelterId).toBe('shelter-1')
    expect(restored?.getEntries('shelter')).toHaveLength(1)
    expect(restored?.getEntries('shelter')[0]?.data).toMatchObject({ name: '第一小学校体育館' })
  })

  it('ステーションモード: startStationLoopで同期完了イベントが発火し続ける', async () => {
    const station = await MeshReliefEngine.createEphemeral('受付ステーション', 'station')
    const visitor = await MeshReliefEngine.createEphemeral('来訪者1')
    await visitor.createRecord({ type: 'safety', name: '来訪者1', status: 'safe' })

    const events: Array<{ fromNodeName: string; mergedCount: number }> = []
    station.startStationLoop((event) => {
      events.push({ fromNodeName: event.fromNodeName, mergedCount: event.mergedCount })
    })
    expect(station.isStationLoopActive()).toBe(true)

    const vcQR = station.generateVectorClockQR()
    // station宛のprepareDiffBundleはnodeRoleがstationでない側(visitor)から見た話ではないため、
    // ここではvisitor→stationへ送る想定でvisitor側がbundleを用意する
    const bundle = await visitor.prepareDiffBundle(vcQR, 'all')
    const frames = await visitor.generateAnimatedQR(bundle)
    for (const frame of frames) {
      await station.ingestQRFrame(frame)
    }

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ fromNodeName: '来訪者1', mergedCount: 1 })
    expect(station.getEntries('safety')).toHaveLength(1)

    station.stopStationLoop()
    expect(station.isStationLoopActive()).toBe(false)
  })
})
