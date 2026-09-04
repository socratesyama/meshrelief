# MeshRelief 技術スタック・デザイン方針サマリー（セッション1時点）

> このファイルは、今後のセッションで実装方針がぶれないよう、決定事項を
> 都度追記していくための永続ドキュメントです。実装計画書 v2 が「何を作るか」、
> このファイルが「どう作ると決めたか」を記録します。

## 技術スタック

| 領域 | 選定 | 補足 |
|---|---|---|
| ビルドツール | Vite 6 | `server.host: true` でLAN実機テスト（2台のスマホ間QR同期）に対応 |
| フレームワーク | React 19 + TypeScript 5.7 | `tsconfig.app.json` / `tsconfig.node.json` に分割（プロジェクト参照） |
| 状態管理 | Zustand 5 | `src/ui/store.ts`（次回以降作成） |
| QRコード表示 | qrcode.react 4系 | v4は `QRCodeSVG` / `QRCodeCanvas` の名前付きexport。計画書中のサンプルコード（`<QRCode />`）はv1系API表記のため、実装時に読み替えが必要 |
| QRコードスキャン | jsqr | `@types/jsqr` を devDependencies に追加 |
| IndexedDB | idb | Promiseベースのラッパー。`src/storage/db.ts`（次回以降作成）で使用 |
| UUID生成 | uuid（v11） | `crypto.randomUUID()` でも代替可だが、対応環境の幅を優先しライブラリを採用 |
| テスト | Vitest + Testing Library + jsdom | `vite.config.ts` にvitest設定を同居。`src/test/setup.ts` で `@testing-library/jest-dom/vitest` を読み込み |
| IndexedDBテスト用ポリフィル | fake-indexeddb | jsdomはIndexedDB未実装のため、mesh.ts実装時にsmoke testを書く必要が生じて追加。`src/test/setup.ts`で`fake-indexeddb/auto`をimportしグローバル登録 |
| CSS | Tailwind CSS 3.4 | v4系ではなくv3系を選定（後述） |
| PWA | vite-plugin-pwa | `registerType: 'autoUpdate'`、`devOptions.enabled: true` で開発中もSW挙動を確認可能 |

### 選定理由の補足

- **Tailwind v3を選定した理由**: v4はCSSベース設定(`@theme`)がデフォルトとなり、
  クラシックな `tailwind.config.js` でのtheme拡張は非標準の扱いになる。
  今回ユーザーから明示的に `tailwind.config.js` でのtheme拡張が指定されたため、
  安定して動くv3系を採用した。
- **フォントはCDN(Google Fonts等)に依存しない**: このアプリの核心的価値は
  「インターネット接続不要、カメラさえあれば動く」こと（計画書§12.2）。
  `index.html` に外部フォントの `<link>` を置くと、初回オフライン起動時に
  読み込みが失敗しうるため、意図的に採用しなかった。代わりに
  `-apple-system` / `Hiragino Sans` / `Noto Sans JP` / `Yu Gothic` / `Meiryo` 等、
  各OSが標準搭載する日本語フォントのフォールバックスタックのみで構成している。
- **qrcode.reactのAPI差異**: 計画書中のコード例 `<QRCode value={...} size={250} />`
  は現行の `qrcode.react` v4のAPIとは異なる（v4は `QRCodeSVG`/`QRCodeCanvas`の
  名前付きexport）。AnimatedQRコンポーネント実装時（次回以降）に読み替える。

## デザインシステム

- **配色方針（v4で全面刷新。下記「taste-skill適用による配色刷新」参照）**:
  派手さより信頼感・視認性を優先する方針自体は変わらないが、当初採用していた
  暖色系ニュートラル（和紙・土壁を思わせる質感）＋テラコッタ〜アンバーの
  ブランドカラーは、taste-skillが「AIが最も多用する使い古された配色」として
  警告している組み合わせにほぼ一致していたため廃止した。現在はベースを
  クールなスレート系ニュートラル、ブランドカラーをシグナルブルー
  （防災・行政・救急サービス系で広く使われる、機能的な信頼感を持つ色域）
  としている。実際の値は `tailwind.config.js` / `src/styles/tokens.ts` を参照。
- **urgent（緊急度）の分離**: オレンジ〜レッド系の独立したカラースケール
  （`urgent-50`〜`urgent-900`）を用意し、安否／物資／メッセージの全パネルで
  共通の「緊急」を表す色として一元的に使用する。安全状態を表す `safe`（グリーン系）
  や情報提示用の `info`（青緑系）とは明確に区別する。
- **ダークモード**: `darkMode: 'class'` によるアプリ内明示切替（OS追従の`media`
  ではない）。夜間・停電時の避難所利用を想定。
- **タップ領域**: 最低44px四方を `spacing.tap` / `minHeight.tap` / `minWidth.tap`
  として明示トークン化。主要CTA（送信/受信ボタン等）は48px（`tap-lg`）を推奨。
- **タイポグラフィ**: 行間を広めに取ったスケール（本文で1.7）。高ストレス下・
  夜間・高齢者利用を想定した可読性優先の設計。
- **5タブ下部固定ナビ**: `spacing.nav-height`（68px相当）、`zIndex.bottomNav`、
  および `.pb-safe-nav` ユーティリティ（ノッチ端末のセーフエリア対応）を用意。
  タブ構成は Safety / Supply / Shelter / Message / Peer の5つ
  （`src/styles/tokens.ts` の `bottomNav.tabs` を型のsingle source of truthとする）。
- **色の二重管理に関する注意**: `tailwind.config.js` の色定義と
  `src/styles/tokens.ts` の色定義は意図的に重複させている（Tailwindの設定は
  ビルド時=Nodeでしか読めないため）。**色を変更する際は両方を更新すること。**

## データモデル方針（src/types.ts）

- `RecordType` は `'safety' | 'supply' | 'shelter' | 'message'` の4種類。
  Peerタブは同期UI専用のためデータ種別を持たない。
- `CRDTEntry.data` は `RecordType` を判別子とする Discriminated Union
  （`DataRecord = SafetyRecord | SupplyRecord | ShelterRecord | MessageRecord`）。
- LWW競合解決は `lamportClock > updatedAt > nodeId` の優先順位（時計ズレ対策として
  Lamport clockを物理時刻より優先。計画書§11.2）。
- 削除は `deleted: boolean` によるTombstone方式（論理削除。物理削除しない）。
- 個人情報最小化: `SafetyRecord.name` はイニシャル可、`phone` は任意、
  `ShelterRecord.address` も任意（避難所名までに留める運用を想定）。
- `shelterId?: RecordId` と `priority?: Priority`（デフォルト'normal'扱い）は
  `BaseDataRecord` にあり、4種別すべてのレコードが共通して持つ。
  **注記（2回目のtypes.ts確認セッションにて）**: この2フィールドは確認した
  時点で既にこの形（BaseDataRecordへ格上げ済み）になっていたが、これは
  このドキュメントに記録のない変更だった。以後のセッションでtypes.tsの
  内容を前提に指示を出す際は、まずこのファイルとtypes.ts本体を突き合わせて
  確認してから進めること。
- `PersistedMeta.nodeRole: 'personal' | 'station'`（v3追加）。
  「同期ステーションモード」（避難所受付に固定設置し、次々に来る
  避難者のスマホと同期し続ける運用）の永続化の受け皿。今回は型と
  meta ストアへの保存のみで、モード自体のUI/挙動は未実装。
- `PersistedMeta.homeShelterId: RecordId | null`（v3追加・mesh.ts実装時）。
  「このノード（端末）はどの避難所の人か／どの避難所のステーションか」を表す。
  `DataRecord.shelterId`（レコードがどの避難所の話かを表す）とは別概念。
  `prepareDiffBundle`のデフォルトスコープ判定に使用。
- `DataRecordPatch`（mesh.ts実装時に追加・crdt.ts修正）。
  `CRDTEngine.update()`/`MeshReliefEngine.updateRecord()`の引数型。
  `Partial<DataRecord>`は`keyof`が共用体の共通キーのみになるTSの仕様上、
  レコード種別固有のフィールドを更新できない不具合があったため、
  `Partial<A>|Partial<B>|...`という「partialの共用体」に変更した。

## 実装済みモジュール

### src/engine/crdt.ts（CRDTEngine）— §6準拠

公開API（次回以降、mesh.ts / storage/db.ts / crdt.test.ts から参照する前提）:

| メソッド | シグネチャ | 備考 |
|---|---|---|
| `new CRDTEngine(init)` | `{ nodeId, nodeName, hmacKey: CryptoKey }` | |
| `create` | `(data: DataRecord) => Promise<CRDTEntry>` | |
| `update` | `(id, patch: DataRecordPatch) => Promise<CRDTEntry>` | 存在しない/削除済みentryへの呼び出しはthrow。**patch型は`Partial<DataRecord>`ではなく`DataRecordPatch`**（mesh.ts実装セッションで修正。理由はtypes.tsの型定義コメント参照） |
| `delete` | `(id) => Promise<CRDTEntry>` | tombstone化。削除済みへの再呼び出しは冪等（既存を返す） |
| `mergeRemote` | `(entry: CRDTEntry) => Promise<boolean>` | 戻り値は「実際に採用したか」 |
| `verify` | `(entry: CRDTEntry) => Promise<boolean>` | 自ノード宛以外は常にtrue（§6.3参照） |
| `getEntriesSince` | `(since: VectorClock) => CRDTEntry[]` | §6.2の修正後コードそのまま |
| `getVectorClock` / `getLamportClock` | `() => VectorClock` / `() => number` | |
| `restoreVectorClock` | `(vc: VectorClock, lamportClock: number) => void` | **lamportClockも同時に渡す2引数** |
| `getEntry` / `getAllEntries` / `getEntries` | — | `getAllEntries`はtombstone込み、`getEntries(type?)`は削除済み除外＋新しい順 |
| `CRDTEngine.generateKey` (static) | `() => Promise<CryptoKey>` | ノード初回起動用 |
| `CRDTEngine.exportKey` / `importKey` (static) | §8.2と同一仕様 | |
| `compareForLWW` (named export, クラス外) | `(a, b) => number` | 単体テストで直接使う想定 |

