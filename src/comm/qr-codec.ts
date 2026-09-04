/**
 * MeshRelief — QRCodec
 * =============================================================================
 * 実装計画書 v2 §2.2〜§2.5 に対応。
 *
 *  §2.2 QRフレームフォーマットのエンコード/デコード
 *       `MR2|{bundleId}|{index}|{total}|{sha256}|{base64url(chunk)}`
 *  §2.3 vectorClock QRフォーマットのエンコード/デコード
 *       `MR2|VC|{nodeId}|{nodeName}|{base64url(vectorClock JSON)}`
 *  §2.4 差分バンドル（QRBundle）の生成
 *  §2.5 チャンク分割アルゴリズム（MAX_QR_PAYLOAD = 1800）
 *
 * sha256 / base64url は指示の通り、新規ライブラリを追加せず標準の
 * Web Crypto API（crypto.subtle.digest）とブラウザ標準の btoa/atob のみで実装している。
 *
 * 設計判断メモ（後続セッション・qr-codec.test.ts 実装時に参照すること）:
 *
 *  - crypto.subtle.digest は本質的に非同期APIのため、SHA-256を必要とする
 *    createBundle() / splitIntoFrames() は、擬似コード上は同期関数に見えるが
 *    このファイルでは**すべて async** にしている。
 *    → 次回 engine/mesh.ts 実装時、`generateAnimatedQR()` や
 *      `prepareDiffBundle()` は擬似コードの見た目（非async）とは異なり
 *      async化が必要になる点に注意（docs/DECISIONS.md にも記録済み）。
 *
 *  - §2.5のsplitIntoFrames擬似コードは内部で新たに
 *    `const bundleId = crypto.randomUUID();` している。しかしこれは
 *    §2.4のcreateBundle()で既に発行済みの bundle.bundleId と矛盾する
 *    （フレームのbundleIdとQRBundle.bundleIdが別々のUUIDになってしまう）。
 *    このファイルでは createBundle() 時に発行した bundle.bundleId を
 *    splitIntoFrames() でもそのまま再利用する（バンドルIDは生成時に
 *    一度だけ決まるべきという原則を優先した）。
 *
 *  - QRBundle.payloadHash（§2.4）と、フレームの sha256（§2.2, §2.5の hash 変数）
 *    は役割が異なる2層のハッシュとして実装している。
 *      - payloadHash: entries配列のみのSHA-256（先頭8桁）。
 *        バンドルの「中身」のコンテンツフィンガープリント。
 *      - フレームのhash: バンドル全体（JSON.stringify(bundle)。
 *        payloadHash確定後の状態）のSHA-256（先頭8桁）。
 *        QRの分割・再結合という伝送経路上の破損を検知するためのもの。
 *    §2.5のコード例で `sha256(json).slice(0, 8)` としているのは後者にあたる。
 *
 *  - vectorClock QR（§2.3）のnodeNameは自由入力のユーザー名であり、
 *    区切り文字 `|` を含む可能性が理論上ある。区切りの最後のフィールド
 *    （base64urlペイロード）は `|` を含み得ないため「末尾から」ペイロードを
 *    確定し、nodeIdとペイロードの間をすべてnodeNameとして復元することで、
 *    nodeNameに`|`が含まれていても壊れないようにしている。
 * =============================================================================
 */

import { v4 as uuidv4 } from 'uuid'
import { QR_PROTOCOL_VERSION } from '../types'
import type { CRDTEntry, NodeId, QRBundle, QRFrame, VectorClock, VectorClockQRPayload } from '../types'

/** QR Version 40の安全圏（§2.5）。 */
export const MAX_QR_PAYLOAD = 1800

/**
 * 【1-3修正】1バンドルあたりの最大フレーム数。
 * 悪意ある（または壊れた）1枚のQRが `total: 999999999` のような
 * 途方もないヘッダーを主張した場合、次のフレームが来るまで実害はないが、
 * 進捗バーの表示が壊れる／永久に完了しない受信状態にロックする、といった
 * 軽量なDoSを許してしまう（ロードマップ1-3参照）。
 * MAX_QR_PAYLOAD(1800文字)×200フレーム＝360KBは、本アプリの想定データ規模
 * （最大200件程度・§2.8）から見て十分すぎる上限であるため、これを超える
 * `total` を主張するフレームは即座に拒否する。
 */
