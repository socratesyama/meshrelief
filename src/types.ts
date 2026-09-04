/**
 * MeshRelief — 基礎型定義
 * =============================================================================
 * 実装計画書 v2 §5.1（QRBundle / QRFrame / SyncStatus）に基づく型に加え、
 * CRDTEntry / NodeId / RecordType / DataRecord など、計画書内で前提として
 * 使われているが明文化されていなかった基礎型を、このセッションで新規に確定した。
 *
 * 設計判断メモ（後続セッションで参照すること）:
 *  - RecordType は5タブのうちデータ種別を持つ4つ（Safety/Supply/Shelter/Message）
 *    に対応する。Peerタブは同期UI専用であり、DataRecordを持たないため対象外。
 *  - CRDTEntry.data は RecordType を判別子とする Discriminated Union（DataRecord）。
 *    IndexedDBの `type` インデックス（§8.1）は `data.type` を指す。
 *  - LWW競合解決の優先順位は「lamportClock > updatedAt > nodeId」（§9.1）。
 *    Lamport clockを物理時刻(updatedAt)より優先するのは、災害時の端末時計ズレ
 *    対策のため（§11.2）。
 *  - deleted は Tombstone 方式の論理削除フラグ。削除エントリも同期対象として
 *    保持し続けることで「削除したはずのデータが同期で復活する」事故を防ぐ（§9.1）。
 *  - signature は各ノード固有のHMAC鍵による署名（§6.3）。ノード間の鍵交換は
 *    行わない前提のため、検証できるのは「同一ノード内でのデータ整合性」のみ。
 *  - 個人情報最小化のため、SafetyRecord.name は氏名 or イニシャルを許容し、
 *    phone は任意入力とする（§5.2, §11.3）。
 *  - 【v3追加】PersistedMeta.nodeRole（'personal' | 'station'）を追加。
 *    避難所受付に固定設置して使う「同期ステーションモード」の永続化の受け皿。
 *    このセッションでは型と永続化のみで、モード自体のUI/挙動は未実装。
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// 基礎ID型
// -----------------------------------------------------------------------------

/** ノード（端末）を一意に識別するID。crypto.randomUUID() 等で生成する想定。 */
export type NodeId = string;

/** CRDTEntry / DataRecord 等のレコードID（UUID）。 */
export type RecordId = string;

/** ベクタークロック: ノードIDごとの論理カウンタ。 */
export type VectorClock = Record<NodeId, number>;

// -----------------------------------------------------------------------------
// データレコード種別（4タブに対応。Peerタブは同期UIのため対象外）
// -----------------------------------------------------------------------------

export type RecordType = 'safety' | 'supply' | 'shelter' | 'message';

/** 緊急度。urgentはUI上オレンジ〜レッドで他の状態色と明確に区別する（デザイン方針参照）。 */
export type Priority = 'normal' | 'urgent';

/** 安否状況（SafetyPanel用）。 */
export type SafetyStatus = 'safe' | 'injured' | 'needs_help' | 'unknown';

/** 避難所の受け入れ状況（ShelterPanel用）。 */
export type ShelterStatus = 'open' | 'limited' | 'full' | 'closed';

interface BaseDataRecord {
  /**
   * 関連する避難所ID（任意）。ShelterRecordのエントリIDを参照する運用を想定。
   * IndexedDBの `shelterId` インデックス対象（§8.1）。避難所単位でのフィルタ
   * 表示・送信（§11.1「避難所単位でフィルタ可能に」）に使用する。
   */
  shelterId?: RecordId;
  /**
   * 緊急度（v3で全レコード種別共通に格上げ）。
   * 元々はSupplyRecord/MessageRecordのみ必須フィールドとして持っていたが、
   * SafetyRecord/ShelterRecordを含む全種別を横断して「urgentなものだけ
   * 一覧したい」という要求に対応するため、BaseDataRecordの任意フィールドへ
   * 変更した。型としては任意（デフォルト値をTypeScriptの型定義自体では表現
   * できないため）。省略時は呼び出し側（CRDTEngine.create()の呼び出し元、
   * 各Panelのフォーム等）で 'normal' を補う運用とする。
   */
  priority?: Priority;
  /** 自由記述の補足メモ。 */
  notes?: string;
}