### src/comm/qr-codec.ts（QRCodec）— §2.2〜§2.5準拠

公開API:

| メソッド/関数 | シグネチャ | 備考 |
|---|---|---|
| `MAX_QR_PAYLOAD` | `1800`（定数） | §2.5 |
| `QRCodec#encodeVectorClock` | `(vc, nodeId, nodeName) => string` | 同期。§2.3 |
| `QRCodec#decodeVectorClock` | `(text) => VectorClockQRPayload` | 同期。nodeNameに`\|`が含まれても復元可能な実装 |
| `QRCodec#createBundle` | `(entries, fromNodeId, fromNodeName) => Promise<QRBundle>` | **async**（payloadHash計算のため）。§2.4 |
| `QRCodec#splitIntoFrames` | `(bundle, maxPayload = 1800) => Promise<string[]>` | **async**。§2.5。bundleIdは`bundle.bundleId`を再利用（後述） |
| `QRCodec#encodeFrame` / `decodeFrame` | `(QRFrame) => string` / `(string) => QRFrame` | 同期。§2.2。decodeFrameのchunkはbase64urlデコード済み平文 |
| `QRCodec#detectQRKind` | `(text) => 'vector-clock' \| 'frame' \| 'unknown'` | 計画書に明記なし。QRScanner.tsx向けの追加ユーティリティ |
| `sha256Hex` / `shortHash` (named export) | `(string) => Promise<string>` | shortHashは先頭8桁。qr-receiver.tsからも再利用 |
| `base64urlEncode` / `base64urlDecode` (named export) | — | UTF-8バイト列経由（日本語対応） |

### src/comm/qr-receiver.ts（QRReceiver）— §2.6準拠

| メソッド | シグネチャ | 備考 |
|---|---|---|
| `new QRReceiver(codec?)` | 省略時は内部で`new QRCodec()` | |
| `ingestFrame` | `(frameText: string) => Promise<QRIngestResult>` | **async**。エラー時はthrow（doc §2.6のハッシュ不一致throwパターンを踏襲） |
| `getState` | `() => QRReceiverState` | 計画書に明記なし。進捗UI表示用に追加 |
| `reset` | `() => void` | 計画書に明記なし。「やり直す」UI操作用に追加 |

### src/storage/db.ts — §8準拠

DB名`meshrelief`、`DB_VERSION = 2`固定。`idb`ライブラリ使用。

| 関数 | シグネチャ | 備考 |
|---|---|---|
| `putEntries` | `(entries: CRDTEntry[]) => Promise<void>` | 単一トランザクションでまとめてput |
| `getAllEntries` / `getEntry` | — | tombstone込みで全件/単体取得 |
| `getEntriesByType` / `getEntriesByShelterId` | — | `type`/`shelterId`インデックス使用 |
| `clearAllEntries` | `() => Promise<void>` | 計画書に明記なし。デモリセット用に追加 |
| `getIdentity` | `() => Promise<LoadedIdentity \| undefined>` | 初回起動時はundefined。**hex→CryptoKey変換込み**（`CRDTEngine.importKey`を内部使用） |
| `saveIdentity` | `(identity: LoadedIdentity) => Promise<void>` | **CryptoKey→hex変換込み**（`CRDTEngine.exportKey`を内部使用） |

`LoadedIdentity`は`PersistedMeta`とほぼ同じだが、`hmacKeyHex`の代わりに
使ってすぐの`CryptoKey`を持つ（storage層で変換を完結させ、呼び出し側
=mesh.tsにhex⇄CryptoKey変換を意識させないための設計）。

### src/engine/mesh.ts（MeshReliefEngine）— §1.3, §2.1準拠

crdt.ts / qr-codec.ts / qr-receiver.ts / db.ts を統合する唯一の窓口。
全APIは「UI側が呼ぶべきAPI一覧」としてこのセッションの回答末尾にまとめた
（この節では実装上の要点のみ）。

- コンストラクタは`private`。`create()`(新規)/`restore()`(復元)/
  `createEphemeral()`(ストレージ不使用、テスト・デモ専用)の3つの静的
  ファクトリ経由でのみインスタンス化できる。
- `prepareDiffBundle`/`generateAnimatedQR`/`ingestQRFrame`は**すべてasync**
  （qr-codec.ts実装時から確定していた通り）。
- `nodeRole === 'station'`の場合、`prepareDiffBundle`は`scope`引数を無視して
  常に`'all'`として扱う。
- `decideRole`の「相手が多く持っている量」はvectorClockの差分による近似値
  （相手の正確なエントリ数は知り得ないため）。

## 設計書の記述とコードの対応表（ズレ防止用）

> 設計書は「何を作るか」の正、このファイルは「実際どう命名・実装したか」の正。
> 以後、設計書の章番号で指示を受けたら、まずこの表で対応する実装名に読み替える。

| 設計書での記述 | 実装での扱い | 理由・注意点 |
|---|---|---|
| §6.1の表: 「verify()」「update()」など | `CRDTEngine.verify()` / `.update()` としてそのまま採用。対称性のため作成は`.create()`、tombstone削除は`.delete()`と命名 | `delete`は予約語だがメソッド名としては問題なし（`Map.prototype.delete`と同様） |
| §8.2: `async exportKey(key)` / `async importKey(hex)`（どのクラスに属するか本文では未確定） | `CRDTEngine.exportKey()` / `CRDTEngine.importKey()` という**静的メソッド**として実装 | 鍵の生成・署名アルゴリズムを一番知っているCRDTEngineに集約した。**解決済み**: storage/db.ts実装時、`getIdentity`/`saveIdentity`内部で`CRDTEngine.exportKey/importKey`をそのまま呼び出す形で配線した（想定通り） |
| §6.1 #4「restoreVectorClock（VC復元）」 | `restoreVectorClock(vectorClock, lamportClock)` と**lamportClockも同時に受け取る2引数**にした | §8.1のmetaストアはvectorClockとlamportClockを常にセットで永続化しており、vectorClockだけ復元するとlamportClockが0から再開してしまいLWW比較が壊れるため |
| `entry.nodeId`＝「作成者」という暗黙の前提がありうる箇所 | `update()`/`delete()`は**実行した瞬間のノード**をnodeIdとして記録し直す（＝直近操作者） | 避難所スタッフが他者の入力を修正できる必要がある。§6.4「誰が作ったか追跡可能」は「直近操作者の追跡」として解釈している。**要注意**: 「最初の作成者を追跡したい」という指示が今後出てきたら、別フィールド（例: `createdByNodeId`）の追加が必要になる |
| §2.5: QRバンドルの`bundleId`生成に`crypto.randomUUID()`を使用 | crdt.tsのエントリid生成は**uuidパッケージ**を使用（理由は技術スタック節を参照） | **未解決の論点**: 次回qr-codec.ts実装時、bundleIdも同じ理由でuuidパッケージに統一するか、doc記載通り`crypto.randomUUID()`のままにするか要判断・要指示 |
| tombstone削除時の`data`の扱い（doc未言及） | `data`は削除せず保持したまま`deleted:true`にする | プライバシー配慮での`data`redactionは今回実装していない。必要なら別途指示を |
| §6.4「verified」（将来拡張） | 型定義のみ存在（`CRDTEntry.verified?: boolean`）。**署名対象からは除外**し、setter等のロジックは未実装 | 確認済みフラグは第三者が後から付与しうる注記のため、署名対象に含めると元の作成者の署名が壊れる |
| 上記以外の追加API（`getEntry`, `getLamportClock`, `CRDTEngine.generateKey`） | 設計書に明記なし。実装上必要/自然な範囲で追加 | |
| §2.4/§2.5/§2.6の擬似コードは`createBundle`/`splitIntoFrames`/`ingestFrame`（`sha256(json)`呼び出し）が同期関数に見える | 実装では**すべてasync**（`crypto.subtle.digest`が非同期APIのため） | **解決済み**: mesh.ts実装時、`prepareDiffBundle`・`generateAnimatedQR`・`ingestQRFrame`も同様に全てasync化して整合させた |
| §1.3: `private storage: Storage;`というフィールド | mesh.tsは`storage`フィールドを持たず、storage/db.tsの関数を直接import | `Storage`はDOM組み込み型名と衝突するため元々クラス化していなかった（db.ts実装時点の判断） |
| §1.3: `this.qrCodec.ingestFrame(frame)` | 実際は`this.qrReceiver.ingestFrame(frame)`（`qrReceiver: QRReceiver`フィールドを追加） | qr-codec.ts/qr-receiver.tsをファイル分割した session3 の方針通り |
| §1.3の擬似コードにはprivateフィールドとして無い`createEphemeral()` | mesh.ts実装時に追加。ストレージに一切触れないテスト・デモ専用の構築経路 | meta ストアが単一レコードのため、同一プロセス内で複数「端末」をシミュレートするテストで`create()`を複数回呼ぶと上書きされる問題への対処 |
| v3要件3「ステーションモードは受信した差分を無条件・全件マージ」 | 実装では追加分岐なし（mergeRemote自体が元々無条件マージのため）。代わりに送信側(`prepareDiffBundle`)で`nodeRole==='station'`なら`scope`引数を無視して常に`'all'`にする、という形で「同期ハブとして何も削らない」を実現 | mesh.tsファイル冒頭コメント参照。**要確認**: 「送信側もフィルタしない」までは指示に明記されていなかった拡大解釈のため、意図と異なれば要修正 |
| v3要件2「新しいエントリを多く持つ」の判定基準 | 相手の正確なエントリ数は分からないため、vectorClockの差分合計を近似値として使用。0件同士以外の同数は'send'優先というタイブレークを独自に設定 | mesh.ts `decideRole` 実装コメント参照。**要確認**: 近似値でなく正確な件数比較が必要な場合は、別途相手からエントリ数そのものを渡す仕組みが必要 |
| §2.5: `splitIntoFrames`内で`const bundleId = crypto.randomUUID();`と新規UUID発行 | `bundle.bundleId`（createBundle時に発行済み）を再利用するよう修正 | 擬似コード通りだとQRBundle.bundleIdとフレームのbundleIdが別UUIDになり矛盾するため、§6の「修正」と同様の性質の問題として扱い、最初から正しい実装にした |
| §2.4: `QRBundle.payloadHash`の算出対象が本文に明記されていない | `entries`配列のみのSHA-256（先頭8桁）とした。フレーム側の`hash`（§2.2）はバンドル全体（JSON.stringify(bundle)）のSHA-256とし、役割を分離（前者=内容の指紋、後者=伝送検証） | **要確認**: 別の意図（例: bundle全体のハッシュと同一にすべき等）であれば指示を |
| §2.3: vectorClock QRのnodeNameは自由入力を許容しうる | `\|`区切りだが、末尾のbase64urlペイロードから逆算してnodeNameを復元することで、nodeNameに`\|`が含まれても壊れないようにした | 防御的実装。doc未言及の追加対応 |
| 付録チェックリストの`src/ui/App.tsx`（修正ファイル扱い） | 今回は作成せず。`main.tsx`にloading/needs-setup/readyの分岐を直接記述 | 今回の依頼が3ファイル（main.tsx/store.ts/SetupScreen.tsx）だったため。BottomNav・各Panelが揃う次回以降に`App.tsx`として切り出す想定 |
| v3「ステーション選択時は避難所名を入力」 | ステーション作成時、入力された避難所名で`ShelterRecord`を自動作成し、`homeShelterId`に紐づける処理を`store.completeSetup()`に実装 | 設計書に明記のない拡大解釈。**要確認**: 単に`nodeName`に避難所名を使うだけで、ShelterRecord自動作成は不要という意図であれば要修正 |

