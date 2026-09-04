/**
 * MeshReliefEngine — §9.3シナリオの自動化テスト + v3追加要件のテスト
 * =============================================================================
 * 実装計画書 v2 §9.3の手動テスト表のうち、自動化可能な
 * 「QR差分同期」「QR差分再同期」を検証する。あわせてv3追加要件
 * （スコープ絞り込み・decideRole・ステーションモードの無条件マージ）
 * も検証する。
 *
 * mesh.smoke.test.tsとの役割分担:
 *  - mesh.smoke.test.ts: モジュールを繋いだ結果が動くかの最小限の確認
 *  - mesh.test.ts（本ファイル）: §9.3のシナリオ・v3要件を1項目ずつ
 *    明示的に検証する、より網羅的なテスト
 *
 * `MeshReliefEngine.createEphemeral()` を使う理由、各テスト冒頭で
 * `clearAllEntries()` している理由は mesh.smoke.test.ts のファイル
 * 冒頭コメントを参照（storage/db.tsのmetaストアが単一レコードのため、
 * 同一プロセス内で複数「端末」をシミュレートするテストでは
 * `create()`ではなく`createEphemeral()`を使う）。
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { MeshReliefEngine } from './mesh'
import { QRCodec } from '../comm/qr-codec'
import { clearAllEntries } from '../storage/db'
import type { CRDTEntry, VectorClock } from '../types'

const codec = new QRCodec()

/** vectorClock QR文字列から中身のVectorClockだけ取り出す小さなヘルパー。 */
function decodeVc(vcQR: string): VectorClock {
  return codec.decodeVectorClock(vcQR).vectorClock
}