/** 安否確認レコード（SafetyPanel）。 */
export interface SafetyRecord extends BaseDataRecord {
  type: 'safety';
  /** 氏名。個人情報最小化の観点からイニシャルでの入力も許容する（§5.2）。 */
  name: string;
  /** 電話番号。任意入力とし、QR同期時に含めるかどうかは送信側が選択する（§5.2, §11.3）。 */
  phone?: string;
  status: SafetyStatus;
  /** 詳細な病名等は入力させず、真偽フラグのみ保持する方針（§5.2）。 */
  needsMedicine?: boolean;
  needsCare?: boolean;
}

/** 物資レコード（SupplyPanel）。 */
export interface SupplyRecord extends BaseDataRecord {
  type: 'supply';
  itemName: string;
  quantity: number;
  unit: string;
}

/** 避難所情報レコード（ShelterPanel）。 */
export interface ShelterRecord extends BaseDataRecord {
  type: 'shelter';
  name: string;
  /** 住所までは入力させず、避難所名に留める（§5.2 個人情報/立地情報の最小化）。 */
  address?: string;
  capacity?: number;
  currentOccupancy?: number;
  status: ShelterStatus;
}

/** メッセージレコード（MessagePanel）。 */
export interface MessageRecord extends BaseDataRecord {
  type: 'message';
  authorName: string;
  body: string;
}

/** RecordType を判別子とする Discriminated Union。 */
export type DataRecord = SafetyRecord | SupplyRecord | ShelterRecord | MessageRecord;

/**
 * レコード更新時のpatch型。
 *
 * 【重要】`Partial<DataRecord>` ではなくこちらを使うこと。TypeScriptでは
 * `Partial<A | B>` は「A・B両方に共通するキーのみ」になる（`keyof (A|B)`が
 * 各メンバーの共通キーの積集合になるため）。DataRecordは4種類の判別共用体
 * なので、`Partial<DataRecord>` だと実質 `shelterId`/`priority`/`notes` 程度
 * しか更新できず、`status`や`itemName`のような種別固有フィールドを更新できない
 * （CRDTEngine.update()実装時に発見した不具合。§6.1 #2 の「update()を追加」を
 * 実際に使える形にするための修正）。
 * `Partial<A> | Partial<B> | ...` という「partialの共用体」にすることで、
 * いずれか1種別分のフィールドを自由に組み合わせて渡せるようにする。
 */
export type DataRecordPatch =
  | Partial<SafetyRecord>
  | Partial<SupplyRecord>
  | Partial<ShelterRecord>
  | Partial<MessageRecord>;

// -----------------------------------------------------------------------------
// CRDTエントリ（CRDTEngineが扱う最小単位）
// -----------------------------------------------------------------------------

export interface CRDTEntry {
  /** UUID。IndexedDB `entries` ストアの keyPath（§8.1）。 */
  id: RecordId;
  /** このエントリを作成/最終更新したノードのID。 */
  nodeId: NodeId;
  /**
   * 作成/最終更新ノードの表示名。データの出所を追跡可能にし、
   * 悪意ある情報への対処（§6.4：誰が作ったデータか追跡できるようにする）に用いる。
   */
  nodeName: string;
  data: DataRecord;
  /**
   * このエントリ作成/更新時点での、作成ノードのベクタークロック。
   * getEntriesSince() は `entry.vectorClock[entry.nodeId]` を参照する
   * （§6.2 修正後の実装。修正前は自ノードのVCを見てしまうバグがあった）。
   */
  vectorClock: VectorClock;
  /** LWW競合解決の第一基準（§9.1, §11.2）。物理時計のズレに影響されない。 */
  lamportClock: number;
  createdAt: number;
  /** LWW競合解決の第二基準（lamportClockが同値の場合の比較対象）。 */
  updatedAt: number;
  /** Tombstone方式の論理削除フラグ。trueの場合、UI上には表示しない。 */
  deleted: boolean;
  /**
   * 【1-1修正】作成/更新ノードのECDSA公開鍵（hex文字列、'raw'形式）。
   * 秘密鍵は各ノード内に留まり、公開鍵のみがエントリに同梱されて配布される。
   * 受信側はこの公開鍵を使って signature を検証できる（ノード間の秘密鍵
   * 共有は一切不要）。あわせて、同じ nodeId で異なる publicKey を名乗る
   * エントリが後から来た場合は「なりすましの疑い」として拒否する
   * TOFU（Trust On First Use）のキーとしても使われる（engine/crdt.ts参照）。
   */
  publicKey: string;
  /**
   * 作成/更新ノードのECDSA秘密鍵による署名（hex文字列）。
   * 【1-1修正】従来はノード固有のHMAC共有鍵方式で、自ノード以外の署名は
   * 検証不能だった。ECDSA公開鍵署名への切替により、publicKeyと組み合わせて
   * 任意のノードの署名を誰でも検証できるようになった（engine/crdt.ts
   * ファイル冒頭コメント参照）。
   */
  signature: string;
  /** 避難所スタッフによる確認済みフラグ（将来拡張・§6.4）。 */
  verified?: boolean;
}