## 実装済みモジュール（続き）

### src/ui/store.ts / src/main.tsx / src/ui/components/SetupScreen.tsx

- `store.initialize()`はReact StrictModeでのuseEffect二重実行対策として、
  モジュールスコープの`restoreStarted`フラグで`MeshReliefEngine.restore()`
  の二重呼び出しを防いでいる。
- SetupScreenのアイコンは新規ライブラリ（lucide-react等）を追加せず、
  自作の最小限インラインSVGで済ませている。
- PWAインストールバナーの「閉じた」状態はlocalStorageに保存している
  （これは実際にブラウザで動くアプリ本体のコードであり、Claudeの
  artifact環境におけるlocalStorage制限とは無関係）。

### src/ui/components/AnimatedQR.tsx / QRScanner.tsx / SyncStatus.tsx / PeerPanel.tsx / StationScreen.tsx / src/ui/hooks/usePeerSync.ts — §2.7, §7.1, §7.2, v3準拠

- **誤り訂正レベルの判断**: AnimatedQRの既定errorCorrectionLevelは意図的に
  'H'ではなく'M'にした。QR Version 40のByte mode実容量（L:2953/M:2331/
  Q:1663/H:1273文字）と、qr-codec.tsの`MAX_QR_PAYLOAD=1800`
  （ヘッダ込みで1フレーム最大約1,855文字）を突き合わせると、'Q'や'H'では
  収まらない。**要確認**: 「屋外でも読み取りやすい誤り訂正レベル」を
  最優先するなら`MAX_QR_PAYLOAD`自体を下げる必要があるが、既存の合意事項
  （qr-codec.ts実装セッションで確定）を変更しない前提で判断した。
  なお、自分のvectorClock QR（PeerPanel/StationScreenで常時表示する小さい
  方）はペイロードが小さく容量に余裕があるため、'H'を使っている。

- **usePeerSyncフックの新規追加**（依頼ファイル一覧には無い）:
  v3要件1「常時待機・自動役割交代」の状態機械（重複排除・タイマー管理・
  decideRoleに基づく自動遷移）をPeerPanel.tsxとStationScreen.tsxの
  両方で使う必要が生じたため、`src/ui/hooks/usePeerSync.ts`へ共通化した。
  複雑なロジックを2箇所に別々に実装すると保守時に片方だけ直して
  ズレるリスクが大きいと判断した（DRY優先の追加）。

- **mesh.tsへの追加**（この2つはPeerPanel実装中に必要性が判明した）:
  - `prepareTextBundle(scope)` / `ingestBundle(bundle)`:
    §7.1「テキストで同期（緊急時）」はカメラを使わないため相手の
    vectorClockが分からない。そのため「相手は何も持っていない」前提で
    常に自分の全データ（空のVCとの差分）を基準にする専用APIを追加した。
    `ingestQRFrame`内のマージ処理は`applyBundle()`に切り出して共通化。
  - `IngestFrameResult.mergedCount`: §7.2「完了時の『X件同期しました』
    トースト」に実際の件数を表示するため追加。

- **PeerPanelの物理的な同期方式の解釈**: 「アウトカメラ限定・自動交代」を
  実現するため、待機中は「自分のvectorClock QRを画面に表示しつつ、
  同時にアウトカメラでスキャンする」という設計にした（QRScannerを常時
  マウントし、send中のみCSSで非表示・デコード一時停止）。これにより、
  2台のスマホを近づけて置く/構えるだけで、どちらの画面がどちらの
  カメラに映っても検出できる。**要確認**: 設計書に物理的な構え方の
  明記は無いため、意図した使い方と異なる可能性がある。

- **StationScreenの「本日の累計同期件数」**はアプリを開いてからの
  インメモリカウントに留めており、日付またぎのリセットや再起動後の
  永続化は実装していない（今回のスコープ外と判断）。

- **QRScannerのアウトカメラ限定**: `getUserMedia({video:{facingMode:
  {ideal:'environment'}}})`で実装。カメラ映像の取得自体は`active`prop
  に関わらず継続し、デコード処理（jsQR呼び出し）だけを一時停止する設計
  にした（sending⇄idle切り替えのたびにストリームを再取得すると遅延・
  再許可プロンプトのリスクがあるため）。

### src/ui/components/{Safety,Supply,Shelter,Message}Panel.tsx / common/ — §7.4, §5.2, v3準拠

- 4パネルとも、データ登録は必ず `store.createRecord()`（内部で
  `engine.createRecord()`のみを呼び、storeのentriesはonEntriesChange
  コールバック経由でのみ更新される）を通す。storeを直接更新する
  コードは書いていない。
- **§5.2 電話番号の「QR同期に含めるかどうか選択可能」の解釈**:
  現行アーキテクチャではCRDTEntryは常に丸ごと同期される（フィールド
  単位の同期除外機構が無い）ため、「入力するがローカルにのみ保持する」
  は技術的に実現できない。SafetyPanelでは「電話番号も入力する（同期時に
  共有されます）」というチェックボックス（既定OFF）で電話番号欄自体の
  表示/送信を切り替える誠実な実装にした。**要確認**: 本来の意図が
  フィールド単位の同期除外だった場合、qr-codec.ts/mesh.tsに踏み込んだ
  設計変更が必要になる。
- **common/配下**: Card, Badge, EmptyState, LoadingIndicator, Toast,
  FormField（+`INPUT_CLASSES`）, PrioritySelector（v3）,
  ShelterSelect（§7.4のドロップダウン。Safety/Supplyで共有）,
  formatTime（相対時刻）を作成。
  - `common/Toast.tsx`は表示専用。PeerPanel.tsx/StationScreen.tsxは
    このコンポーネント実装より前に同等のトーストUIをインラインで
    実装済みだったため、今回は4パネルのみで使用し、PeerPanel/
    StationScreen側の移行は行っていない（挙動を変えない範囲に留める
    判断。将来的な統一の余地あり）。
  - `ShelterSelect`は`store.getEntriesByType()`ではなく`store.entries`
    を`useMemo`で絞り込む経路にした。前者は呼ぶたびに新しい配列を
    作るため、Zustandの浅い比較で毎回「変化した」と判定され不要な
    再レンダーを招くため。
