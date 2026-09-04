/**
 * QRReceiver — 受信側の状態管理テスト
 * =============================================================================
 * 実装計画書 v2 §2.6「受信側の状態管理」および、ロードマップ提出前
 * チェックリスト「9. 最低限のテストを足す（qr-receiver.test.ts など）」への対応。
 *
 * qr-codec.test.tsが送信側（QRCodec.splitIntoFrames/decodeFrame）の
 * プロパティを検証しているのに対し、こちらは「受信側が実際に複数フレームを
 * 順不同で受け取りながら状態を組み立てていく」という、QRReceiver固有の
 * ステートフルな振る舞いに焦点を当てる:
 *   - 進捗（getState）が受信するたびに正しく更新される
 *   - 全フレーム揃った時点でのみ complete:true とバンドルを返す
 *   - 順不同（シャッフル）で受け取っても正しく復元できる
 *   - 同じフレームを2回受け取っても壊れない（重複スキャンへの耐性）
 *   - 別バンドルのフレームが割り込んだら状態をリセットする
 *   - reset() で手動リセットできる
 *   - 【1-3修正】壊れた/なりすましのJSONを拒否する（zodスキーマ検証）
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { QRCodec, shortHash } from './qr-codec'
import { QRReceiver } from './qr-receiver'
import { CRDTEngine } from '../engine/crdt'
import type { CRDTEntry, QRBundle } from '../types'

async function newEngine(nodeId: string, nodeName: string = nodeId): Promise<CRDTEngine> {
  const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
  const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
  return new CRDTEngine({ nodeId, nodeName, privateKey, publicKey, publicKeyHex })
}

async function makeBundle(codec: QRCodec, entries: CRDTEntry[]): Promise<QRBundle> {
  return codec.createBundle(entries, 'node-a', 'たなか')
}

describe('QRReceiver', () => {
  it('単一フレームで完結するバンドルは、1回のingestFrameでcomplete:trueになる', async () => {
    const codec = new QRCodec()
    const receiver = new QRReceiver(codec)
    const engine = await newEngine('node-a')
    const entry = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
    const bundle = await makeBundle(codec, [entry])
    const [frame] = await codec.splitIntoFrames(bundle)

    const result = await receiver.ingestFrame(frame!)
    expect(result.complete).toBe(true)
    expect(result.progress).toBe(1)
    expect(result.bundle).toEqual(bundle)
  })

  it('複数フレームの場合、揃うまではcomplete:falseで、進捗(progress)が単調に増える', async () => {
    const codec = new QRCodec()
    const receiver = new QRReceiver(codec)
    const engine = await newEngine('node-a')
    const entries: CRDTEntry[] = []
    for (let i = 0; i < 8; i += 1) {
      entries.push(await engine.create({ type: 'supply', itemName: `物資${i}`, quantity: 1, unit: '個' }))
    }
    const bundle = await makeBundle(codec, entries)
    const frames = await codec.splitIntoFrames(bundle, 150)
    expect(frames.length).toBeGreaterThan(2)

    let lastProgress = 0
    for (let i = 0; i < frames.length - 1; i += 1) {
      const result = await receiver.ingestFrame(frames[i]!)
      expect(result.complete).toBe(false)
      expect(result.progress).toBeGreaterThan(lastProgress)
      lastProgress = result.progress
      expect(receiver.getState().received).toBe(i + 1)
    }

    const finalResult = await receiver.ingestFrame(frames[frames.length - 1]!)
    expect(finalResult.complete).toBe(true)
    expect(finalResult.bundle).toEqual(bundle)
  })

  it('順不同（シャッフル）でフレームを受け取っても正しく復元できる', async () => {
    const codec = new QRCodec()
    const receiver = new QRReceiver(codec)
    const engine = await newEngine('node-a')
    const entries: CRDTEntry[] = []
    for (let i = 0; i < 6; i += 1) {
      entries.push(await engine.create({ type: 'message', authorName: 'たなか', body: `伝言${i}` }))
    }
    const bundle = await makeBundle(codec, entries)
    const frames = await codec.splitIntoFrames(bundle, 150)
    expect(frames.length).toBeGreaterThan(1)

    const shuffled = [...frames].sort(() => Math.random() - 0.5)
    let last
    for (const frame of shuffled) {
      last = await receiver.ingestFrame(frame)
    }
    expect(last?.complete).toBe(true)
    expect(last?.bundle).toEqual(bundle)
  })

  it('同じフレームを重複して受け取っても状態が壊れない（重複スキャンへの耐性）', async () => {
    const codec = new QRCodec()
    const receiver = new QRReceiver(codec)
    const engine = await newEngine('node-a')
    const entries: CRDTEntry[] = []
    for (let i = 0; i < 6; i += 1) {
      entries.push(await engine.create({ type: 'supply', itemName: `物資${i}`, quantity: 1, unit: '個' }))
    }
    const bundle = await makeBundle(codec, entries)
    const frames = await codec.splitIntoFrames(bundle, 150)
    expect(frames.length).toBeGreaterThan(1)

    // フレーム0を3回連続でスキャンしてしまった状況を模す
    await receiver.ingestFrame(frames[0]!)
    await receiver.ingestFrame(frames[0]!)
    await receiver.ingestFrame(frames[0]!)
    expect(receiver.getState().received).toBe(1) // 重複は1件としてしかカウントされない

    let last
    for (let i = 1; i < frames.length; i += 1) {
      last = await receiver.ingestFrame(frames[i]!)
    }
    expect(last?.complete).toBe(true)
    expect(last?.bundle).toEqual(bundle)
  })

  it('別のbundleIdのフレームが割り込むと、状態がリセットされ新しいバンドルとして扱われる', async () => {
    const codec = new QRCodec()
    const receiver = new QRReceiver(codec)
    const engine = await newEngine('node-a')

    const entriesA: CRDTEntry[] = []
    for (let i = 0; i < 6; i += 1) {
      entriesA.push(await engine.create({ type: 'supply', itemName: `A物資${i}`, quantity: 1, unit: '個' }))
    }
    const bundleA = await makeBundle(codec, entriesA)
    const framesA = await codec.splitIntoFrames(bundleA, 150)
    expect(framesA.length).toBeGreaterThan(1)

    // バンドルAの最初の1枚だけ受信（未完了状態にしておく）
    await receiver.ingestFrame(framesA[0]!)
    expect(receiver.getState().received).toBe(1)

    // 別の内容でバンドルBを作る（bundleIdが変わる想定）
    const entryB = await engine.create({ type: 'message', authorName: 'たなか', body: '新しい送信です' })
    const bundleB = await makeBundle(codec, [entryB])
    expect(bundleB.bundleId).not.toBe(bundleA.bundleId)
    const [frameB] = await codec.splitIntoFrames(bundleB)

    const result = await receiver.ingestFrame(frameB!)
    // バンドルAの残りフレームを待たずに、バンドルBが単独で完了する
    // （＝バンドルAの受信状態が正しく破棄されている）
    expect(result.complete).toBe(true)
    expect(result.bundle).toEqual(bundleB)
  })

  it('reset()を呼ぶと受信状態が初期化される', async () => {
    const codec = new QRCodec()
    const receiver = new QRReceiver(codec)
    const engine = await newEngine('node-a')
    const entries: CRDTEntry[] = []
    for (let i = 0; i < 6; i += 1) {
      entries.push(await engine.create({ type: 'supply', itemName: `物資${i}`, quantity: 1, unit: '個' }))
    }
    const bundle = await makeBundle(codec, entries)
    const frames = await codec.splitIntoFrames(bundle, 150)
    expect(frames.length).toBeGreaterThan(1)

    await receiver.ingestFrame(frames[0]!)
    expect(receiver.getState().received).toBe(1)

    receiver.reset()
    expect(receiver.getState()).toEqual({ bundleId: null, total: 0, received: 0, progress: 0 })
  })

  describe('1-3修正: ランタイム検証（壊れた/不正なデータの拒否）', () => {
    it('全フレーム結合後の中身がQRBundleのスキーマを満たさない場合はエラーになる', async () => {
      const codec = new QRCodec()
      const receiver = new QRReceiver(codec)

      // publicKeyが欠けた、壊れた形式のエントリを含むバンドルを手作りする
      // （本来はCRDTEngineが必ず埋めるため、これは「壊れた/悪意あるQR」を
      // 模したケース）。codec.encodeFrame()を使うことで、hash計算や
      // base64urlエンコード等のワイヤーフォーマットの詳細を正しく踏襲する。
      const malformedBundle = {
        bundleId: 'bundle-broken',
        fromNodeId: 'node-a',
        fromNodeName: 'たなか',
        createdAt: Date.now(),
        entryCount: 1,
        payloadHash: 'dummy',
        entries: [
          {
            id: 'e1',
            nodeId: 'node-a',
            nodeName: 'たなか',
            data: { type: 'safety', name: 'たなか', status: 'safe' },
            vectorClock: { 'node-a': 1 },
            lamportClock: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deleted: false,
            signature: 'not-a-real-signature',
            // publicKey が欠落している（壊れたエントリ）
          },
        ],
      }
      const json = JSON.stringify(malformedBundle)
      const hash = await shortHash(json)
      const frame = codec.encodeFrame({
        protocol: 'MR2',
        bundleId: malformedBundle.bundleId,
        index: 0,
        total: 1,
        hash,
        chunk: json,
      })

      await expect(receiver.ingestFrame(frame)).rejects.toThrow(/形式が不正/)
    })

    it('ハッシュが一致しない（伝送破損を模した）データはスキーマ検証の前にエラーになる', async () => {
      const codec = new QRCodec()
      const receiver = new QRReceiver(codec)
      const engine = await newEngine('node-a')
      const entry = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
      const bundle = await makeBundle(codec, [entry])
      const [frame] = await codec.splitIntoFrames(bundle)

      // hashフィールドだけ壊す（フィールド区切りは'|'）
      const parts = frame!.split('|')
      parts[4] = 'deadbeef'
      const tamperedFrame = parts.join('|')

      await expect(receiver.ingestFrame(tamperedFrame)).rejects.toThrow(/ハッシュ不一致/)
    })
  })
})