// -----------------------------------------------------------------------------
// QR差分同期プロトコル（§2, §5.1）
// -----------------------------------------------------------------------------

export const QR_PROTOCOL_VERSION = 'MR2' as const;

/** 差分バンドル。JSON化 → チャンク分割 → QRFrame化される（§2.4）。 */
export interface QRBundle {
  bundleId: string;
  fromNodeId: NodeId;
  fromNodeName: string;
  createdAt: number;
  entryCount: number;
  /** ペイロード全体（JSON文字列）のSHA-256ハッシュ先頭8文字（§2.2, §2.5）。 */
  payloadHash: string;
  entries: CRDTEntry[];
}

/**
 * QRコード1枚分のフレーム。ワイヤーフォーマットは
 * `MR2|{bundleId}|{index}|{total}|{sha256}|{base64url(chunk)}`（§2.2）。
 */
export interface QRFrame {
  protocol: typeof QR_PROTOCOL_VERSION;
  bundleId: string;
  index: number;
  total: number;
  hash: string;
  chunk: string;
}

/**
 * vectorClock QR（受信側が自分のVCを提示する用）のデコード後の中身。
 * ワイヤーフォーマット: `MR2|VC|{nodeId}|{nodeName}|{base64url(vectorClock JSON)}`（§2.3）。
 */
export interface VectorClockQRPayload {
  nodeId: NodeId;
  nodeName: string;
  vectorClock: VectorClock;
}

/** QRScanner等が連続スキャンの進捗を報告する際の共通シェイプ（§2.6）。 */
export interface QRIngestResult {
  complete: boolean;
  /** 0.0〜1.0 */
  progress: number;
  bundle?: QRBundle;
}

// -----------------------------------------------------------------------------
// 同期状態（PeerPanel / SyncStatus.tsx / store.ts で参照。§5.1, §7.1）
// -----------------------------------------------------------------------------

export type SyncMethod = 'qr' | 'webrtc' | 'text';

export interface SyncStatus {
  lastSyncAt: number | null;
  lastSyncMethod: SyncMethod | null;
  lastSyncEntryCount: number;
  /** 未送信（＝他ノードがまだ持っていない可能性のある）新規エントリ数。 */
  pendingCount: number;
  /** WebRTC接続中ピア数（QR/テキスト同期のみの場合は常に0）。 */
  peerCount: number;
}

// -----------------------------------------------------------------------------
// WebRTC同期（オプション機能・§3）
// -----------------------------------------------------------------------------

export type SyncMessageType = 'hello' | 'sync-request' | 'sync-response' | 'ack';

/**
 * WebRTC DataChannel上でやり取りするメッセージ。
 * QR差分同期はこの型を使わず、QRBundleを直接JSONでやり取りする
 * （§5.1 末尾の注記: 「SyncMessage に QR系は含めない」）。
 */
export interface SyncMessage {
  type: SyncMessageType;
  nodeId: NodeId;
  nodeName?: string;
  vectorClock?: VectorClock;
  entries?: CRDTEntry[];
}

// -----------------------------------------------------------------------------
// エンジン初期化・永続化メタ情報（§8.1 meta ストア, §8.2 CryptoKey永続化）
// -----------------------------------------------------------------------------