- **priorityのUI対象**: v3要件の「緊急性が意味を持つ種別」を
  Safety/Supply/Messageと解釈し、Shelterには追加していない
  （ShelterStatus自体が受入可否という別の意味の状態を持つため）。
- **避難所ドロップダウンの対象**: §7.4の表に明記されている
  Safety/Supplyのみに追加。MessageRecordも型上はshelterIdを持てるが、
  表に記載が無いため今回のUIでは設定しない。
- 一覧の編集・削除UI（updateRecord/deleteRecordの呼び出し）は今回の
  スコープに含めていない（「engine.createRecord()経由でのデータ登録」
  という指示に絞った）。

### src/engine/scenario.ts / DemoMode.tsx / App.tsx / main.tsx / BottomNav.tsx — §7.3準拠

- **`types.ts`の`DemoAct`を修正**: 元は`locked: boolean`を静的データの
  一部として持っていたが、「どの幕まで再生済みか」は実行時状態であり
  静的シナリオデータには馴染まないため削除し、DemoMode.tsxのローカル
  state（`playedCount`）へ移した。`entries`も`Array<Pick<CRDTEntry,
  'data'>>`（実質`{data: DataRecord}[]`と同じで冗長）から`DataRecord[]`
  に単純化した。
- **「令和8年熊本地震」は架空のデモシナリオ**であることをscenario.ts
  冒頭に明記した（2016年の実際の熊本地震を踏まえた「もし再び起きたら」
  という想定。設計書がこの名称を明示的に指定しているため採用したが、
  実在の被害を再現したものではない旨を明確にした）。
- 各幕のentriesは他パネルと全く同じ`store.createRecord()`経由で投入する
  （デモデータも実際の署名付きCRDTEntryとして扱われ、同期しても
  破綻しない）。幕をまたいだ構造的な参照（Act3の物資をAct2の避難所IDに
  紐づける等）はID発行タイミングの都合上行わず、物語のつながりは本文
  （notes）内の言及で表現している。
- **「デモをリセット」ボタン**（依頼に明記は無いが、db.ts実装セッションで
  用意していた`clearAllEntries()`がまさにこの用途を想定していたため
  追加）。実行後に`window.location.reload()`しているのは、IndexedDBを
  直接クリアするとCRDTEngineのメモリ上の状態とズレるため
  （db.ts側のコメント参照）。
- **App.tsxの新設に伴い、main.tsxの「暫定メイン画面
  （MainAppPlaceholder）」を廃止**し、`phase==='ready'`時は`<App />`を
  描画するよう更新した。
- **v3要件のnodeRole出し分け**: `nodeRole==='station'`かつ
  「デモ実演モード」未選択の場合のみStationScreenを全画面表示。
  「デモ実演モード」ボタンは`engine.setNodeRole()`を一切呼ばない
  純粋にローカルな表示切り替えとして実装した（"一時"切替という要求を
  文字通り解釈し、実際のnodeRoleやDBは変更しない）。
- **BottomNav.tsxを新設**（依頼一覧には無いが「5タブの下部固定
  ナビゲーションでアプリ全体を統合」を素直に実装すると必要になった）。
  アイコンはSetupScreen等と同様、新規ライブラリを追加せず自作の
  最小限インラインSVGで揃えている。
- **同期状態の簡易表示**: App.tsxのヘッダーに、未同期件数の有無を
  示す小さなインジケータ（`SyncGlance`）を追加し、タップでPeerタブへ
  遷移できるようにした。詳細な`SyncStatus`コンポーネント自体は
  引き続きPeerPanel内に表示される。

### src/comm/webrtc.ts / PeerPanel.tsx（高速モード）— §3準拠

- **mesh.tsのリファクタリング**: `applyBundle()`を`QRBundle`丸ごと受け取る
  形から`entries`/`fromNodeId`/`fromNodeName`を直接受け取る形に変更。
  WebRTC経由でダミーのQRBundleを作らずに済むようにするため。
  あわせて `getVectorClock()` / `getEntriesSince()` /
  `mergeEntriesFromPeer()` をMeshReliefEngineに追加した（QRを介さず
  生のVectorClock/CRDTEntryを直接扱う経路）。
- **`MeshReliefEngine.webrtc`フィールドと`WebRTCMesh`プレースホルダー型を
  削除**: セッション8時点では「エンジンがWebRTCMeshを保持する」想定
  だったが、実装してみると`WebRTCMesh`が`MeshReliefEngine`への参照を
  持つ形（逆方向）が自然だった。高速モードはPeerPanel.tsxでの
  ユーザー操作に応じて開始・終了するセッションスコープの機能であり、
  エンジンが恒久的に保持するようなものではないと判断した。
- **シグナリングQR（Offer/Answer）は独自の"MRTC|..."プロトコル**を
  データ同期用の"MR2|..."とは別に定義した。SDPサイズが
  `MAX_QR_PAYLOAD`（1800文字）を超える可能性がある一方、超えない保証も
  無いため、既存のqr-codec.tsが公開しているsha256Hex/base64url関数を
  再利用してチャンク分割・ハッシュ検証を独自実装した。
  **要確認**: 実際のSDPサイズ次第では、この分割ロジック自体が
  未検証（実機での複数フレーム化パスは今回テストできていない）。
- **AnimatedQR.tsx/QRScanner.tsxをそのまま再利用**できた
  （どちらも汎用的な「フレーム配列/onFrame」コンポーネントとして
  設計していたため）。新規UIコンポーネントの追加は不要だった。
- **高速モードとメインQRスキャンのカメラ競合対策**: 高速モードの
  シグナリングQRスキャン中は、メインのQRScannerを一時的に
  アンマウントしてカメラを解放している（QRScannerの`active`propは
  デコードループの一時停止のみでストリーム自体は維持するため、
  CSSで隠すだけでは2つの`getUserMedia`が競合してしまう）。
- **Offer/Answerの役割は自動判定せず、明示的な2択ボタン**にした
  （データ同期のdecideRoleのような自動判定は、接続の「開始者」を
  決めるという性質上そぐわないと判断）。
- **iOS Safariの事前UA判定によるブロックはしていない**。「保証しない」
  であって「使えない」ではないため、汎用的な失敗時エラーメッセージの
  中でiOS Safariでの既知の制限に言及する形にした。
- WebRTC同期は常にscope='all'相当（全件）。QRのペイロード制約が
  無いため、帯域節約のための絞り込みは不要と判断した。

### src/engine/mesh.test.ts / docs/MANUAL_TEST_CHECKLIST.md — §9.3準拠

- §9.3「QR差分同期」「QR差分再同期」に加え、v3要件（scope絞り込み2件・
  decideRole3件・ステーションモードの無条件マージ2件）を検証する
  describeブロックを追加した。
- decideRoleのsend/receiveテストは、単純な「有る/無い」ではなく
  「3件 vs 1件」のように**件数の大小**で比較することで、「相手より
  新しいエントリを多く持つ」という仕様の"多く"の部分を実際に検証する
  形にした。
- `docs/MANUAL_TEST_CHECKLIST.md`を新設し、§9.3の表に自動役割交代・
  ステーションモード・スコープ絞り込みの3行を追加したチェックリスト
  （`- [ ]`ではなく表のチェック列。実機確認用にそのまま印刷/共有できる
  形式を優先した）として出力した。

### vite.config.ts / public/manifest.json / public/_headers / README.md — §4準拠

- **manifest.jsonを静的ファイル化**: セッション1では`VitePWA({manifest:
  {...}})`でvite-plugin-pwaに自動生成させていたが、今回「public/
  manifest.json」という具体的なファイル名が指定されたため、
  `manifest: false`にして自動生成を止め、`public/manifest.json`を
  手書きの静的ファイルとして用意した。`index.html`に
  `<link rel="manifest" href="/manifest.json">`を明示的に追加している
  （自動生成時はこのlinkタグもプラグインが自動挿入していたため）。
  内容（theme_color/background_color等）はセッション1のトークン
  （primary-600 #A6611F, neutral-50 #FAF8F5）と完全に一致させている。
- **完全オフラインキャッシュ戦略**: `workbox.globPatterns`に`json`を
  追加（manifest.json自体もプリキャッシュ対象に含める）。
  `skipWaiting: true, clientsClaim: true`を明示し、
  `registerType:'autoUpdate'`と組み合わせて新しいService Workerが
  即座に有効化されるようにした。このアプリは外部APIを一切呼ばないため、
  追加の`runtimeCaching`ルールは不要と判断し追加していない
  （プリキャッシュ＝実質的にキャッシュ優先戦略になっている）。
- **§4.2戦略3（単一HTMLファイル配布）はコメントアウトで用意**:
  `build.rollupOptions.output.inlineDynamicImports`をコメントアウト
  した状態でvite.config.tsに残した。有効化にはおそらく
  `vite-plugin-singlefile`等の追加検討が必要になる旨も明記した
  （このセッションでは検証・有効化はしていない）。
- **アイコンはSVG原案のみ**: `public/icon-source.svg`を作成。
  最初からmaskableのセーフゾーン（中心から半径205px程度、512x512
  キャンバス中心80%相当）にアイコン本体を収めてデザインしているため、
  PNG化後は同じ`icon-512.png`を`purpose:"any"`と`"maskable"`の
  両方でそのまま使い回せる設計にした。あわせて、以前から
  `index.html`で参照されつつ未作成だった`public/favicon.svg`も
  同じモチーフの簡易版として今回作成した。
  **要対応**: `icon-192.png`/`icon-512.png`のPNG実体は未作成のまま
  （画像生成不可のため）。`public/icon-source.svg`内のコメントに
  変換手順を記載した。未配置のまま`npm run build`すると
  `vite-plugin-pwa`が警告を出す可能性がある。