/** 比較用に、エントリ配列を id 順に正規化する。 */
function normalize(entries: CRDTEntry[]) {
  return entries
    .map((e) => ({ id: e.id, type: e.data.type, deleted: e.deleted, lamportClock: e.lamportClock }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

beforeEach(async () => {
  await clearAllEntries()
})

describe('MeshReliefEngine — §9.3「QR差分同期」「QR差分再同期」', () => {
  it('vectorClock QR交換 → 差分抽出 → Animated QR → フレーム投入 → mergeRemote() で双方のデータが一致する', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    await nodeA.createRecord({ type: 'safety', name: 'たなか', status: 'safe' })
    await nodeA.createRecord({ type: 'supply', itemName: '水', quantity: 10, unit: '本', priority: 'urgent' })
    await nodeA.createRecord({ type: 'shelter', name: '第一小学校', status: 'open' })

    // B: 自分のvectorClockをQR化 → A: スキャンして差分抽出（今回は全件一致の確認なのでscope='all'）
    const bVcQR = nodeB.generateVectorClockQR()
    const bundle = await nodeA.prepareDiffBundle(bVcQR, 'all')
    expect(bundle.entryCount).toBe(3)

    const frames = await nodeA.generateAnimatedQR(bundle)
    expect(frames.length).toBeGreaterThan(0)

    let lastResult
    for (const frame of frames) {
      lastResult = await nodeB.ingestQRFrame(frame)
    }
    expect(lastResult?.complete).toBe(true)
    expect(lastResult?.mergedCount).toBe(3)

    // 双方の状態が完全に一致していること
    expect(normalize(nodeB.getEntries())).toEqual(normalize(nodeA.getEntries()))
  })

  it('2回目の同期では差分のみが転送される（1〜2枚のフレームで完了する）', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    // 1回目の同期: 3件
    await nodeA.createRecord({ type: 'safety', name: 'たなか', status: 'safe' })
    await nodeA.createRecord({ type: 'safety', name: 'やまだ', status: 'safe' })
    await nodeA.createRecord({ type: 'safety', name: 'さとう', status: 'safe' })

    const firstBundle = await nodeA.prepareDiffBundle(nodeB.generateVectorClockQR(), 'all')
    const firstFrames = await nodeA.generateAnimatedQR(firstBundle)
    for (const frame of firstFrames) {
      await nodeB.ingestQRFrame(frame)
    }
    expect(nodeB.getEntries()).toHaveLength(3)

    // 2回目の同期の前に、Aにさらに1件追加
    await nodeA.createRecord({ type: 'message', authorName: 'たなか', body: '追加の連絡です' })

    // Bの更新後のvectorClockを使って2回目の差分を計算する
    const secondBundle = await nodeA.prepareDiffBundle(nodeB.generateVectorClockQR(), 'all')
    expect(secondBundle.entryCount).toBe(1) // 差分のみ（新規追加した1件だけ）

    const secondFrames = await nodeA.generateAnimatedQR(secondBundle)
    expect(secondFrames.length).toBeLessThanOrEqual(2) // §9.3「差分のみ転送（1-2枚）」

    let lastResult
    for (const frame of secondFrames) {
      lastResult = await nodeB.ingestQRFrame(frame)
    }
    expect(lastResult?.complete).toBe(true)
    expect(lastResult?.mergedCount).toBe(1)
    expect(nodeB.getEntries()).toHaveLength(4)
  })
})

describe('MeshReliefEngine — v3要件1: prepareDiffBundleのデフォルトスコープ', () => {
  it('scope="default"では、urgentでなく自分の避難所とも異なるshelterIdのエントリは含まれない', async () => {
    const engine = await MeshReliefEngine.createEphemeral('たなか')
    await engine.setHomeShelterId('my-shelter')

    await engine.createRecord({
      type: 'message',
      authorName: 'たなか',
      body: '通常のお知らせ',
      shelterId: 'other-shelter',
      priority: 'normal',
    })

    const remoteVcQR = (await MeshReliefEngine.createEphemeral('peer')).generateVectorClockQR()
    const bundle = await engine.prepareDiffBundle(remoteVcQR) // scope省略 = 'default'

    expect(bundle.entryCount).toBe(0)
  })

  it('scope="default"では、priority="urgent"のエントリはshelterIdに関わらず含まれる', async () => {
    const engine = await MeshReliefEngine.createEphemeral('たなか')
    await engine.setHomeShelterId('my-shelter')

    await engine.createRecord({
      type: 'supply',
      itemName: '水',
      quantity: 0,
      unit: '本',
      shelterId: 'other-shelter', // 自分の避難所とは異なる
      priority: 'urgent',
    })

    const remoteVcQR = (await MeshReliefEngine.createEphemeral('peer')).generateVectorClockQR()
    const bundle = await engine.prepareDiffBundle(remoteVcQR)

    expect(bundle.entryCount).toBe(1)
    expect(bundle.entries[0]?.data).toMatchObject({ priority: 'urgent' })
  })

  it('scope="default"では、自分の避難所と一致するshelterIdの通常エントリは含まれる（参考）', async () => {
    const engine = await MeshReliefEngine.createEphemeral('たなか')
    await engine.setHomeShelterId('my-shelter')

    await engine.createRecord({
      type: 'supply',
      itemName: '毛布',
      quantity: 5,
      unit: '枚',
      shelterId: 'my-shelter',
      priority: 'normal',
    })

    const remoteVcQR = (await MeshReliefEngine.createEphemeral('peer')).generateVectorClockQR()
    const bundle = await engine.prepareDiffBundle(remoteVcQR)

    expect(bundle.entryCount).toBe(1)
  })
})

describe('MeshReliefEngine — v3要件2: decideRole()', () => {
  it('自分が相手より新しいエントリを多く持つ場合はsend', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    await nodeA.createRecord({ type: 'safety', name: 'A1', status: 'safe' })
    await nodeA.createRecord({ type: 'safety', name: 'A2', status: 'safe' })
    await nodeA.createRecord({ type: 'safety', name: 'A3', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B1', status: 'safe' })
    // Aは3件、Bは1件 → Aの方が多く持っている

    expect(nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()))).toBe('send')
  })

  it('相手が自分より新しいエントリを多く持つ場合はreceive', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    await nodeA.createRecord({ type: 'safety', name: 'A1', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B1', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B2', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B3', status: 'safe' })
    // Bは3件、Aは1件 → 相手(B)の方が多く持っている

    expect(nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()))).toBe('receive')
  })

  it('差分が無い場合はsynced', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    // 両者とも何も登録していない状態（vectorClockが空同士）
    expect(nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()))).toBe('synced')

    // 実際に同期した直後も、双方から見てsyncedになることを確認
    await nodeA.createRecord({ type: 'safety', name: 'たなか', status: 'safe' })
    const bundle = await nodeA.prepareDiffBundle(nodeB.generateVectorClockQR(), 'all')
    const frames = await nodeA.generateAnimatedQR(bundle)
    for (const frame of frames) {
      await nodeB.ingestQRFrame(frame)
    }

    expect(nodeB.decideRole(decodeVc(nodeA.generateVectorClockQR()))).toBe('synced')
    expect(nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()))).toBe('synced')
  })
})

