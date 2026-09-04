/**
 * storage/db.ts のテスト。
 *
 * fake-indexeddb（src/test/setup.tsでグローバル登録済み）を使う。
 * meta ストアは単一レコードのため、「何も保存されていない状態」を
 * 検証するテストは、このファイル内で最初に実行されることに依存している
 * （db.tsはmetaストアを個別にクリアするAPIを公開していないため）。
 * entries ストアは各テストの先頭で `clearAllEntries()` して独立させる。
 *
 * 【1-1修正】HMAC共有鍵(hmacKey)からECDSA鍵ペア(privateKey/publicKey)+
 * TOFU信頼テーブル(trustedKeys)への切替に伴い、鍵まわりのテストを
 * 全面的に書き直した。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllEntries,
  getAllEntries,
  getEntriesByShelterId,
  getEntriesByType,
  getEntry,
  getIdentity,
  putEntries,
  saveIdentity,
} from './db'
import { CRDTEngine } from '../engine/crdt'
import type { CRDTEntry } from '../types'

async function makeEntry(overrides: Partial<CRDTEntry> & Pick<CRDTEntry, 'id'>): Promise<CRDTEntry> {
  const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
  const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
  const engine = new CRDTEngine({ nodeId: 'node-x', nodeName: 'たなか', privateKey, publicKey, publicKeyHex })
  const created = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
  return { ...created, ...overrides }
}

beforeEach(async () => {
  await clearAllEntries()
})

describe('storage/db — meta ストア（getIdentity/saveIdentity）', () => {
  it('何も保存されていない初回起動時は undefined を返す', async () => {
    const identity = await getIdentity()
    expect(identity).toBeUndefined()
  })

  it('保存した内容がそのまま読み込める（ECDSA鍵ペアの往復も含む）', async () => {
    const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
    const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
    await saveIdentity({
      nodeId: 'node-a',
      nodeName: 'たなか',
      nodeRole: 'personal',
      homeShelterId: null,
      vectorClock: { 'node-a': 3 },
      lamportClock: 3,
      privateKey,
      publicKey,
      publicKeyHex,
      trustedKeys: { 'node-a': publicKeyHex },
    })

    const loaded = await getIdentity()
    expect(loaded?.nodeId).toBe('node-a')
    expect(loaded?.nodeName).toBe('たなか')
    expect(loaded?.nodeRole).toBe('personal')
    expect(loaded?.vectorClock).toEqual({ 'node-a': 3 })
    expect(loaded?.lamportClock).toBe(3)
    expect(loaded?.publicKeyHex).toBe(publicKeyHex)
    expect(loaded?.trustedKeys).toEqual({ 'node-a': publicKeyHex })

    // 元の秘密鍵で署名したエントリが、"読み込んだ"公開鍵で検証できること
    // （＝IndexedDBを往復してもペアとして正しく機能すること）を確認する。
    // 単純なhex文字列比較ではなく、実際に署名→検証まで行う方式にしている
    // 方が「運用上意味のある往復性」をより直接的に検証できるため。
    const engineWithOriginalKey = new CRDTEngine({
      nodeId: 'node-a',
      nodeName: 'たなか',
      privateKey,
      publicKey,
      publicKeyHex,
    })
    const signed = await engineWithOriginalKey.create({ type: 'safety', name: 'たなか', status: 'safe' })
    expect(signed.publicKey).toBe(publicKeyHex)

    const engineWithLoadedKey = new CRDTEngine({
      nodeId: 'node-a',
      nodeName: 'たなか',
      privateKey: loaded!.privateKey,
      publicKey: loaded!.publicKey,
      publicKeyHex: loaded!.publicKeyHex,
    })
    expect(await engineWithLoadedKey.verify(signed)).toBe(true)
  })

  it('nodeRole="station" と homeShelterId も正しく往復する', async () => {
    const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
    const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
    await saveIdentity({
      nodeId: 'node-station',
      nodeName: '受付ステーション',
      nodeRole: 'station',
      homeShelterId: 'shelter-1',
      vectorClock: {},
      lamportClock: 0,
      privateKey,
      publicKey,
      publicKeyHex,
      trustedKeys: {},
    })

    const loaded = await getIdentity()
    expect(loaded?.nodeRole).toBe('station')
    expect(loaded?.homeShelterId).toBe('shelter-1')
  })
})

describe('storage/db — entries ストア', () => {
  it('putEntries → getAllEntries で保存した内容が読み込める', async () => {
    const entry = await makeEntry({ id: 'e1' })
    await putEntries([entry])

    const all = await getAllEntries()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe('e1')
  })

  it('putEntries に空配列を渡しても何も起きない', async () => {
    await putEntries([])
    expect(await getAllEntries()).toHaveLength(0)
  })

  it('getEntry で単一エントリを取得できる。存在しないIDはundefined', async () => {
    const entry = await makeEntry({ id: 'e1' })
    await putEntries([entry])

    expect((await getEntry('e1'))?.id).toBe('e1')
    expect(await getEntry('does-not-exist')).toBeUndefined()
  })

  it('putEntries で同じidのエントリを再度putすると上書きされる（tombstone更新等を想定）', async () => {
    const entry = await makeEntry({ id: 'e1' })
    await putEntries([entry])

    const deleted = { ...entry, deleted: true, lamportClock: entry.lamportClock + 1 }
    await putEntries([deleted])

    const all = await getAllEntries()
    expect(all).toHaveLength(1)
    expect(all[0]?.deleted).toBe(true)
  })

  it('getEntriesByType で type インデックスによる絞り込みができる', async () => {
    const safetyEntry = await makeEntry({ id: 'e1' })
    const supplyEntry: CRDTEntry = {
      ...(await makeEntry({ id: 'e2' })),
      data: { type: 'supply', itemName: '水', quantity: 1, unit: '本' },
    }
    await putEntries([safetyEntry, supplyEntry])

    const safetyOnly = await getEntriesByType('safety')
    expect(safetyOnly.map((e) => e.id)).toEqual(['e1'])
  })

  it('getEntriesByShelterId で shelterId インデックスによる絞り込みができる', async () => {
    const withShelter: CRDTEntry = {
      ...(await makeEntry({ id: 'e1' })),
      data: { type: 'safety', name: 'たなか', status: 'safe', shelterId: 'shelter-1' },
    }
    const withoutShelter = await makeEntry({ id: 'e2' })
    await putEntries([withShelter, withoutShelter])

    const result = await getEntriesByShelterId('shelter-1')
    expect(result.map((e) => e.id)).toEqual(['e1'])
  })

  it('clearAllEntries で entries ストアが空になる', async () => {
    await putEntries([await makeEntry({ id: 'e1' }), await makeEntry({ id: 'e2' })])
    expect(await getAllEntries()).toHaveLength(2)

    await clearAllEntries()
    expect(await getAllEntries()).toHaveLength(0)
  })
})
