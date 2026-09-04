# MeshRelief アーキテクチャ概要

実装計画書 v2 に基づき実装した MeshRelief の技術構成をまとめたもの。
各判断の詳しい経緯・設計書との対応関係は [`DECISIONS.md`](./DECISIONS.md) を参照。

## コンセプト

災害時、基地局・インターネット・Wi-Fiルーターが一切無い状況でも、
QRコードを介した物理的なデータ交換だけで避難所の安否・物資・避難所
情報を端末間で同期できる防災PWA。QR差分同期が本命、同一Wi-Fi環境が
ある場合のみWebRTCによる高速化オプションを提供する。

## レイヤー構成

```
src/
├── types.ts          データモデル・共通型の単一の定義元
├── engine/
│   ├── crdt.ts        CRDTEngine — LWW競合解決・署名・vectorClock
│   ├── mesh.ts         MeshReliefEngine — 上記4層を統合する唯一の窓口
│   └── scenario.ts      デモモード用シナリオデータ
├── comm/
│   ├── qr-codec.ts      QRフレーム/vectorClock QRのエンコード・デコード
│   ├── qr-receiver.ts    QRフレームの蓄積・ハッシュ検証・復元
│   └── webrtc.ts         WebRTC同期（高速モード、オプション）
├── storage/
│   └── db.ts             IndexedDB永続化（idb使用）
└── ui/
    ├── store.ts           Zustand — UI状態とMeshReliefEngineの橋渡し
    ├── hooks/              usePeerSync（自動役割交代の状態機械）等
    ├── App.tsx             5タブ／StationScreenの出し分けを含む統合ルート
    └── components/         SetupScreen・各Panel・共通UIパーツ
```

依存の方向は一貫して `ui → engine → comm/storage → types` であり、
逆方向の依存（例えば `engine` が `ui` を知っている等）は無い。
`comm/webrtc.ts` の `WebRTCMesh` だけは例外的に `engine/mesh.ts` の
`MeshReliefEngine` を参照するが、これは「WebRTC接続はユーザー操作に
応じて開始・終了するセッションスコープの機能であり、エンジンが恒久的に
保持するものではない」という判断による（DECISIONS.md参照）。

## データモデル（`types.ts`）

- `RecordType`: `'safety' | 'supply' | 'shelter' | 'message'` の4種類。
  各種別のデータは `DataRecord`（判別共用体）として表現される。
- `CRDTEntry`: `DataRecord` に `id` / `nodeId` / `nodeName` /
  `vectorClock` / `lamportClock` / `deleted`(tombstone) / `signature`
  を付与した、CRDTが実際に扱う最小単位。
- `PersistedMeta`: ノードの永続アイデンティティ（nodeId/nodeName/
  nodeRole/homeShelterId/vectorClock/lamportClock/hmacKeyHex）。

## CRDTエンジン（`engine/crdt.ts`）

- **競合解決（LWW）**: `lamportClock > updatedAt > nodeId` の優先順位。
  物理時計のズレに影響されないよう、Lamport clockを最優先する。
  同一lamport・同一updatedAtの場合のみnodeIdの文字列比較で決定的に
  タイブレークする。
- **削除**: 物理削除はせず `deleted: true` を持つ、より新しい
  lamportClockのエントリとして扱う（Tombstone方式）。特別な分岐を
  設けずとも、通常のLWW比較だけで「削除の巻き戻り」を防げる設計。
- **署名**: 各ノードは自分専用のHMAC鍵で自分が作成/更新したエントリに
  署名する。ノード間で鍵を共有しないため、他ノードの署名は検証できない
  （＝改ざん検知は同一ノード内のデータ整合性チェックに限定される）。
- **差分抽出**: `getEntriesSince(vectorClock)` が、渡されたvectorClockと
  比較して「相手がまだ知らないエントリ」だけを返す。

## QR差分同期（`comm/qr-codec.ts` / `comm/qr-receiver.ts`）

1. 受信側が自分の `vectorClock` をQRコードにエンコードして表示する
   （`MR2|VC|{nodeId}|{nodeName}|{base64url(vectorClock)}`）。
