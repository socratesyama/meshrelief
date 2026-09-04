import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

// jsdomはIndexedDBを実装していない。src/storage/db.ts（ひいてはengine/mesh.ts）が
// idb経由でIndexedDBに依存しているため、fake-indexeddb（インメモリ実装）で
// global.indexedDB / global.IDBKeyRange を補う。'/auto' はimportするだけで
// グローバルへの登録まで行ってくれるエントリポイント。

// jsdomは Web Crypto API のうち crypto.subtle（SubtleCrypto）を実装していない。
// src/engine/crdt.ts の CRDTEngine は HMAC署名（sign/verify/generateKey/exportKey/
// importKey）で crypto.subtle に依存しているため、これが無いと crdt.test.ts が
// 軒並み失敗する。Node組み込みの webcrypto を globalThis.crypto に補完しておく。
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
}

// jsdomにはCanvasの実装が無いため、QRコード生成(qrcode.react)やjsqrのデコード処理を
// 含むコンポーネントのユニットテストでは、必要に応じてテストファイル側で個別に
// canvasやgetUserMedia等をモックすること。
// （Canvas全体のグローバルpolyfillはコストが高いため、ここでは意図的に入れない）
