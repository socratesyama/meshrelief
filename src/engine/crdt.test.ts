/**
 * CRDTEngine — CRDTプロパティテスト（実装計画書 v2 §9.1）
 * =============================================================================
 * §9.1の5項目に対応する describe ブロックを用意している:
 *   収束性 / 冪等性 / 競合解決（LWW） / Tombstone / タイブレーク
 * これに加えて、1-1修正（ECDSA公開鍵署名+TOFU）専用のdescribeブロックを追加した。
 *
 * テスト方針:
 *  - `makeEntry()` で、実際にECDSA署名検証を通る「合成エントリ」を作る。
 *    【1-1修正】旧HMAC方式時代は「entry.nodeIdが自ノードと異なる場合は
 *    常にtrueを返す」設計だったため、ダミーの signature 文字列だけで
 *    合成エントリを自由に作れていた。ECDSA公開鍵署名への切替後は、
 *    verify()が自ノード・他ノード問わず必ず暗号学的な署名検証を行う
 *    ため、合成エントリも「本物の秘密鍵で署名された、検証を通る」形で
 *    作る必要がある。そのため `CRDTEngine.signEntryForTesting()`
 *    （テスト専用の静的ヘルパー。crdt.ts参照）を使い、nodeIdごとに
 *    鍵ペアをキャッシュして使い回すことで、任意のlamportClock/updatedAt/
 *    id/deletedの組み合わせを持つ「他ノードから届いた体のエントリ」を
 *    厳密に作れるようにしている。
 *  - 一方、自分自身の操作（create/update/delete）については実際に
 *    CRDTEngine.create() 等を呼び、本物の署名付きエントリで冪等性/
 *    tombstoneも確認する（合成エントリだけでなく実経路も最低限カバーする）。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { CRDTEngine, compareForLWW } from './crdt'
import type { CRDTEntry, DataRecord } from '../types'

async function newEngine(nodeId: string, nodeName: string = nodeId): Promise<CRDTEngine> {
  const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
  const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
  return new CRDTEngine({ nodeId, nodeName, privateKey, publicKey, publicKeyHex })
}

let seq = 0

/**
 * 【1-1修正】nodeIdごとに鍵ペアをキャッシュする。同じnodeIdに対して
 * 毎回違う鍵で署名してしまうと、2回目以降がTOFU検証で「なりすましの疑い」
 * として拒否されてしまう（1つのnodeIdは1つの鍵ペアに対応するのが前提）。
 */
const syntheticKeyCache = new Map<string, { privateKey: CryptoKey; publicKeyHex: string }>()

async function getSyntheticKeypair(nodeId: string): Promise<{ privateKey: CryptoKey; publicKeyHex: string }> {
  const cached = syntheticKeyCache.get(nodeId)
  if (cached) return cached
  const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
  const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
  const keypair = { privateKey, publicKeyHex }
  syntheticKeyCache.set(nodeId, keypair)
  return keypair
}

/** 実際にECDSA署名検証を通る、テスト用の合成エントリを作る。 */
async function makeEntry(params: {
  id: string
  nodeId: string
  lamportClock: number
  updatedAt: number
  deleted?: boolean
  data?: DataRecord
}): Promise<CRDTEntry> {
  seq += 1
  const data: DataRecord = params.data ?? { type: 'safety', name: `dummy-${seq}`, status: 'safe' }
  const { privateKey, publicKeyHex } = await getSyntheticKeypair(params.nodeId)
  return CRDTEngine.signEntryForTesting(
    {
      id: params.id,
      nodeId: params.nodeId,
      nodeName: `name-of-${params.nodeId}`,
      data,
      vectorClock: { [params.nodeId]: params.lamportClock },
      lamportClock: params.lamportClock,
      createdAt: params.updatedAt,
      updatedAt: params.updatedAt,
      deleted: params.deleted ?? false,
      publicKey: publicKeyHex,
    },
    privateKey,
  )
}