export const MAX_QR_FRAMES = 200

const FIELD_DELIMITER = '|'
const VC_MARKER = 'VC'

// -----------------------------------------------------------------------------
// SHA-256 / base64url ユーティリティ（Web Crypto APIのみ使用）
// -----------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 文字列のSHA-256ハッシュを16進文字列で返す。 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

/**
 * SHA-256ハッシュの先頭8桁。計画書中の全てのハッシュ表記
 * （`e3b0c442` 等）はこの8桁形式に統一されているため、それに合わせる。
 */
export async function shortHash(input: string): Promise<string> {
  return (await sha256Hex(input)).slice(0, 8)
}

/**
 * 文字列をUTF-8バイト列に変換した上でBase64URLエンコードする。
 * （日本語を含むJSONを想定しているため、btoa(str)を直接呼ぶのではなく、
 * 必ずUTF-8バイト列を経由する）
 */
export function base64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64urlEncode() の逆変換。 */
export function base64urlDecode(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (base64.length % 4)) % 4
  const padded = base64 + '='.repeat(paddingLength)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// -----------------------------------------------------------------------------
// QRCodec
// -----------------------------------------------------------------------------

export class QRCodec {
  // ---------------------------------------------------------------------
  // §2.3 vectorClock QR
  // ---------------------------------------------------------------------

  encodeVectorClock(vectorClock: VectorClock, nodeId: NodeId, nodeName: string): string {
    const payload = base64urlEncode(JSON.stringify(vectorClock))
    return [QR_PROTOCOL_VERSION, VC_MARKER, nodeId, nodeName, payload].join(FIELD_DELIMITER)
  }

  decodeVectorClock(text: string): VectorClockQRPayload {
    const parts = text.split(FIELD_DELIMITER)
    if (parts.length < 5 || parts[0] !== QR_PROTOCOL_VERSION || parts[1] !== VC_MARKER) {
      throw new Error('decodeVectorClock: vectorClock QRの形式が不正です')
    }

    const nodeId = parts[2]
    // nodeNameに`|`が含まれる可能性があるため、末尾（base64urlペイロード。
    // `|`を含み得ない）を先に確定し、nodeIdとペイロードの間を全てnodeNameとして扱う
    const rest = parts.slice(3)
    const payload = rest[rest.length - 1]
    const nodeName = rest.slice(0, -1).join(FIELD_DELIMITER)

    let vectorClock: VectorClock
    try {
      vectorClock = JSON.parse(base64urlDecode(payload)) as VectorClock
    } catch {
      throw new Error('decodeVectorClock: vectorClockのデコードに失敗しました')
    }

    return { nodeId, nodeName, vectorClock }
  }

  // ---------------------------------------------------------------------
  // §2.4 差分バンドル生成
  // ---------------------------------------------------------------------

  async createBundle(entries: CRDTEntry[], fromNodeId: NodeId, fromNodeName: string): Promise<QRBundle> {
    const payloadHash = await shortHash(JSON.stringify(entries))
    return {
      bundleId: uuidv4(),
      fromNodeId,
      fromNodeName,
      createdAt: Date.now(),
      entryCount: entries.length,
      payloadHash,
      entries,
    }
  }

  // ---------------------------------------------------------------------
  // §2.5 チャンク分割
  // ---------------------------------------------------------------------

