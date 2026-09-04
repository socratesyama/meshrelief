/**
 * MeshRelief — デモシナリオ「令和8年熊本地震」
 * =============================================================================
 * 実装計画書 v2 §7.3に対応。
 *
 * 【注記】「令和8年熊本地震」は実在の災害ではなく、デモンストレーション用に
 * 設計書が指定した想定シナリオ名である（2016年に実際に発生した熊本地震を
 * 踏まえた「近い将来に同規模の地震が再び起きたら」という架空の想定）。
 * 登場する人物名・避難所名・物資数量等はすべて架空のデモデータであり、
 * 実際の被害状況を再現したものではない。
 *
 * 各幕(Act)のentriesは、DemoMode.tsx側で `store.createRecord()`
 * （＝実際のCRDTEntry生成・署名・同期対象化。他のパネルと全く同じ経路）
 * を通じて1件ずつ投入される想定。scenario.ts自体はデータの「レシピ」の
 * みを持つ、副作用の無い静的モジュールにしている。
 *
 * 設計判断メモ:
 *  - 幕をまたいだ構造的な参照（例: Act3の物資をAct2の避難所IDに紐づける）
 *    はあえて行っていない。避難所IDは`createRecord()`実行時に動的に
 *    発行されるため、静的なシナリオデータの時点ではまだ存在しない。
 *    物語としてのつながりは`notes`等の本文内の言及で表現している。
 *  - Act 1は「3件の安否データが投入される」と設計書に明記されている
 *    ため、entries.length===3を厳守した。他の幕の件数は設計書に
 *    明記が無いため、3件前後で揃えている。
 * =============================================================================
 */

import type { DataRecord, DemoAct } from '../types'

const act1Entries: DataRecord[] = [
  {
    type: 'safety',
    name: '田中（60代）',
    status: 'safe',
    notes: '自宅は半壊。第一小学校体育館へ避難済み。',
  },
  {
    type: 'safety',
    name: '佐藤家（3名）',
    status: 'needs_help',
    needsCare: true,
    priority: 'urgent',
    notes: '高齢の祖母が車椅子を利用。移動の付き添いが必要です。',
  },
  {
    type: 'safety',
    name: '中村',
    status: 'unknown',
    priority: 'urgent',
    notes: '発災後、連絡が取れていません。ご存知の方は情報をお願いします。',
  },
]

const act2Entries: DataRecord[] = [
  {
    type: 'shelter',
    name: '第一小学校 体育館',
    address: '第一小学校',
    capacity: 200,
    currentOccupancy: 180,
    status: 'limited',
    notes: '毛布・簡易ベッドが不足。夜間の冷え込みが厳しい状況です。',
  },
  {
    type: 'shelter',
    name: '市民会館 大ホール',
    address: '市民会館',
    capacity: 150,
    currentOccupancy: 40,
    status: 'open',
    notes: 'まだ受け入れに余裕があります。',
  },
]

const act3Entries: DataRecord[] = [
  {
    type: 'supply',
    itemName: '飲料水',
    quantity: 0,
    unit: '本',
    priority: 'urgent',
    notes: '第一小学校体育館。在庫が底をつきました。',
  },
  {
    type: 'supply',
    itemName: '毛布',
    quantity: 5,
    unit: '枚',
    priority: 'urgent',
    notes: '第一小学校体育館。避難者180名に対して不足しています。',
  },
  {
    type: 'supply',
    itemName: '紙おむつ（乳児用）',
    quantity: 0,
    unit: 'パック',
    priority: 'urgent',
    notes: '孤立した子育て世帯からの要望。周辺に店舗が無く入手困難です。',
  },
]

const act4Entries: DataRecord[] = [
  {
    type: 'message',
    authorName: '避難所運営スタッフ',
    body: '給水車が本日15時に第一小学校へ到着予定です。ポリタンク等をお持ちください。',
    priority: 'normal',
  },
  {
    type: 'message',
    authorName: '田中',
    body: '離れて暮らす家族へ: 無事です。避難所にいます。心配しないでください。',
    priority: 'normal',
  },
  {
    type: 'message',
    authorName: '医療班',
    body: '持病でインスリンなど定期薬が必要な方は、至急スタッフまでお声がけください。',
    priority: 'urgent',
  },
]

export const DEMO_SCENARIO_TITLE = '令和8年熊本地震'

export const demoActs: DemoAct[] = [
  {
    id: 1,
    title: '発災直後 — 安否確認の空白',
    subtitle: '誰が無事で、誰が助けを必要としているのか。まだ誰にも分からない。',
    entries: act1Entries,
  },
  {
    id: 2,
    title: '避難所の環境 — 見えない惨状',
    subtitle: '避難所ごとの受け入れ状況は、現地にいる人にしか分からない。',
    entries: act2Entries,
  },
  {
    id: 3,
    title: '物資不足 — 孤立したニーズ',
    subtitle: '何が、どこで、どれだけ足りないのか。',
    entries: act3Entries,
  },
  {
    id: 4,
    title: 'メッセージ同期 — つながる希望',
    subtitle: '通信が無くても、QRコードなら想いは届く。',
    entries: act4Entries,
  },
]
