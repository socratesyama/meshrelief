/**
 * MeshRelief — QR受信データのランタイムスキーマ検証
 * =============================================================================
 * ロードマップ「1-3. 受信データにランタイムの型検証が一切ない」への対応。
 *
 * 問題: qr-receiver.ts はこれまで `JSON.parse(json) as QRBundle` のように
 * TypeScriptの`as`だけで型を断定していた。`as`は実行時には何も保証しない
 * ため、壊れたQR・悪意あるQRが「型だけそれっぽいがフィールドが欠けている/
 * 型が違う」JSONを送ってきた場合、後段（UIレンダリング、compareForLWWの
 * 数値比較等）で未定義動作や例外が起きる可能性があった。
 *
 * 対応: zodでQRBundle/CRDTEntryの実行時スキーマを1つ定義し、JSON.parse
 * 直後に`.parse()`する。検証に失敗したフレーム/バンドルは、同期セッション
 * 全体を巻き込まず、そのフレームだけを拒否する（呼び出し側でエラーとして
 * 捕捉し、スキャンを継続できるようにする。qr-receiver.ts参照）。
 *
 * 設計判断メモ:
 *  - types.ts の型定義を変更するとスキーマと二重管理になり、片方だけ更新
 *    し忘れる事故が起きやすい。ただしzodからTypeScript型を逆生成する
 *    （z.infer）と、DataRecordのように「4種別のUnionだが更新時はpatch的に
 *    緩める」型（DataRecordPatch）との相性が悪くなるため、ここでは
 *    「types.tsの型定義が一次情報、schema.tsはそれを実行時になぞる」
 *    という構成にした（他言語プロジェクトでもよくある二重定義だが、
 *    フィールドが変わるたびに両方直す必要がある点はDECISIONS.mdに明記する）。
 *  - 署名アルゴリズムを公開鍵署名(ECDSA)に切り替えた後も、signatureは
 *    「アルゴリズムを問わない文字列」として検証する（1-1対応後もHMAC/ECDSA
 *    どちらの実装でも変更不要）。
 * =============================================================================
 */

import { z } from 'zod'

// -----------------------------------------------------------------------------
// 基礎スキーマ
// -----------------------------------------------------------------------------

const vectorClockSchema = z.record(z.string(), z.number())

const baseDataFieldsSchema = {
  shelterId: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).optional(),
  notes: z.string().optional(),
}

const safetyRecordSchema = z.object({
  type: z.literal('safety'),
  name: z.string(),
  phone: z.string().optional(),
  status: z.enum(['safe', 'injured', 'needs_help', 'unknown']),
  needsMedicine: z.boolean().optional(),
  needsCare: z.boolean().optional(),
  ...baseDataFieldsSchema,
})

const supplyRecordSchema = z.object({
  type: z.literal('supply'),
  itemName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  ...baseDataFieldsSchema,
})

const shelterRecordSchema = z.object({
  type: z.literal('shelter'),
  name: z.string(),
  address: z.string().optional(),
  capacity: z.number().optional(),
  currentOccupancy: z.number().optional(),
  status: z.enum(['open', 'limited', 'full', 'closed']),
  ...baseDataFieldsSchema,
})

const messageRecordSchema = z.object({
  type: z.literal('message'),
  authorName: z.string(),
  body: z.string(),
  ...baseDataFieldsSchema,
})

export const dataRecordSchema = z.discriminatedUnion('type', [
  safetyRecordSchema,
  supplyRecordSchema,
  shelterRecordSchema,
  messageRecordSchema,
])

/**
 * CRDTEntryのランタイムスキーマ。
 * signatureは「文字列であること」のみ検証する（署名アルゴリズムに非依存。
 * 実際の署名検証はCRDTEngine.verify()が別途行う）。
 */
export const crdtEntrySchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  data: dataRecordSchema,
  vectorClock: vectorClockSchema,
  lamportClock: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deleted: z.boolean(),
  signature: z.string(),
  verified: z.boolean().optional(),
  /**
   * 【1-1修正】ECDSA公開鍵(hex, 'raw'形式)。HMAC共有鍵方式は完全に
   * 廃止したため、全エントリが必ず持つ必須フィールドとした
   * （engine/crdt.ts / types.ts CRDTEntry.publicKey 参照）。
   */
  publicKey: z.string(),
})

/**
 * QRBundleのランタイムスキーマ。
 * entriesは「配列であること」までは検証するが、要素ごとのcrdtEntrySchema
 * 検証はqr-receiver.ts側で個別に行う（1件だけ壊れているケースで
 * バンドル全体を即座に捨てるのではなく、後続処理側の設計判断に委ねるため）。
 */
export const qrBundleSchema = z.object({
  bundleId: z.string(),
  fromNodeId: z.string(),
  fromNodeName: z.string(),
  createdAt: z.number(),
  entryCount: z.number(),
  payloadHash: z.string(),
  entries: z.array(crdtEntrySchema),
})

export type ValidatedQRBundle = z.infer<typeof qrBundleSchema>

/**
 * WebRTC DataChannel経由でやり取りするSyncMessageのランタイムスキーマ。
 * QR/テキスト同期と同じ理由（1-3）で、DataChannelの`onmessage`で受け取る
 * 生JSONも「他ノード＝信頼できない入力」であることに変わりはないため検証する。
 */
export const syncMessageSchema = z.object({
  type: z.enum(['hello', 'sync-request', 'sync-response', 'ack']),
  nodeId: z.string(),
  nodeName: z.string().optional(),
  vectorClock: vectorClockSchema.optional(),
  entries: z.array(crdtEntrySchema).optional(),
})