- **public/_headers**: sw.js/workbox-*.js/index.html/`/`はno-cache、
  `dist/assets/`配下（Viteのハッシュ付きファイル）はimmutable長期
  キャッシュ、manifest.json・アイコン類はハッシュが付かない静的
  ファイルであるため短〜中期間のキャッシュに留めた。
  **要確認**: Cloudflare Pagesの`_headers`が拡張子ベースの
  ワイルドカード（例: `/*.png`）をどこまで確実にサポートするか
  未確認だったため、既知の静的ファイルを1つずつ明示するという
  保守的な書き方にした。
- **README.mdを新規作成**: プロジェクトにREADME.mdが存在しなかった
  ため、依頼されたデプロイ手順メモを中心に最小限の内容で新設した
  （プロジェクト概要は1〜2行に留め、スクリーンショットやチーム情報等を
  含む本格的な応募用READMEの作成は今回のスコープ外とした）。
- SPA用の`_redirects`（`/* /index.html 200`）は作成していない。
  MeshReliefはクライアントサイドのURLルーティングを持たず
  （activeTabはReact stateで管理しておりURLは常に`/`のまま）、
  Cloudflare Pages側でのパスフォールバック設定が不要なため。

### taste-skillによる配色・ディテール刷新（v4セッション）

- **経緯**: `tailwind.config.js`の色定義（背景#FAF8F5＋アクセント#A6611F＋
  テキスト#1C1815という「暖色クリーム＋テラコッタ／琥珀＋エスプレッソ」）が、
  taste-skillが名指しで「プレミアム消費財ブリーフでのAI定番配色」として
  警告しているBANリスト（`#faf7f1`系クリーム／`#bc7c3a`系クレイ・オーカー／
  `#1a1714`系エスプレッソ）にほぼ一致していたため、配色を全面的に見直した。
- **新配色**: ベースをクールなスレート系ニュートラル、ブランドカラーを
  シグナルブルー（防災・行政・救急サービス系で広く使われる、機能的な
  信頼感を持つ色域）に変更。urgent（オレンジ〜レッド）とsafe（グリーン）は
  状態を表す意味色として維持し、infoは新primaryの青と衝突しないよう
  ティール（青緑）寄りに変更した。
- **他レイアウト面（タイポグラフィ・絵文字を除く）は今回スコープ外**:
  taste-skillはランディングページ／ポートフォリオ／リデザイン向けの
  スキルで、本文冒頭に「ダッシュボードや多段階プロダクトUIは対象外」と
  明記されている。MeshReliefの5タブ構成のような実働プロダクトUIは
  まさにこれに該当するため、レイアウト・モーション・カード構造等の
  ダイヤル（DESIGN_VARIANCE等）は適用していない。配色（4.2 Color
  Calibration）と絵文字ポリシー（3.D）のみ、汎用的に妥当と判断し適用した。
- **要修正だった伝播漏れ（今回のセッションで解消）**: `tailwind.config.js`の
  色定義変更が、色を複製している`src/styles/tokens.ts`（実行時参照用）に
  反映されておらず、新旧の配色が混在した状態になっていた。あわせて
  `public/manifest.json`の`theme_color`/`background_color`、
  `public/icon-source.svg`・`public/favicon.svg`の塗り色、
  `index.html`の`<meta name="theme-color">`、
  `AnimatedQR.tsx`/`StationScreen.tsx`/`PeerPanel.tsx`内でハードコードして
  いたQRコード前景色（`fgColor="#1C1815"`）も旧配色のまま残っていた。
  これらを新配色（primary-600 #1B529A、primary-50 #EEF4FC、
  neutral-50 #F6F7F8、neutral-900 #191D21）に揃えて修正した。
  **再発防止の観点での注記**: `tailwind.config.js`と`tokens.ts`の色定義
  重複、および複数コンポーネントでのQR前景色のハードコードは、今後も
  同種の伝播漏れを起こしやすい構造である。次回以降、色を変更する際は
  この2ファイル＋QR関連3ファイル＋`public/`配下のアイコン・manifest系
  すべてを横断的に確認すること。
- **絵文字の置き換え**: taste-skill 3.D（絵文字ポリシー：UI文言での絵文字は
  非推奨、アイコンライブラリのグリフに置き換える）に基づき、画面に見えて
  いた絵文字（`App.tsx`の「📖 デモ」ボタン、`DemoMode.tsx`の見出し
  「📖 デモシナリオ」、`PeerPanel.tsx`の「⚡ 高速モード」ラベル）を、
  `BottomNav.tsx`と同じ自作インラインSVGアイコン（viewBox 24x24 /
  stroke-basedスタイル）に差し替えた。新規アイコンライブラリは追加して
  いない（完全オフライン運用のためバンドルサイズ・依存を極力増やさない
  という既存方針を踏襲）。コード内コメントに残る絵文字（PeerPanel.tsx等）
  はユーザーに見えないため今回は対象外とした。
- **シェイプ一貫性ルールの明文化（taste-skill 4.4 Shape Consistency
  Lock）**: このアプリは元々「カード・入力欄・通常ボタンは`rounded-card`
  （14px）、バッジ・進捗バー・ステータスドット・浮動丸ボタンは
  `rounded-full`」という2階層のルールに実質的には従っていたが、
  どこにも明文化されていなかった。taste-skillは「documented rule」が
  ある場合のみ複数の角丸を許容するため、ここに正式なルールとして記録
  する。あわせて、このルールに合っていなかった`QRScanner.tsx`の
  ビューファインダー枠（`rounded-2xl`という3つ目の未管理の値）を
  `rounded-card`に統一した。
- **アイコンの線幅統一**: `SetupScreen.tsx`の`CloseIcon`だけ
  `strokeWidth={1.75}`と、他の全アイコン（`strokeWidth={1.5}`）から
  浮いていたため1.5に統一した（taste-skill 3.C「Standardize strokeWidth
  globally」）。
- **QRコード前景色のトークン参照化（再発防止）**: 前回のセッションで
  `AnimatedQR.tsx`/`StationScreen.tsx`/`PeerPanel.tsx`の
  `fgColor="#1C1815"`という決め打ちの16進数値が、配色刷新時に
  更新漏れの原因になった。今回、この3ファイルすべてを
  `import { colors } from '../../styles/tokens'` → `fgColor={colors.neutral[900]}`
  という形に書き換え、ハードコードされた16進数値そのものを排除した。
  以後、`tokens.ts`の値を変えれば自動的に追従する。
- **PeerPanel.tsxのトーストをcommon/Toastへ統合**: `common/Toast.tsx`の
  コメントに「将来的には移行するのが望ましい」と残っていた技術的負債を
  解消した。`PeerPanel.tsx`が独自に持っていたインライントースト
  （`common/Toast.tsx`と完全に同一のマークアップだった）を
  `<Toast message={toast} />`に置き換えた。`StationScreen.tsx`は
  常時ダーク基調固定というこの画面固有の意図的な設計
  （アプリ全体のライト/ダーク設定に連動させないキオスク画面。詳細は
  `StationScreen.tsx`冒頭のコメント参照）があり、`common/Toast.tsx`の
  `dark:`前提の配色とは相容れないため、意図的に据え置いた
  （バグではなく設計判断）。
- **ボタン押下時のタクタイルフィードバックをグローバル追加
  （taste-skill 4.5）**: `active:bg-*`による色の変化はあったが、
  「押した」という物理的な手応え（`scale`/`translate`）がアプリ全体に
  存在しなかった。個別コンポーネントを1つずつ直すと実装漏れが起きやすい
  ため、`src/styles/index.css`に`button:not(:disabled):active { transform:
  scale(0.98); }`をグローバルなベースルールとして追加した
  （`prefers-reduced-motion`時は無効化）。既存の個々のボタンの
  className側は変更していない。
- **アプリアイコンの再設計（v5）**: 旧デザイン（頂点3つ+中心1つを線で
  つないだだけの構成、線は55%不透明度）は、単体で見ると「ネットワーク
  構成図／組織図」の汎用クリップアートに近く、MeshReliefというブランド・
  防災アプリという文脈をアイコン単体から伝えられていなかった
  （`rsvg-convert`でPNG化して16px/48pxで実際に確認し、視認性の弱さを
  裏付けた）。「シェルター（家の形のシルエット、塗り）」を主形状にし、
  その内部に「メッシュ（3ノードの三角形ネットワーク、背景色で打ち抜き）」
  を刻む構成に再設計。家の輪郭は線画ではなく面にすることで、favicon等の
  極小サイズでも輪郭が視認できるようにしている。`public/icon-source.svg`・
  `public/favicon.svg`・`SetupScreen.tsx`の`MeshMark`（インライン用に
  線画版）の3箇所を同一モチーフに統一した。あわせて、これまで手順のみ
  記載され未実施だった`public/icon-192.png`・`public/icon-512.png`・
  `public/favicon.ico`（16/32/48pxのマルチサイズ）の実ファイル生成も
  このセッションで行った（`rsvg-convert`使用）。あわせて`index.html`に
  `<link rel="alternate icon" href="/favicon.ico">`を追加（SVG非対応の
  古いブラウザ・一部クローラー向けのフォールバック）、`vite.config.ts`の
  `includeAssets`にも`favicon.ico`を追加した。