2. 送信側がそれをスキャンし、`getEntriesSince()` で差分を計算した上で
   `QRBundle` を組み立てる。
3. `QRBundle` のJSONを `MAX_QR_PAYLOAD`（1800文字）単位で分割し、
   各チャンクに `MR2|{bundleId}|{index}|{total}|{hash}|{base64url(chunk)}`
   という形式でハッシュを付与する（Animated QRとして連続表示）。
4. 受信側は `QRReceiver` でフレームを蓄積し、全フレームが揃ったら
   ハッシュを検証してJSONを復元、`CRDTEngine.mergeRemote()` で1件ずつ
   取り込む。

### v3で追加した自動化（`ui/hooks/usePeerSync.ts`）

- 待機中は「自分のvectorClock QRを表示」しつつ「アウトカメラで常時
  スキャン」する。相手のvectorClock QRを検出すると
  `MeshReliefEngine.decideRole()` を呼び、相手より新しいデータを
  多く持っていれば送信側（Animated QR表示）、少なければ受信側
  （スキャン継続）に自動的に切り替わる。手動の役割交代操作は無い。
- 送信時のデフォルトスコープ（`prepareDiffBundle`の`scope`引数）は
  `'default'`（`priority: 'urgent'` のデータと、自分の避難所に
  紐づくデータのみ）。「全データを同期する」は目立たない詳細設定として
  提供する。
- `nodeRole === 'station'` のノードは、送信側になった場合でも常に
  スコープを無視して全件を対象にする（同期ハブとしての役割を優先）。

## WebRTC同期（`comm/webrtc.ts`、オプション）

- `iceServers: []`（STUN/TURN不使用）。同一Wi-Fi環境でのみ動作する
  想定。SDP（Offer/Answer）は独自のチャンク分割QRプロトコル
  （`MRTC|...`）でやり取りし、DataChannel確立後は
  `hello → sync-request → sync-response → ack` の順で自動同期する。
- 接続に失敗した場合は、エラーメッセージを表示して高速モードのUIを
  閉じるのみ。常時動作しているQR同期（usePeerSync）自体がそのまま
  フォールバック先になっている。

## 永続化（`storage/db.ts`）

IndexedDB（DB名`meshrelief`, version 2）に `entries`（keyPath: 'id',
index: nodeId/type/updatedAt/shelterId）と `meta`（keyPath: 'key',
単一レコード）の2ストアを持つ。`getIdentity()`/`saveIdentity()` が
HMAC鍵のhex⇄CryptoKey変換を内部で完結させ、呼び出し側は常に
使ってすぐの`CryptoKey`だけを扱えばよい設計にしている。

## PWA / オフライン戦略

- `vite-plugin-pwa` で `registerType: 'autoUpdate'` + プリキャッシュ
  （`workbox.globPatterns`）による完全オフラインキャッシュを構成。
  外部APIを一切呼ばないため、追加の`runtimeCaching`は無し。
- `public/manifest.json` は静的ファイルとして手書きし、
  `index.html`から明示的に参照する（プラグインによる自動生成は
  `manifest: false`で無効化）。
- Google Fonts等の外部CDNには依存しない（フォントは各OS標準搭載の
  日本語フォントスタックのみで構成）。「通信インフラ不要」という
  価値提案自体が壊れないようにするための一貫した設計判断。

## テスト

- `engine/crdt.test.ts`: CRDTプロパティ（収束性・冪等性・競合解決・
  Tombstone・タイブレーク）。
- `comm/qr-codec.test.ts`: 単一QR・Animated QR・ハッシュ検証・
  フレーム欠落・差分のみ。
- `engine/mesh.smoke.test.ts`: モジュール結合の最小限の動作確認。
- `engine/mesh.test.ts`: QR差分同期／再同期のシナリオと、v3要件
  （スコープ絞り込み・decideRole・ステーションモードの無条件マージ）。
- 未着手のテスト・既知の制約は `DECISIONS.md` の「未着手・次回以降の
  タスク」を参照。
