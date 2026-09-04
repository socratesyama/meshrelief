/**
 * QRCodec — QR同期テスト（実装計画書 v2 §9.2）
 * =============================================================================
 * §9.2の5項目に対応する describe ブロックを用意している:
 *   単一QR / Animated QR / ハッシュ検証 / フレーム欠落 / 差分のみ
 *
 * 注記:
 *  - 「フレーム欠落」「差分のみ」は、doc上はQR同期プロトコル全体（受信側の
 *    QRReceiverや送信側のCRDTEngine.getEntriesSinceも含む）に関わる項目だが、
 *    今回は qr-codec.ts のテストとして指定されているため、
 *    qr-codec.ts自身のAPI（decodeFrameの自己完結性・順序非依存性、
 *    createBundleが渡された配列をそのまま反映すること）を中心に検証する。
 *    「差分のみ」はqr-codec.ts単体では完結しない性質のため、前セッションで
 *    実装済みの CRDTEngine.getEntriesSince() と組み合わせた検証にしている。
 *  - 5項目に加えて、§9.2には無いがqr-codec.ts自身の中核機能である
 *    vectorClock QRのエンコード/デコードについても、既存の防御的実装
 *    （nodeNameに`|`が含まれる場合の復元）を含めて簡単に確認している。
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { QRCodec, base64urlDecode, base64urlEncode, sha256Hex, shortHash } from './qr-codec'
import { CRDTEngine } from '../engine/crdt'
import type { CRDTEntry, QRBundle } from '../types'

const codec = new QRCodec()

async function newEngine(nodeId: string, nodeName: string = nodeId): Promise<CRDTEngine> {
  const { privateKey, publicKey } = await CRDTEngine.generateKeyPair()
  const publicKeyHex = await CRDTEngine.exportPublicKey(publicKey)
  return new CRDTEngine({ nodeId, nodeName, privateKey, publicKey, publicKeyHex })
}

async function makeBundle(entries: CRDTEntry[], fromNodeId = 'node-a', fromNodeName = 'たなか'): Promise<QRBundle> {
  return codec.createBundle(entries, fromNodeId, fromNodeName)
}

describe('QRCodec — QR同期テスト（§9.2）', () => {
  describe('単一QR', () => {
    it('1枚に収まるデータは1フレームになり、デコードすると元のバンドルに復元できる', async () => {
      const engine = await newEngine('node-a')
      const entry = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
      const bundle = await makeBundle([entry])

      const frames = await codec.splitIntoFrames(bundle)
      expect(frames).toHaveLength(1)

      const decoded = codec.decodeFrame(frames[0]!)
      expect(decoded.bundleId).toBe(bundle.bundleId)
      expect(decoded.index).toBe(0)
      expect(decoded.total).toBe(1)

      const restored = JSON.parse(decoded.chunk) as QRBundle
      expect(restored).toEqual(bundle)
    })

    it('デフォルトのMAX_QR_PAYLOAD(1800)以下のバンドルは1フレームに収まる', async () => {
      const engine = await newEngine('node-a')
      const entry = await engine.create({ type: 'message', authorName: 'たなか', body: '無事です' })
      const bundle = await makeBundle([entry])

      const frames = await codec.splitIntoFrames(bundle)
      expect(frames).toHaveLength(1)
    })
  })

  describe('Animated QR', () => {
    it('複数フレームに分割されたデータを、順番に結合すると元のJSONに復元できる', async () => {
      const engine = await newEngine('node-a')
      const entries: CRDTEntry[] = []
      for (let i = 0; i < 10; i += 1) {
        entries.push(
          await engine.create({
            type: 'supply',
            itemName: `物資${i}`,
            quantity: i + 1,
            unit: '個',
          }),
        )
      }
      const bundle = await makeBundle(entries)

      // 小さいmaxPayloadを指定して、確実に複数フレームに分割させる
      const frames = await codec.splitIntoFrames(bundle, 200)
      expect(frames.length).toBeGreaterThan(1)

      const decodedFrames = frames.map((f) => codec.decodeFrame(f))
      // 全フレームが同じbundleId・total・hashを共有していること
      const { bundleId, total, hash } = decodedFrames[0]!
      for (const f of decodedFrames) {
        expect(f.bundleId).toBe(bundleId)
        expect(f.total).toBe(total)
        expect(f.hash).toBe(hash)
      }
      expect(total).toBe(frames.length)

      const reassembled = Array.from({ length: total }, (_, i) => {
        const frame = decodedFrames.find((f) => f.index === i)
        if (!frame) throw new Error(`frame ${i} not found`)
        return frame.chunk
      }).join('')

      expect(JSON.parse(reassembled)).toEqual(bundle)
    })
  })

  describe('ハッシュ検証', () => {
    it('splitIntoFramesが埋め込むhashは、バンドルJSON全体のSHA-256先頭8桁と一致する', async () => {
      const engine = await newEngine('node-a')
      const entry = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
      const bundle = await makeBundle([entry])

      const frames = await codec.splitIntoFrames(bundle)
      const decoded = codec.decodeFrame(frames[0]!)
      const expectedHash = await shortHash(JSON.stringify(bundle))

      expect(decoded.hash).toBe(expectedHash)
      expect(decoded.hash).toHaveLength(8)
    })

    it('内容が1文字でも異なれば、ハッシュも変わる（不正なデータの検出可能性）', async () => {
      const engine = await newEngine('node-a')
      const entry = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
      const bundle = await makeBundle([entry])
      const original = JSON.stringify(bundle)
      const tampered = original.slice(0, -1) + (original.at(-1) === '}' ? ']' : '}')

      const originalHash = await shortHash(original)
      const tamperedHash = await shortHash(tampered)
      expect(tamperedHash).not.toBe(originalHash)
    })

    it('sha256Hexは同一入力に対して常に同じ値を返す（決定性）', async () => {
      const bundle = await makeBundle([])
      const json = JSON.stringify(bundle)
      const hash1 = await sha256Hex(json)
      const hash2 = await sha256Hex(json)
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 = 32byte = 64hex文字
    })
  })

  describe('フレーム欠落', () => {
    it('decodeFrameは各フレームが自己完結しており、順不同（シャッフル）でも正しくデコードできる', async () => {
      const engine = await newEngine('node-a')
      const entries: CRDTEntry[] = []
      for (let i = 0; i < 8; i += 1) {
        entries.push(await engine.create({ type: 'supply', itemName: `物資${i}`, quantity: 1, unit: '個' }))
      }
      const bundle = await makeBundle(entries)
      const frames = await codec.splitIntoFrames(bundle, 150)
      expect(frames.length).toBeGreaterThan(2)

      // シャッフルして受信順を入れ替える（Animated QRは実際の撮影順が保証されない）
      const shuffled = [...frames].sort(() => Math.random() - 0.5)
      const decoded = shuffled.map((f) => codec.decodeFrame(f))

      // 順番を入れ替えても、それぞれ正しいindexを保持していること
      const indexes = decoded.map((f) => f.index).sort((a, b) => a - b)
      expect(indexes).toEqual(Array.from({ length: frames.length }, (_, i) => i))
    })

    it('一部のフレームが欠落した状態では、元のJSONを正しく復元できない（＝欠落を検出できる）', async () => {
      const engine = await newEngine('node-a')
      const entries: CRDTEntry[] = []
      for (let i = 0; i < 8; i += 1) {
        entries.push(await engine.create({ type: 'supply', itemName: `物資${i}`, quantity: 1, unit: '個' }))
      }
      const bundle = await makeBundle(entries)
      const frames = await codec.splitIntoFrames(bundle, 150)
      expect(frames.length).toBeGreaterThan(2)

      // 真ん中のフレームを1枚欠落させる
      const missingIndex = Math.floor(frames.length / 2)
      const incomplete = frames.filter((_, i) => i !== missingIndex)
      const decoded = incomplete.map((f) => codec.decodeFrame(f))

      expect(decoded).toHaveLength(frames.length - 1)
      expect(decoded.some((f) => f.index === missingIndex)).toBe(false)

      // 欠落したまま連結すると、元のJSONとしてパースできない（またはハッシュが合わない）
      const reassembled = decoded
        .sort((a, b) => a.index - b.index)
        .map((f) => f.chunk)
        .join('')
      const reassembledHash = await shortHash(reassembled)
      expect(reassembledHash).not.toBe(decoded[0]!.hash)

      let parseFailed = false
      try {
        JSON.parse(reassembled)
      } catch {
        parseFailed = true
      }
      // 欠落によりJSONとして壊れているか、パースできてもハッシュ不一致で検出できる
      expect(parseFailed || reassembledHash !== decoded[0]!.hash).toBe(true)
    })
  })

  describe('差分のみ', () => {
    it('2回目の同期では、1回目で送った分を除いた差分エントリだけがバンドルに含まれる', async () => {
      const sender = await newEngine('node-sender')

      // 1回目の同期前に2件作成
      await sender.create({ type: 'safety', name: 'たなか', status: 'safe' })
      await sender.create({ type: 'safety', name: 'やまだ', status: 'safe' })

      // 受信側は最初は何も持っていない（vectorClock = {}）
      const firstDiff = sender.getEntriesSince({})
      expect(firstDiff).toHaveLength(2)
      const firstBundle = await makeBundle(firstDiff)
      expect(firstBundle.entryCount).toBe(2)

      // 受信側は1回目の同期で、sender視点のvectorClockまで追いついたとみなす
      const vcAfterFirstSync = sender.getVectorClock()

      // その後、送信側にさらに1件追加
      await sender.create({ type: 'safety', name: 'さとう', status: 'safe' })

      // 2回目の差分は、新しく追加した1件だけになるはず
      const secondDiff = sender.getEntriesSince(vcAfterFirstSync)
      expect(secondDiff).toHaveLength(1)
      expect(secondDiff[0]?.data).toMatchObject({ name: 'さとう' })

      const secondBundle = await makeBundle(secondDiff)
      expect(secondBundle.entryCount).toBe(1)
      expect(secondBundle.entries).toHaveLength(1)
    })
  })

  describe('vectorClock QR（参考: §9.2の5項目には含まれないが、qr-codec.tsの中核機能のため確認）', () => {
    it('encodeVectorClock/decodeVectorClockが往復で一致する', () => {
      const vc = { 'node-a': 3, 'node-b': 1 }
      const qr = codec.encodeVectorClock(vc, 'node-a', 'たなか')
      const decoded = codec.decodeVectorClock(qr)
      expect(decoded).toEqual({ nodeId: 'node-a', nodeName: 'たなか', vectorClock: vc })
    })

    it('nodeNameに区切り文字"|"が含まれていても正しく復元できる', () => {
      const qr = codec.encodeVectorClock({}, 'node-a', 'たなか|やまだ')
      const decoded = codec.decodeVectorClock(qr)
      expect(decoded.nodeName).toBe('たなか|やまだ')
    })

    it('detectQRKindがvectorClock QR/フレームQR/不明を正しく判定する', async () => {
      const engine = await newEngine('node-a')
      const entry = await engine.create({ type: 'safety', name: 'たなか', status: 'safe' })
      const bundle = await makeBundle([entry])
      const [frame] = await codec.splitIntoFrames(bundle)
      const vcQR = codec.encodeVectorClock({}, 'node-a', 'たなか')

      expect(codec.detectQRKind(vcQR)).toBe('vector-clock')
      expect(codec.detectQRKind(frame!)).toBe('frame')
      expect(codec.detectQRKind('全く関係ないテキスト')).toBe('unknown')
    })
  })

  describe('base64url（参考: Web Crypto API以外の自作ユーティリティのため念のため確認）', () => {
    it('日本語を含む文字列を往復エンコード/デコードできる', () => {
      const text = JSON.stringify({ message: '道路が冠水しています🌊' })
      const encoded = base64urlEncode(text)
      expect(encoded).not.toMatch(/[+/=]/) // base64url特有の文字が含まれていないこと
      expect(base64urlDecode(encoded)).toBe(text)
    })
  })
})