### レスポンシブ対応の点検・修正（v5セッション）

- **点検方法**: `grep`で`sm:`/`md:`/`lg:`/`xl:`等のTailwindレスポンシブ
  プレフィックスの使用箇所を全文検索したところ、コードベース全体で
  0件だった。これ自体は「スマホ専用と割り切る」なら設計判断として
  ありうるが、実際の幅の挙動を`BottomNav.tsx`・`App.tsx`・各Panelの
  ルート要素で追ったところ、矛盾が見つかった。
- **見つかった問題**: `BottomNav.tsx`（下部タブ）は元々`mx-auto max-w-md`
  で中央寄せ・幅制限されていたのに対し、`App.tsx`の`<header>`/`<main>`、
  および`SafetyPanel.tsx`等4パネルのルート要素には幅の制約が一切
  無かった。結果、タブレット/PCの広い画面で開くと、下部タブだけ中央に
  448px幅で収まり、その上のヘッダーやカード・フォームは画面いっぱいまで
  間延びする、という上下で不整合なレイアウトになっていた。
- **方針**: このアプリはQRカメラ操作が前提のため、PC向けに複数カラムの
  別レイアウトを新設するのは適切ではないと判断。広い画面でも
  「スマホ1台分のカラムを中央に固定表示する」という、この種のPWAで
  定番のパターンを採用した。
- **修正内容**:
  - `tailwind.config.js`に`maxWidth.app`（28rem、Tailwind標準の
    `max-w-md`と同値）を追加。「アプリシェル幅」の単一の定義元とした。
  - `src/ui/App.tsx`の`PersonalApp`: `<header>`と`<main>`を
    `mx-auto w-full max-w-app`のカラムでラップし、`sm:`以上の画面幅では
    左右に薄いボーダー（`sm:border-x`）を付けてカラムの境界を視認
    できるようにした。外側の背景色をカラム自体の背景色と区別できる
    トーン（ライト: `neutral-100`、ダーク: `black`）にし、広い画面では
    「中央にスマホ相当のアプリが浮かんでいる」ように見えるようにした。
  - デモモードのフルスクリーンオーバーレイも同様に`max-w-app`で中央化。
  - `BottomNav.tsx`: 外枠の`<nav>`自体を`fixed inset-x-0`（全幅）から
    `fixed left-1/2 max-w-app -translate-x-1/2`（中央固定・幅制限）に
    変更し、`sm:border-x`も追加。これにより広い画面でもヘッダー・本文・
    下部タブの3つが同じ幅・同じ境界線で揃って見えるようにした。
  - `StationScreen.tsx`: 常時ダーク基調のキオスク画面としての性質上、
    区切り線（`border-b`）自体は全幅のまま維持しつつ、ヘッダーの中身
    （累計件数・最終同期時刻の表示）だけを`max-w-2xl`で中央寄せし、
    超ワイドな画面で数値と時刻が画面の端と端に離れすぎないようにした。
    QRスキャナー部分は元々`max-w-sm`で適切に制限されていたため変更
    していない。
  - `src/ui/components/SetupScreen.tsx`は元々`mx-auto max-w-sm`で
    適切に中央寄せされており、修正不要だった。
- **意図的に対応しなかった点**: `App.tsx`の「デモ実演モード」
  「ステーション画面に戻る」という2つの浮動ボタン（`fixed ... right-4`）
  は、超ワイドな画面ではブラウザウィンドウの実際の右端に張り付く
  （中央カラムの右端ではない）。これはコンテスト審査・実演用の
  一時的な切替導線であり、被災者が実際に使う本編UIではないため、
  優先度を下げて未対応とした。

### デプロイ前検証で発覚した既存の不具合（v5セッション）

UIの点検とは別に、実際に`npm install` / `npm run build` / `npm test`を
このセッションで初めて通しで実行したところ、**クリーンな環境では
そもそもインストール・ビルドが完走しない状態**だったことが判明した
（レスポンシブ対応やアイコンの話とは無関係の、独立した不具合）。

- **`npm install`が404で失敗**: `package.json`の`devDependencies`に
  `@types/jsqr`が入っていたが、このパッケージはnpm上に存在しない
  （`jsqr`本体が`./dist/index.d.ts`として型定義を内蔵済みのため、
  そもそも別途`@types/jsqr`を入れる必要が無い）。削除して解決。
- **`tsc -b`が`vite.config.ts`の`test`プロパティで型エラー**:
  `vitest@^2.1.8`の`peerDependencies`が要求する`vite`のバージョン範囲と、
  本プロジェクトが指定する`vite@^6.0.7`がわずかに噛み合わず、
  `node_modules`内に`vite@6.4.3`（トップレベル）と`vite@5.4.21`
  （`vitest`配下にネストされたコピー）の2バージョンが共存していた。
  `vite.config.ts`は`import { defineConfig } from 'vite'`でトップレベルの
  6.4.3を使う一方、`/// <reference types="vitest/config" />`による
  `UserConfig`への`test`プロパティの型拡張（TypeScriptの
  declaration merging）はネストされた5.4.21側に対して行われており、
  型として別物とみなされてエラーになっていた。
  `package.json`に`"overrides": { "vite": "^6.0.7" }`を追加し、
  `vite`の解決先をプロジェクト全体で1本化することで解消。
- **`crypto.subtle.importKey()`で`BufferSource`型エラー**:
  `typescript@^5.7.2`が実際には最新の`5.9.3`まで上がって解決される
  ため、新しいTypeScript/DOM libの型では素の`Uint8Array`が
  `Uint8Array<ArrayBufferLike>`と推論され、`crypto.subtle.importKey()`が
  要求する`BufferSource`（`ArrayBuffer`限定）と型として噛み合わなく
  なっていた。`src/engine/crdt.ts`の`importKey()`で`as BufferSource`を
  付けて解決（実行時の値は常にArrayBuffer裏付けなので安全なキャスト）。
- **`npm test`で1件だけ失敗**: `src/storage/db.test.ts`の
  「保存した内容がそのまま読み込める（CryptoKeyの往復も含む）」テストが
  `InvalidAccessException: key is not extractable`で失敗していた。
  原因は`fake-indexeddb`（テスト環境用のIndexedDB代替実装。最新の
  6.2.5でも同様）が、CryptoKeyのstructured clone時に`extractable`
  フラグを正しく引き継がないこと。実ブラウザのIndexedDBでは発生しない、
  テスト環境固有の制約と判断した。テストの実装を、
  `exportKey()`での16進文字列比較（extractableが必要）から、
  実際に一方のキーで署名したエントリをもう一方のキーで`verify()`する
  方式（コメントに元々書かれていた「署名検証で確認」という意図に
  忠実な実装）に変更し、extractabilityに依存しない形にして解決。
- **結果**: 上記4点の修正により、クリーンな`node_modules`から
  `npm install && npm test && npm run build`が最後まで正常に完走する
  ことを確認済み（テスト47件全て成功、ビルド成功、
  `vite-plugin-pwa`のprecacheも15エントリ生成を確認）。

### 多言語対応（i18n）の実装（v5セッション）

- **対応言語**: 日本語(ja) / やさしい日本語(ja-easy) / 英語(en) /
  中国語簡体字(zh) / 韓国語(ko)の5つ。ユーザーの希望により、当初案
  （日/やさしい日/英語）に中国語・韓国語を追加した。
- **判定方法**: 起動時に`navigator.languages`から自動判定し、以後は
  手動選択（`LocaleSwitcher`）で上書きできる。「やさしい日本語」は
  端末の言語設定として存在しないため自動判定の対象にせず、手動選択
  でのみ選べる（`src/i18n/index.ts`の`detectLocale()`）。
- **永続化**: 表示言語は「同期される安否/避難所データ」とは異なり、
  端末ごとのUI設定という性質のため、CRDTエンジンやIndexedDB
  （`storage/db.ts`）ではなく`localStorage`に保存している
  （`src/i18n/persistence.ts`）。IndexedDBと違い読み込みが同期的なので、
  `initialize()`が完了する前の最初の画面（`main.tsx`のローディング表示や
  `SetupScreen`）でも選択済みの言語を即座に反映できる。
- **型安全性**: `src/i18n/locales/ja.ts`をソース・オブ・トゥルースとし、
  `export type Dict = typeof ja`から型を導出。他4ロケールは
  `satisfies Dict`で実装することで、キーの追加漏れ・型不一致が
  ビルド時のTypeScriptエラーとして検出される設計にした（実行時まで
  翻訳漏れに気づけない一般的なJSON方式のi18nライブラリより安全）。
- **対象範囲（意図的にスコープ外とした部分）**:
  - `src/engine/scenario.ts`のデモ用サンプルデータ本体
    （安否/避難所/物資/メッセージの架空の内容）は翻訳対象外とした。
    これは「UIの地の文」ではなく「投入されるデータの中身」であり、
    実際の被災者が入力した情報がその人の言語のまま残るのと同じ
    性質のものだと判断したため。ただしAct自体のタイトル・
    サブタイトル（デモの進行を説明するUI文言）は翻訳対象に含めている。
  - `store.ts`内の`throw new Error('createRecord: エンジンが初期化
    されていません')`等、各Panelのtry/catchで汎用エラートーストに
    握り潰される「起きないはずの」内部アサーションは対象外とした
    （ユーザーの目に触れないため）。
  - `src/comm/webrtc.ts`の高速モードのエラーだけは例外的に対応した:
    `PeerPanel.tsx`が失敗理由をそのままUIに表示する設計だったため、
    `fail()`呼び出しの引数を日本語の文表示から翻訳辞書のキー文字列
    （例: `'webrtcTimeout'`）に変更し、`PeerPanel.tsx`側の
    `translateWebrtcError()`で表示言語に翻訳してから出す形にした
    （ブラウザ由来の未知のエラー文字列はキーとしてヒットしないため、
    そのままフォールバック表示される）。
