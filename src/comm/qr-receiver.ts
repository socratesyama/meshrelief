/**
 * MeshRelief — QRReceiver
 * =============================================================================
 * 実装計画書 v2 §2.6「受信側の状態管理」に対応。
 *
 * 実装した項目:
 *  - フレーム蓄積        : Map<index, chunk> で保持（重複スキャンは自然に冪等）
 *  - 別バンドル検知時のリセット: bundleIdが変わったら状態を初期化（§2.6のロジックをそのまま採用）
 *  - 進捗計算            : frames.size / total（0.0〜1.0）
 *  - ハッシュ検証        : 全フレーム結合後、SHA-256先頭8桁を比較
 *  - 完成時のJSON復元    : JSON.parse() して QRBundle として返す
 *  - エラーハンドリング  : 不正フレーム/バンドル不整合/ハッシュ不一致/JSON破損を
 *                          それぞれ判別可能なメッセージ付きErrorとしてthrowする
 *
 * 設計判断メモ:
 *
 *  - crypto.subtle.digest が非同期APIのため、ingestFrame() は
 *    §2.6の擬似コード（同期関数に見える）とは異なり async にしている
 *    （qr-codec.ts のファイル冒頭コメント、docs/DECISIONS.md にも記録）。
 *
 *  - §2.6の擬似コードには無いが、「同じbundleIdなのにtotal/hashが食い違う」
 *    ケースを不整合として明示的にエラーにしている。正常系では同一バンドルの
 *    全フレームは同じtotal/hashを持つはずなので、これが起きるのは
 *    「送信側の別バンドルとindexが衝突した」等の異常時のみであり、
 *    黙って上書きするより早期に検知してユーザーに再スキャンを促す方が安全。
 *
 *  - `getState()` と `reset()` は計画書に明記されていないが、
 *    §2.1のフロー「進捗表示: '7/12フレーム受信'」をUI側（QRScanner.tsx,
 *    次回以降実装）で表示するために必要な最小限の追加。
 * =============================================================================
 */

import type { QRBundle, QRIngestResult } from '../types'
import { QRCodec, shortHash } from './qr-codec'
import { qrBundleSchema } from './schema'

export interface QRReceiverState {
  bundleId: string | null
  total: number
  received: number
  /** 0.0〜1.0 */
  progress: number
}

export class QRReceiver {
  private readonly frames = new Map<number, string>()
  private bundleId: string | null = null
  private total = 0
  private expectedHash: string | null = null
  private readonly codec: QRCodec

  constructor(codec: QRCodec = new QRCodec()) {
    this.codec = codec
  }

  /**
   * QRコード1枚分のスキャン結果（テキスト）を取り込む。
   * 全フレームが揃った時点でハッシュ検証・JSON復元まで行う。
   *
   * @throws フレームの形式が不正な場合（QRCodec.decodeFrameから伝播）
   * @throws 同一bundleId内でtotal/hashが食い違う場合（データ不整合）
   * @throws 全フレーム受信後、ハッシュが一致しない場合（伝送中の破損）
   * @throws 全フレーム受信・ハッシュ一致後、JSON.parseに失敗した場合
   */
  async ingestFrame(frameText: string): Promise<QRIngestResult> {
    const parsed = this.codec.decodeFrame(frameText)

    if (this.bundleId !== parsed.bundleId) {
      // 別のバンドルのフレームが来た（＝新しい送信が始まった）のでリセットする（§2.6）。
      // this.bundleId が null の初回呼び出し時も、このパスで初期化される。
      this.frames.clear()
      this.bundleId = parsed.bundleId
      this.total = parsed.total
      this.expectedHash = parsed.hash
    } else if (parsed.total !== this.total || parsed.hash !== this.expectedHash) {
      throw new Error(
        `ingestFrame: bundleId="${parsed.bundleId}" のフレーム間でtotal/hashが一致しません（データ不整合の可能性があります。最初からスキャンし直してください）`,
      )
    }

    this.frames.set(parsed.index, parsed.chunk)

    const progress = this.total > 0 ? this.frames.size / this.total : 0

    if (this.frames.size < this.total) {
      return { complete: false, progress }
    }

    // 全フレーム受信完了 → 結合・ハッシュ検証・JSON復元
    const json = this.assembleJson()
    const actualHash = await shortHash(json)
    if (actualHash !== this.expectedHash) {
      throw new Error(
        'ingestFrame: ハッシュ不一致です。データが破損している可能性があります。もう一度スキャンし直してください',
      )
    }

    // 【1-3修正】従来は `JSON.parse(json) as QRBundle` としていたが、
    // `as` は実行時には何も保証しない。壊れた/悪意あるQRが「型だけ
    // それっぽいがフィールドが欠けている・型が違う」JSONを送ってきた場合、
    // 後段（UIレンダリング、compareForLWWの数値比較等）で未定義動作や
    // 例外が起きうる。JSON.parse直後にzodスキーマで検証し、不正な形の
    // データはこの時点で明確なエラーとして拒否する（呼び出し側=
    // MeshReliefEngine.ingestQRFrameがこれを捕捉し、スキャンを継続できる）。
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(json)
    } catch {
      throw new Error('ingestFrame: 受信データのJSON復元に失敗しました')
    }

    const validation = qrBundleSchema.safeParse(parsedJson)
    if (!validation.success) {
      throw new Error(
        'ingestFrame: 受信データの形式が不正です（壊れたQR、または非対応バージョンの可能性があります）',
      )
    }
    const bundle: QRBundle = validation.data

    return { complete: true, progress: 1, bundle }
  }

  /** 蓄積済みチャンクを index 順に連結し、元のJSON文字列を復元する。 */
  private assembleJson(): string {
    const parts: string[] = []
    for (let i = 0; i < this.total; i++) {
      const chunk = this.frames.get(i)
      if (chunk === undefined) {
        // frames.size === total のタイミングでのみ呼ばれるため通常到達しないが、
        // 念のための防御的チェック
        throw new Error(`ingestFrame: フレーム ${i} が欠落しています`)
      }
      parts.push(chunk)
    }
    return parts.join('')
  }

  /** 現在の受信状態を参照する（進捗UI表示用）。 */
  getState(): QRReceiverState {
    return {
      bundleId: this.bundleId,
      total: this.total,
      received: this.frames.size,
      progress: this.total > 0 ? this.frames.size / this.total : 0,
    }
  }

  /** 受信状態を手動でリセットする（UIの「やり直す」操作等から呼び出す）。 */
  reset(): void {
    this.frames.clear()
    this.bundleId = null
    this.total = 0
    this.expectedHash = null
  }
}