export interface NodeIdentity {
  nodeId: NodeId;
  nodeName: string;
}

/**
 * ノードの役割（v3で追加）。
 *  - 'personal': 個人の避難者が持つ、通常のスマホ端末（デフォルト）。
 *  - 'station' : 避難所の受付等に固定設置し、次々に来る避難者のスマホと
 *                同期し続ける「同期ステーションモード」用。
 * このセッションではmetaストアへの永続化の受け皿のみを用意する。
 * ステーションモード自体のUI/挙動は次回以降のセッションで実装する。
 */
export type NodeRole = 'personal' | 'station';

/**
 * IndexedDB `meta` ストア（keyPath: 'key'）に保存される値の型。
 * hmacKeyHex は CryptoKey を crypto.subtle.exportKey('raw', ...) した上で
 * hex文字列化したもの（§8.2）。
 *
 * ここでの表現は「解決済み（常に全フィールドが揃っている）」形とする。
 * nodeRole追加前に書き込まれた既存レコードにはnodeRoleが無い可能性が
 * あるが、そうした「値レベルでの後方互換」はstorage/db.ts側の読み込み時に
 * デフォルト値('personal')を補う形で吸収し、この型自体は常に完全な形を表す
 * （storage/db.ts内部の実際の生レコード型は別途 `StoredMetaRecord` として
 * nodeRoleを任意フィールドで扱う）。
 */
export interface PersistedMeta {
  nodeId: NodeId;
  nodeName: string;
  nodeRole: NodeRole;
  /**
   * 【v3追加・mesh.ts実装時】このノード（端末）が紐づいている避難所のID。
   * 未設定はnull。§2.1 v3要件「prepareDiffBundleのデフォルトスコープ」で
   * 「自ノードのshelterIdと一致するエントリのみ含める」を判定するために
   * 必要になったため追加した（DataRecord.shelterIdが「そのレコードが
   * どの避難所の話か」を表すのに対し、こちらは「この端末はどの避難所の
   * 人か／どの避難所に設置されたステーションか」を表す、別概念）。
   */
  homeShelterId: RecordId | null;
  vectorClock: VectorClock;
  lamportClock: number;
  /**
   * 【1-1修正】ECDSA秘密鍵をexportKey('pkcs8', ...)した上でhex文字列化したもの。
   * 自端末のIndexedDBにのみ保存し、他ノードへ送出することは絶対にない。
   */
  privateKeyHex: string;
  /**
   * 【1-1修正】ECDSA公開鍵をexportKey('raw', ...)した上でhex文字列化したもの。
   * こちらは秘密情報ではなく、作成/更新する全エントリに同梱して配布される値と
   * 同一なので、meta ストアにも併せて保存しておき、再起動のたびに
   * exportKeyし直す無駄な非同期処理を避ける。
   */
  publicKeyHex: string;
  /**
   * 【1-1修正】TOFU（Trust On First Use）による nodeId → 信頼している
   * 公開鍵(hex) のピン留めテーブル。engine/crdt.ts の CRDTEngine が
   * 保持するものと同じ内容を、再起動時に復元できるよう永続化する。
   */
  trustedKeys: Record<NodeId, string>;
}

// -----------------------------------------------------------------------------
// デモモード（§7.3）— 型のみ先行定義。シナリオ本体は次回以降 engine/scenario.ts で扱う。
// -----------------------------------------------------------------------------

export interface DemoAct {
  id: number;
  title: string;
  subtitle: string;
  /**
   * この幕を再生した際に、engine.createRecord()経由で1件ずつ投入される
   * データ本体。
   * 【scenario.ts/DemoMode.tsx実装セッションでの修正】元は
   * `Array<Pick<CRDTEntry, 'data'>>` と `locked: boolean` を持っていたが、
   * 前者は`{data: DataRecord}[]`と実質同じで冗長なため`DataRecord[]`に
   * 単純化し、後者（再生済みかどうか）はシナリオの「静的データ」ではなく
   * 「実行時の状態」であるため、DemoAct自体からは削除しDemoMode.tsxの
   * ローカルstateへ移した。
   */
  entries: DataRecord[];
}