- **やさしい日本語について**: 単なる言い換えではなく、実際の
  やさしい日本語ガイドライン（文を短くする、難しい漢字熟語を避ける、
  二重否定を避ける等）に沿って書き直した。「避難所」→「にげるところ」、
  「安否」→「ぶじ」のように、防災の専門用語を意味が伝わる平易な言葉に
  置き換えている。
- **既知の制約（デプロイ前に必ず確認すること）**: このセッションの
  終盤でサンドボックス環境のネットワークアクセスが制限され、
  `npm install`自体が失敗する状態になった。そのため、今回のi18n関連の
  変更一式は、**実際の`tsc`/`vite build`/`vitest`による自動検証を
  通せていない**（コード編集後の目視での括弧整合性チェックと、
  5ロケールファイル間のキー構造の突き合わせは実施済み）。
  お手元の環境で`npm install && npm test && npm run build`を実行し、
  型エラーが出ないことを確認してから次の作業に進むこと。

## 未着手・次回以降のタスク（最終セッション時点）

- `public/icon-192.png` / `public/icon-512.png`（実体のPNG。
  `public/icon-source.svg`のコメントに記載した手順で変換すること。
  画像生成ツールが使えない環境のため、これはClaudeでは完了できない）
- `src/comm/qr-receiver.test.ts`, `src/comm/webrtc.test.ts`,
  `src/ui/hooks/usePeerSync.ts` のテスト（WebRTC実機での複数フレーム化
  パスは今回未検証）
- 統計の永続化（StationScreenの「本日の累計同期件数」を日付ベースで
  storage/db.tsに永続化する場合。現状はインメモリのみ）
- §4.2戦略3（単一HTMLファイル配布）の実際の有効化・検証
  （vite.config.tsにコメントアウトで用意したのみ）
- Cloudflare Pagesへの実デプロイと、`public/_headers`が意図通り
  反映されているかの実機確認（レスポンスヘッダーの目視確認）
- BottomNav・各PanelのユニットテストやE2Eテスト（今回はエンジン層
  ・ストレージ層中心にテストしており、UIコンポーネント自体の
  テストは未着手）

## 最終セッションでの追加分

- `docs/ARCHITECTURE.md`: レイヤー構成・CRDT設計・QR同期プロトコル・
  WebRTC・永続化・PWA戦略・テスト方針をまとめた技術アーキテクチャ概要。
- `docs/AI_USAGE.md`: §12.3の例示文をそのまま使わず、実際の協業
  プロセス（人間が設計書と各セッションの指示・レビューを担当し、
  Claudeが実装・実装レベルの判断・テスト・ドキュメントを担当した
  という経緯）に即して書き直した。応募資料に転用する場合は、この
  内容を踏まえて開発者自身の言葉で改めて作成することを推奨する旨も
  明記した。
- `src/storage/db.test.ts`: meta/entriesストア双方の読み書き、
  CryptoKeyの往復、type/shelterIdインデックスによる絞り込みを検証。

## 改善ロードマップ対応セッション（`meshrelief-improvement-roadmap.md`）

前セッションまでで一通り実装が完了した後、レビューで見つかった課題を
まとめた`meshrelief-improvement-roadmap.md`（優先度付きの改善項目リスト）
に基づき、優先順位に沿って対応した記録。「提出前チェックリスト」の番号は
そのロードマップ内の番号に対応する。

### 1・2. ビルド修正 + 全体確認

- `SafetyPanel.tsx`: importブロックが2回連続して書かれていた（コピペ事故）
  ため重複を削除。
- `src/i18n/locales/ja.ts`: `as const`が付いていたことで`Dict`型の各リーフが
  リテラル型に固定され、他ロケールファイルの`satisfies Dict`チェックが
  意図通りに機能していなかった（`'Cancel'`のような別の文字列リテラルを
  代入しようとした瞬間にだけ気づける、実質ザル状態だった）ため除去。
  除去後は各リーフが`string`型として扱われ、本来の「キー構造の一致」
  だけを検証する`satisfies`チェックに戻った。
- 上記2点の修正後、`npm install && npm test && npm run build`が通ることを
  このセッションで実際に確認済み（前セッション末尾に記録されていた
  「サンドボックスのネットワーク制限で自動検証できていない」という
  懸念は解消された）。

### 3. 6-1. 既存レコードの更新・削除UI（最優先実装）

CRDTエンジン層（`update()`/`delete()`）は前セッションまでに実装済み
だったが、4パネル（Safety/Shelter/Supply/Message）のUIからそれを呼ぶ
導線が無く、一度登録した内容を直す手段が「新規追加して古い方を放置する」
以外になかった。以下を追加した:

- 各パネル共通: 一覧カードに「編集」ボタンを追加し、タップすると
  フォームに既存値を読み込んだ上で開く（`editingId`状態で新規/編集を
  切替。送信時は`editingId`の有無で`createRecord`/`updateRecord`を
  出し分ける）。「削除」ボタンも追加し、`window.confirm`
  （既存の`DemoMode.tsx`のリセット確認と同じパターン）で誤操作を防止。
- SafetyPanel: 安否ステータスをフォームを開かずワンタップで変更できる
  ボタン列を追加（現在の状態以外の選択肢だけを表示）。
- ShelterPanel: 受け入れ状況（open/limited/full/closed）も同様に
  ワンタップ変更できるようにした。
- SupplyPanel: 数量の「+1」「-1」ワンタップ増減ボタンを追加
  （0を下回る操作は無効化）。
- 上記の「更新しました」「削除しました」等のトースト文言・ボタン文言は
  4パネルで共通のため、パネルごとに翻訳キーを重複させず`common`
  セクションに集約した（5ロケール分の翻訳コストを抑えるため）。

### 4. 1-1. 署名方式の刷新（HMAC共有鍵 → ECDSA公開鍵署名 + TOFU）※本命

**問題**: 旧実装の`CRDTEngine.verify()`は「`entry.nodeId`が自ノードと
異なる場合は検証不能なので`true`を返す」設計だった。ノード間で秘密鍵を
共有しない制約下では一見自然だが、実質的には「他ノードを名乗るエントリの
署名は誰でも自由に偽造できる」という穴であり、避難所の安否情報という
性質上看過できないと判断し、ロードマップが「本命」とした通り本格的な
対応を行った。

**採用した方式**: 各ノードがECDSA（P-256）鍵ペアを1組持ち、秘密鍵は
端末外に一切出さず、公開鍵は自分が作成/更新する全エントリに埋め込んで
配布する（`CRDTEntry.publicKey`。署名対象に含めているため、公開鍵だけを
後から差し替える改ざんも検出できる）。これにより`verify()`は自ノード・
他ノード問わず、任意のエントリの署名を実際に暗号学的に検証できるように
なった。

**残る課題とTOFUによる軽減**: 公開鍵暗号方式そのものの限界として、
「そのnodeIdを名乗る人物が、本当に最初にそのnodeIdを使い始めた人物と
同一か」は第三者機関（認証局）なしには証明できない。これを
TOFU（Trust On First Use）方式で軽減した: あるnodeIdの公開鍵を初めて
見た時にその組み合わせを記憶し（`CRDTEngine`内の`trustedKeys`、
再起動時は`storage/db.ts`のmetaストアに永続化した初期値から復元しつつ、
`restore()`時の全エントリreplayでも自然に拡充される）、以後同じnodeIdで
異なる公開鍵を名乗るエントリが来たら「なりすましの疑い」として拒否する。
これにより「既存nodeIdの途中乗っ取り」は防げるが、「攻撃者が全く新しい
nodeId・鍵ペアで新規参加者を装う」ことまでは防げない（＝招待制ではない
自由参加を許すアプリである以上、原理的に解決できないトレードオフとして
受け入れた）。この残存リスクを軽減するため、既存実装のまま活きている
「同期完了時に相手の名前・件数をトースト表示する」（§7.2）仕組みが、
少なくとも「見知らぬ相手から想定外の大量データが来た」ことに人間が
気づける最後の砦になっている。

**影響範囲**: `types.ts`（`CRDTEntry.publicKey`追加、`PersistedMeta`を
鍵ペア対応に変更）、`engine/crdt.ts`（鍵ペア生成・sign/verify・TOFU、
テスト専用の`signEntryForTesting`静的メソッドを追加）、`storage/db.ts`
（meta永続化）、`engine/mesh.ts`（初期化・復元フロー）、
`comm/schema.ts`（`publicKey`を必須フィールド化）。
`crdt.test.ts`は、旧HMAC方式のテストが利用していた「検証をすり抜けられる」
という抜け穴そのものが塞がれたため、実際に検証を通る署名付き合成エントリ
を作るヘルパー（`signEntryForTesting`）を使う形に全面書き換えた。
なりすまし拒否・TOFU初回信頼のテストを新規に追加している。