describe('CRDTEngine — CRDTプロパティテスト（§9.1）', () => {
  describe('収束性', () => {
    it('独立したエントリと競合エントリの混在を、異なる順序でマージしても最終状態が一致する', async () => {
      const e1 = await makeEntry({ id: 'e1', nodeId: 'node-x', lamportClock: 1, updatedAt: 1000 })
      const e2 = await makeEntry({ id: 'e2', nodeId: 'node-x', lamportClock: 2, updatedAt: 2000 })
      const sharedOld = await makeEntry({ id: 'shared', nodeId: 'node-a', lamportClock: 1, updatedAt: 1000 })
      const sharedNew = await makeEntry({ id: 'shared', nodeId: 'node-b', lamportClock: 2, updatedAt: 2000 })

      const engineA = await newEngine('receiver-a')
      const engineB = await newEngine('receiver-b')

      for (const entry of [e1, e2, sharedOld, sharedNew]) {
        await engineA.mergeRemote(entry)
      }
      // engineBには逆順・かつ競合エントリも逆順で投入する
      for (const entry of [sharedNew, e2, sharedOld, e1]) {
        await engineB.mergeRemote(entry)
      }

      const normalize = (engine: CRDTEngine) =>
        engine
          .getAllEntries()
          .map((entry) => ({
            id: entry.id,
            nodeId: entry.nodeId,
            lamportClock: entry.lamportClock,
            deleted: entry.deleted,
          }))
          .sort((a, b) => a.id.localeCompare(b.id))

      expect(normalize(engineA)).toEqual(normalize(engineB))
      // 競合していた'shared'は、lamportClockが高いsharedNew(node-b)に収束するはず
      expect(engineA.getEntry('shared')?.nodeId).toBe('node-b')
      expect(engineB.getEntry('shared')?.nodeId).toBe('node-b')
    })
  })

  describe('冪等性', () => {
    it('合成エントリを2回mergeRemoteしても、2回目以降は状態が変化しない', async () => {
      const receiver = await newEngine('receiver')
      const entry = await makeEntry({ id: 'e1', nodeId: 'node-x', lamportClock: 1, updatedAt: 1000 })

      const first = await receiver.mergeRemote(entry)
      expect(first).toBe(true)
      const stateAfterFirst = receiver.getAllEntries()

      const second = await receiver.mergeRemote(entry)
      expect(second).toBe(false)
      expect(receiver.getAllEntries()).toEqual(stateAfterFirst)
      expect(receiver.getAllEntries()).toHaveLength(1)

      // 3回目も変化しないこと
      const third = await receiver.mergeRemote(entry)
      expect(third).toBe(false)
      expect(receiver.getAllEntries()).toHaveLength(1)
    })

    it('自分自身がcreate()した本物の署名付きエントリをmergeRemoteしても変化しない', async () => {
      const engine = await newEngine('node-self')
      const created = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })

      const applied = await engine.mergeRemote(created)
      expect(applied).toBe(false)
      expect(engine.getAllEntries()).toHaveLength(1)
      expect(engine.getEntry(created.id)).toEqual(created)
    })
  })

  describe('署名検証（1-1: ECDSA公開鍵署名 + TOFU）', () => {
    it('署名が壊れている（改ざんされた）エントリはmergeRemoteで拒否される', async () => {
      const engine = await newEngine('receiver')
      const entry = await makeEntry({ id: 'e1', nodeId: 'node-x', lamportClock: 1, updatedAt: 1000 })
      const tampered: CRDTEntry = { ...entry, data: { type: 'safety', name: '改ざんされた名前', status: 'safe' } }

      const applied = await engine.mergeRemote(tampered)
      expect(applied).toBe(false)
      expect(engine.getAllEntries()).toHaveLength(0)
    })

    it('同じnodeIdを名乗るが異なる公開鍵で署名されたエントリは、TOFU違反として拒否される', async () => {
      const engine = await newEngine('receiver')
      const legit = await makeEntry({ id: 'e1', nodeId: 'node-victim', lamportClock: 1, updatedAt: 1000 })
      expect(await engine.mergeRemote(legit)).toBe(true)

      // 攻撃者が全く別の鍵ペアで、同じnodeId「node-victim」を騙って署名する
      const attackerPair = await CRDTEngine.generateKeyPair()
      const attackerPublicKeyHex = await CRDTEngine.exportPublicKey(attackerPair.publicKey)
      const impersonation = await CRDTEngine.signEntryForTesting(
        {
          id: 'e2',
          nodeId: 'node-victim',
          nodeName: 'なりすまし',
          data: { type: 'safety', name: 'なりすまし', status: 'safe' },
          vectorClock: { 'node-victim': 2 },
          lamportClock: 2,
          createdAt: 2000,
          updatedAt: 2000,
          deleted: false,
          publicKey: attackerPublicKeyHex,
        },
        attackerPair.privateKey,
      )

      const applied = await engine.mergeRemote(impersonation)
      expect(applied).toBe(false)
      // 正規のエントリだけが残っていること（なりすましは一切反映されない）
      expect(engine.getAllEntries()).toHaveLength(1)
      expect(engine.getEntry('e2')).toBeUndefined()
    })

    it('初めて見るnodeIdの公開鍵はTOFUによりそのまま信頼され、以後同じ鍵なら継続して受理される', async () => {
      const engine = await newEngine('receiver')
      const first = await makeEntry({ id: 'e1', nodeId: 'node-new', lamportClock: 1, updatedAt: 1000 })
      const second = await makeEntry({ id: 'e2', nodeId: 'node-new', lamportClock: 2, updatedAt: 2000 })

      expect(await engine.mergeRemote(first)).toBe(true)
      expect(await engine.mergeRemote(second)).toBe(true)
      expect(engine.getAllEntries()).toHaveLength(2)
    })
  })

  describe('競合解決（LWW: lamport > updatedAt > nodeId）', () => {
    it('lamportClockが高い方が、updatedAtが低くても勝つ（時計ズレ対策・§11.2）', async () => {
      const older = await makeEntry({ id: 'e1', nodeId: 'node-a', lamportClock: 5, updatedAt: 9000 })
      const newerLamportButOlderClock = await makeEntry({
        id: 'e1',
        nodeId: 'node-b',
        lamportClock: 10,
        updatedAt: 500, // updatedAtだけ見ればolderより古いが、lamportClockは高い
      })

      const engine1 = await newEngine('receiver1')
      await engine1.mergeRemote(older)
      await engine1.mergeRemote(newerLamportButOlderClock)
      expect(engine1.getEntry('e1')?.nodeId).toBe('node-b')

      // 逆順でマージしても結果は変わらない
      const engine2 = await newEngine('receiver2')
      await engine2.mergeRemote(newerLamportButOlderClock)
      await engine2.mergeRemote(older)
      expect(engine2.getEntry('e1')?.nodeId).toBe('node-b')
    })

    it('lamportClockが同じ場合はupdatedAtが高い方が勝つ', async () => {
      const engine = await newEngine('receiver')
      const a = await makeEntry({ id: 'e1', nodeId: 'node-a', lamportClock: 3, updatedAt: 1000 })
      const b = await makeEntry({ id: 'e1', nodeId: 'node-b', lamportClock: 3, updatedAt: 2000 })

      await engine.mergeRemote(a)
      await engine.mergeRemote(b)
      expect(engine.getEntry('e1')?.nodeId).toBe('node-b')
    })

    it('compareForLWWの戻り値の符号が優先順位（lamport > updatedAt）通りになっている', async () => {
      const lower = await makeEntry({ id: 'x', nodeId: 'node-a', lamportClock: 1, updatedAt: 9999 })
      const higherLamport = await makeEntry({ id: 'x', nodeId: 'node-a', lamportClock: 2, updatedAt: 1 })
      expect(compareForLWW(higherLamport, lower)).toBeGreaterThan(0)
      expect(compareForLWW(lower, higherLamport)).toBeLessThan(0)

      const sameLamportLowerUpdatedAt = await makeEntry({ id: 'x', nodeId: 'node-a', lamportClock: 1, updatedAt: 100 })
      const sameLamportHigherUpdatedAt = await makeEntry({ id: 'x', nodeId: 'node-a', lamportClock: 1, updatedAt: 200 })
      expect(compareForLWW(sameLamportHigherUpdatedAt, sameLamportLowerUpdatedAt)).toBeGreaterThan(0)
    })
  })

  describe('Tombstone', () => {
    it('削除（tombstone）後、それより古い非削除バージョンが届いても復活しない', async () => {
      const engine = await newEngine('receiver')
      const created = await makeEntry({ id: 'e1', nodeId: 'node-a', lamportClock: 1, updatedAt: 1000 })
      const deleted = await makeEntry({
        id: 'e1',
        nodeId: 'node-a',
        lamportClock: 2,
        updatedAt: 2000,
        deleted: true,
      })
      // 何らかの理由で古いバージョンが後から届いた状況を模す（lamportClockはcreatedと同じ=1）
      const staleRevive = await makeEntry({ id: 'e1', nodeId: 'node-a', lamportClock: 1, updatedAt: 1000 })

      await engine.mergeRemote(created)
      expect(engine.getEntries()).toHaveLength(1)

      await engine.mergeRemote(deleted)
      expect(engine.getEntries()).toHaveLength(0) // tombstoneはgetEntries()から除外される
      expect(engine.getAllEntries()).toHaveLength(1) // getAllEntries()には残り続ける
      expect(engine.getEntry('e1')?.deleted).toBe(true)

      const applied = await engine.mergeRemote(staleRevive)
      expect(applied).toBe(false) // lamportClockで負けるため反映されない
      expect(engine.getEntry('e1')?.deleted).toBe(true) // 復活していない
      expect(engine.getEntries()).toHaveLength(0)
    })

    it('CRDTEngine.delete()自体も、実際の署名付きエントリとして正しくtombstone化する', async () => {
      const engine = await newEngine('node-self')
      const created = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })

      expect(engine.getEntries()).toHaveLength(1)
      const deletedEntry = await engine.delete(created.id)

      expect(deletedEntry.deleted).toBe(true)
      expect(deletedEntry.lamportClock).toBeGreaterThan(created.lamportClock)
      expect(engine.getEntries()).toHaveLength(0)
      expect(engine.getAllEntries()).toHaveLength(1)
    })
  })

  describe('タイブレーク', () => {
    it('同じlamportClock・同じupdatedAtの場合、nodeIdの大小で一貫して決まる', async () => {
      const a = await makeEntry({ id: 'e1', nodeId: 'node-a', lamportClock: 5, updatedAt: 1000 })
      const b = await makeEntry({ id: 'e1', nodeId: 'node-b', lamportClock: 5, updatedAt: 1000 })
      // 'node-b' > 'node-a'（文字列比較）なので、常にbが勝つはず

      const engine1 = await newEngine('receiver1')
      await engine1.mergeRemote(a)
      await engine1.mergeRemote(b)
      expect(engine1.getEntry('e1')?.nodeId).toBe('node-b')

      // 逆順でマージしても、判定が変わらない（一貫している）こと
      const engine2 = await newEngine('receiver2')
      await engine2.mergeRemote(b)
      await engine2.mergeRemote(a)
      expect(engine2.getEntry('e1')?.nodeId).toBe('node-b')
    })

    it('compareForLWWが同一lamport・updatedAtの場合、nodeId比較で決定的に判定する', async () => {
      const a = await makeEntry({ id: 'e1', nodeId: 'node-a', lamportClock: 5, updatedAt: 1000 })
      const b = await makeEntry({ id: 'e1', nodeId: 'node-b', lamportClock: 5, updatedAt: 1000 })

      expect(compareForLWW(b, a)).toBeGreaterThan(0)
      expect(compareForLWW(a, b)).toBeLessThan(0)
      // 完全に同一内容（同一nodeId）同士は0（実質的に同一エントリとみなせる）
      expect(compareForLWW(a, { ...a })).toBe(0)
    })
  })
})