  /**
   * バンドルをQRフレーム（文字列）の配列に分割する。
   * @param maxPayload 1フレームあたりの最大文字数（テスト用に上書き可能。既定値はMAX_QR_PAYLOAD）
   */
  async splitIntoFrames(bundle: QRBundle, maxPayload: number = MAX_QR_PAYLOAD): Promise<string[]> {
    const json = JSON.stringify(bundle)
    const total = Math.max(1, Math.ceil(json.length / maxPayload))
    // ファイル冒頭コメントの通り、新規UUIDは発行せず bundle.bundleId を再利用する
    const bundleId = bundle.bundleId
    const hash = await shortHash(json)

    const frames: string[] = []
    for (let i = 0; i < total; i++) {
      const chunk = json.slice(i * maxPayload, (i + 1) * maxPayload)
      frames.push(
        this.encodeFrame({
          protocol: QR_PROTOCOL_VERSION,
          bundleId,
          index: i,
          total,
          hash,
          chunk,
        }),
      )
    }
    return frames
  }

  // ---------------------------------------------------------------------
  // §2.2 QRフレームのエンコード/デコード
  // ---------------------------------------------------------------------

  /** QRFrame（デコード済み表現）を、QRコードに載せるワイヤーフォーマット文字列に変換する。 */
  encodeFrame(frame: QRFrame): string {
    return [
      frame.protocol,
      frame.bundleId,
      String(frame.index),
      String(frame.total),
      frame.hash,
      base64urlEncode(frame.chunk),
    ].join(FIELD_DELIMITER)
  }

  /**
   * ワイヤーフォーマット文字列をQRFrameにデコードする。
   * chunkはbase64urlデコード済みの平文チャンクとして返す
   * （QRReceiverはこの平文チャンクをそのまま連結してJSONを復元できる）。
   */
  decodeFrame(text: string): QRFrame {
    const parts = text.split(FIELD_DELIMITER)

    // フィールド数チェックより先に判定する: vectorClock QR（§2.3）は通常5フィールド
    // ("MR2|VC|...")であり、nodeNameに`|`を含まない限り「フィールド数不一致」で
    // 先に弾かれてしまい、下記のよくある誤用に対する分かりやすいエラーに到達できない。
    if (parts[0] !== QR_PROTOCOL_VERSION) {
      throw new Error(`decodeFrame: 未知のプロトコルです（${parts[0]}）`)
    }
    if (parts[1] === VC_MARKER) {
      // よくある誤用（vectorClock QRを間違ってdecodeFrameに渡した）を早期に検知する
      throw new Error('decodeFrame: これはvectorClock QRです（decodeVectorClockを使用してください）')
    }
    if (parts.length !== 6) {
      throw new Error('decodeFrame: 不正なQRフレーム形式です（フィールド数が一致しません）')
    }

    // 先頭(protocol)は上で検証済みのため分割代入では読み捨てる
    const [, bundleId, indexStr, totalStr, hash, encodedChunk] = parts

    const index = Number(indexStr)
    const total = Number(totalStr)
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total <= 0 || index >= total) {
      throw new Error('decodeFrame: フレーム番号（index/total）が不正です')
    }
    if (total > MAX_QR_FRAMES) {
      // 1-3修正: 妥当な上限を超えるtotalは、軽量DoSの疑いがあるため拒否する
      throw new Error(
        `decodeFrame: フレーム総数(${total})が上限(${MAX_QR_FRAMES})を超えています。壊れたQR、または不正なデータの可能性があります`,
      )
    }

    let chunk: string
    try {
      chunk = base64urlDecode(encodedChunk)
    } catch {
      throw new Error('decodeFrame: チャンクのデコードに失敗しました')
    }

    return { protocol: QR_PROTOCOL_VERSION, bundleId, index, total, hash, chunk }
  }

  /**
   * スキャンしたQRテキストが「vectorClock QR」か「データフレームQR」かを判定する。
   * QRScanner.tsx（次回以降実装）が、どちらのデコード関数を呼ぶべきか判断するために使う
   * ユーティリティ。計画書には明記されていないが、スキャン時の分岐に必要なため追加した。
   */
  detectQRKind(text: string): 'vector-clock' | 'frame' | 'unknown' {
    const parts = text.split(FIELD_DELIMITER)
    if (parts[0] !== QR_PROTOCOL_VERSION) return 'unknown'
    if (parts[1] === VC_MARKER) return 'vector-clock'
    if (parts.length === 6) return 'frame'
    return 'unknown'
  }
}