### 5. 1-4. `decideRole()`の相打ちデッドロック修正

**問題**: 修正前は`iCanSend >= theyAreAhead`という「同数なら常に自分が
送信側」という対称なルールだったため、双方がちょうど同じ件数だけ新しい
データを持つケースで両者が同時に'send'と判定し、互いのAnimated QRを
映し合うだけで永久にどちらもスキャンしない状態になり得た。

**対応**: `iCanSend === theyAreAhead`（かつどちらも0より大きい）の場合に
限り、相手のvectorClock QRに埋め込まれた`nodeId`との文字列比較という
決定的なタイブレークを導入した（`compareForLWW`のタイブレーク設計と
同じ発想）。あわせて、`usePeerSync.ts`の送信タイマー完了時に
`lastProcessedVcTextRef`をリセットするよう修正した
（これが無いと、相手のvectorClock QRの中身が変化していない場合に
「直前と同一内容だから無視」され続け、再スキャンしても同期が成立しない
別のデッドロックが起きうるため）。`mesh.test.ts`にタイブレークの
決定性・対称性を検証するテストを追加。

### 6. 1-3. 受信データのランタイム検証

**問題**: `qr-receiver.ts`・`PeerPanel.tsx`（テキスト同期）・
`webrtc.ts`（WebRTC DataChannel）の3箇所すべてで、`JSON.parse(...) as 型`
という無検証キャストのみで受信データを扱っていた。`as`は実行時には
何も保証しないため、壊れた/悪意あるQR・テキスト・WebRTCメッセージが
「型だけそれっぽいがフィールドが欠けている・型が違う」データを
送ってきた場合、後段（UIレンダリング、compareForLWWの数値比較等）で
未定義動作や例外が起きうる状態だった。

**対応**: `zod`を導入し、`src/comm/schema.ts`に`QRBundle`/`CRDTEntry`/
`SyncMessage`のランタイムスキーマを定義。3箇所すべての受信直後に
`.safeParse()`（またはthrowするバリアント）で検証し、不正な形式は
その場で明確なエラーとして拒否する設計にした（1件の異常でセッション
全体を巻き込まない）。あわせて、QRフレームの`total`（フレーム総数）に
妥当な上限（`MAX_QR_FRAMES = 200`）を設け、壊れた/悪意あるQRが
途方もない`total`を主張することによる軽量DoSを防いだ。

### 7. 1-2. 個人情報の拡散範囲

**問題**: `applyDefaultScope()`は、`priority: 'urgent'`のエントリを
避難所の垣根を越えて無条件に拡散する設計になっている。これ自体は
「緊急情報は広く伝える」という意図通りの挙動だが、`SafetyRecord.phone`
（電話番号）もこの対象に含まれてしまうため、緊急フラグを立てた安否情報に
電話番号を含めると、意図せず広い範囲に電話番号が伝わってしまう。

**検討したが採用しなかった案**: 「urgent拡散時は氏名/状況のみ送り、
電話番号は同一避難所内同期でのみ含める」という、フィールド単位の
段階的公開（送信先スコープに応じて一部フィールドを削って送る）。
これは1-1で導入したエントリ単位の署名検証と根本的に相容れない
（署名はエントリ全体を1つの単位として検証するため、送信先ごとに
一部フィールドを削った別バージョンを作ると、そのバージョン用に
再署名するほかなく、再署名は「誰が本当にこのデータを作ったか」という
出自を書き換えてしまう。出自を保ったまま送信先ごとに異なる中身を
配るには、同じ論理エントリに対して複数の署名済みバリアントを並行して
持ち回る設計が必要になり、CRDTエンジンの二重化に近い規模の変更になる
ため、今回のセッションでは見送った）。
**採用した対応（段階的な軽減策）**:
  1. 電話番号の入力・共有自体は既存実装の時点で既定オフ・任意入力
     （`SafetyPanel`の「電話番号も入力する」チェックボックス）になって
     いた。これは1-2の改善案のうち「フィールドをデフォルト非表示・
     任意送信にする」の部分をすでに満たしている。
  2. 今回追加分として、「緊急」と「電話番号を入力する」の両方が
     選ばれた場合にのみ、「緊急に設定すると、この電話番号は避難所の
     垣根を越えて広く共有されます」という警告文をフォーム内に表示する
     ようにした（`SafetyPanel.tsx`、5ロケール全てに翻訳追加）。
     これは拡散そのものを防ぐわけではないが、「気づかずに広範囲に
     電話番号を晒してしまう」ケースを、入力の瞬間に本人が判断できる
     形に変えるものであり、「気づいていないのと、リスクを認識した上で
     トレードオフを選んだのとでは印象が全く違う」というロードマップの
     指摘に対する、現実的な範囲での対応とした。
  3. 「同一避難所の人にしか中身を読めなくする」ためのパスフレーズ暗号化
     （QRペイロード自体の対称鍵暗号化）は、認証局なしでの鍵配布の
     UX設計（パスフレーズの音声伝達フローなど）も含めて実装コストが
     大きいため、今回は見送った。次回以降に着手する場合の入り口として、
     `QRBundle`のペイロード（JSON化前）をAES-GCM等で暗号化し、
     復号鍵を紙・口頭で伝える運用を想定するのがよい。

### 8. 6-5. ダークモードの有効化

`tailwind.config.js`は`darkMode: 'class'`で、各コンポーネントに
`dark:`バリアントのクラスが大量に書かれていたが、`<html>`要素に`dark`
クラスを付与する処理がコードのどこにも存在せず、事実上デッドコードに
なっていた。`src/ui/theme.ts`を新設し、`window.matchMedia
('(prefers-color-scheme: dark)')`を購読して`document.documentElement`に
`dark`クラスを付け外しする処理を実装、`main.tsx`の描画開始前に1度だけ
呼び出すようにした。既定は「端末設定に従う」。設定画面から
「常にライト/常にダーク」を手動選択できるようにするAPI
（`setThemePreference`/`getThemePreference`、`localStorage`に永続化）も
用意したが、設定画面自体は今回のスコープでは未着手のため、この関数を
呼び出すUIは次回以降に追加すること。

### 9. テストの追加

- `src/comm/qr-receiver.test.ts`（新規）: `QRReceiver`の状態遷移
  （進捗・完了判定・順不同受信・重複スキャン耐性・別バンドル割り込み時の
  リセット・`reset()`）、および1-3で追加したランタイム検証
  （壊れたスキーマ・ハッシュ不一致の拒否）を検証。
- `src/engine/mesh.test.ts`に、1-4のタイブレーク修正
  （相打ちデッドロックが起きないこと・結果の決定性・後方互換の
  デフォルト挙動）を検証するdescribeブロックを追加。
- `src/engine/crdt.test.ts`・`src/comm/qr-codec.test.ts`・
  `src/storage/db.test.ts`は、1-1の鍵方式変更に合わせて
  `CRDTEngine`の初期化方法（ECDSA鍵ペア）を反映する形で更新した
  （crdt.test.tsはなりすまし拒否・TOFU初回信頼のテストを新規追加）。
- `src/ui/hooks/usePeerSync.ts`自体（Reactフック）の単体テストは、
  QRスキャン・カメラAPIまわりのモックコストに対して得られる検証価値が
  相対的に小さいと判断し、今回は見送った。1-4で修正した中核ロジック
  （タイブレークの決定性）自体は`mesh.test.ts`側でエンジン層として
  直接検証済みのため、実質的なリグレッション防止は確保できている。

### 10. 実機での動作確認（未実施）

Wi-Fiなし・カメラのみでの2台間QR同期、airplane mode + PWA、実ブラウザでの
WebRTC同期は、このセッション（コード編集のみのサンドボックス環境）では
実施できない。次回、実機を用意できるセッションで確認すること。

### 11. 時間の許す範囲で対応した追加項目

- CI導入（`.github/workflows/ci.yml`）: `npm ci && npm run build && npm test`
  を`push`/`pull_request`で自動実行する最小構成。ESLint等のlintは未導入
  のため含めていない（導入時はこのワークフローにステップを足せばよい）。
- 6-2〜6-10（検索/絞り込み、物資マッチング、ダッシュボード、印刷、
  チュートリアル、重複登録防止等）は、6-1（編集/削除UI）と1-1
  （署名方式の刷新）を優先したため、今回は着手していない。次回以降の
  候補として、特に6-1と組み合わせて効果が大きい「6-10 重複登録防止
  （近い名前の安否情報が既にある場合の警告）」から着手するとよい。

### 「要確認」「要注意」マーカーの再確認

前セッションまでに`docs/DECISIONS.md`内に残されていた4件の
「要確認」「要注意」マーカー（①エントリの`nodeId`を「直近操作者」の
追跡として扱う設計、②ステーションモードの送信側フィルタの拡大解釈、
③`decideRole()`が使う「相手が自分より多く持っている量」の近似値判定、
④`payloadHash`の算出範囲）を改めて読み返した。今回のロードマップ対応
（特に1-1・1-4）がこれらの前提を壊していないことを確認した上で、
③（decideRoleの近似値判定）については1-4のタイブレーク修正が
この近似判定の上に成り立っていることを踏まえ、「近似値であっても、
タイブレークさえ決定的であればデッドロックは起きない」という点を
上記「5. 1-4.」の節に補足した。①②④は今回変更していないため、
前セッションの記述のまま有効。