describe('MeshReliefEngine — 1-4修正: decideRole()の相打ちデッドロック対策（タイブレーク）', () => {
  it('お互いが「ちょうど同じ件数」の新しいエントリを持つ場合、remoteNodeIdありなら必ずどちらか一方だけがsendになる', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')

    // 双方とも1件ずつ、互いの知らないデータを持つ（iCanSend === theyAreAhead === 1）
    await nodeA.createRecord({ type: 'safety', name: 'A1', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B1', status: 'safe' })

    // 修正前は両者とも'send'と判定され、互いのAnimated QRを映し合うだけで
    // 永久にどちらもスキャンしない状態（相打ちデッドロック）になり得た。
    const aDecision = nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()), nodeB.nodeId)
    const bDecision = nodeB.decideRole(decodeVc(nodeA.generateVectorClockQR()), nodeA.nodeId)

    // 「両方send」でも「両方receive」でもなく、必ず一方がsend・他方がreceiveになること
    expect([aDecision, bDecision].sort()).toEqual(['receive', 'send'])
  })

  it('タイブレークの結果はnodeIdの大小関係のみで決まり、どちらから見ても矛盾しない', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')
    await nodeA.createRecord({ type: 'safety', name: 'A1', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B1', status: 'safe' })

    const aDecision = nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()), nodeB.nodeId)
    const bDecision = nodeB.decideRole(decodeVc(nodeA.generateVectorClockQR()), nodeA.nodeId)

    // nodeIdの文字列比較で「小さい方」が送信側になる、という決定的なルール通りであること
    const expectedSender = nodeA.nodeId < nodeB.nodeId ? 'A' : 'B'
    expect(aDecision).toBe(expectedSender === 'A' ? 'send' : 'receive')
    expect(bDecision).toBe(expectedSender === 'B' ? 'send' : 'receive')
  })

  it('remoteNodeIdを渡さない場合は、後方互換のため常にsendを返す', async () => {
    const nodeA = await MeshReliefEngine.createEphemeral('たなか')
    const nodeB = await MeshReliefEngine.createEphemeral('やまだ')
    await nodeA.createRecord({ type: 'safety', name: 'A1', status: 'safe' })
    await nodeB.createRecord({ type: 'safety', name: 'B1', status: 'safe' })

    expect(nodeA.decideRole(decodeVc(nodeB.generateVectorClockQR()))).toBe('send')
  })
})

describe('MeshReliefEngine — v3要件3: ステーションモードの無条件マージ', () => {
  it('nodeRole="station"のエンジンが3台の端末と順番に同期しても、全件が正しくマージされる', async () => {
    const station = await MeshReliefEngine.createEphemeral('受付ステーション', 'station')

    const visitorNames = ['来訪者1', '来訪者2', '来訪者3']
    const visitors = await Promise.all(visitorNames.map((name) => MeshReliefEngine.createEphemeral(name)))

    for (let i = 0; i < visitors.length; i += 1) {
      const visitor = visitors[i]!
      await visitor.createRecord({ type: 'safety', name: visitorNames[i]!, status: 'safe' })

      // priorityを指定しない通常データでも、ステーション側は常に全件マージする想定
      const bundle = await visitor.prepareDiffBundle(station.generateVectorClockQR(), 'all')
      const frames = await visitor.generateAnimatedQR(bundle)
      for (const frame of frames) {
        await station.ingestQRFrame(frame)
      }
    }

    const stationSafetyEntries = station.getEntries('safety')
    expect(stationSafetyEntries).toHaveLength(3)

    const names = stationSafetyEntries
      .map((e) => (e.data.type === 'safety' ? e.data.name : null))
      .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
    expect(names).toEqual([...visitorNames].sort())
  })

  it('nodeRole="station"は送信側としてもscope引数に関わらず常に全件を対象にする', async () => {
    const station = await MeshReliefEngine.createEphemeral('受付ステーション', 'station')
    // homeShelterIdを設定せず、priorityも'urgent'にしない
    // → 'default'スコープなら本来除外されるはずのデータ
    await station.createRecord({
      type: 'message',
      authorName: '受付',
      body: '通常のお知らせ',
      priority: 'normal',
    })

    const visitor = await MeshReliefEngine.createEphemeral('来訪者')
    const bundle = await station.prepareDiffBundle(visitor.generateVectorClockQR(), 'default')

    // nodeRole==='station'の場合、渡したscope('default')に関わらず常に'all'として扱われる
    expect(bundle.entryCount).toBe(1)
  })
})
