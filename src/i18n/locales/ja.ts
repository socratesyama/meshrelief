/**
 * MeshRelief — 翻訳辞書: 日本語（ソース・オブ・トゥルース）
 * =============================================================================
 * このファイルの構造（キー名・ネスト）が、他の全ロケール（ja-easy/en/zh/ko）
 * が実装すべき型 `Dict` の定義元になる。新しい文言を追加するときは、
 * 必ずこのファイルに追加してから、他の4ファイルにも対応するキーを
 * 追加すること（`satisfies Dict` により、追加を忘れるとビルド時の
 * 型エラーで検出できる）。
 *
 * スコープの注記（i18n対応セッション）:
 *  - アプリの全UI文言（ナビゲーション・フォーム・ボタン・トースト・
 *    エラー案内）を対象にした。
 *  - デモモードのシナリオ本文（`src/engine/scenario.ts`の各Actの
 *    `entries`＝架空の安否/避難所/物資/メッセージのサンプルデータ）は
 *    対象外。これは「UIの地の文」ではなく「デモ用に投入される
 *    サンプルデータの中身」であり、実際の被災者が入力した情報が
 *    その人の言語のまま残るのと同じ性質のものなので、翻訳しない方が
 *    実態に即していると判断した。ただしAct自体のタイトル・サブタイトル
 *    （デモの進行を説明するUI文言）は翻訳対象に含めている。
 *  - `src/engine/`・`src/comm/`層の内部エラー（QRデコード失敗等の
 *    プロトコルレベルの例外）は、実際のUIでは`usePeerSync.ts`側の
 *    catchで汎用的な案内文（`peerSync.badScan`等）に握り潰されて
 *    表示されるため、そちらの汎用文言側で翻訳している。ただし
 *    WebRTC高速モード（`comm/webrtc.ts`）だけは、失敗理由が
 *    `PeerPanel.tsx`にそのまま表示される設計のため、`webrtcErrors`
 *    として個別に翻訳対象にした。
 * =============================================================================
 */

export const ja = {
  common: {
    close: '閉じる',
    open: '開く',
    loading: '読み込み中…',
    /** 【6-1追加】各パネル共通の編集/削除UI用文言。パネルごとに個別定義せず
     *  共通化することで、4パネル×5ロケールでの翻訳の重複を避けている。 */
    edit: '編集',
    cancel: 'キャンセル',
    saveButton: '更新する',
    deleteButton: '削除',
    deleteConfirm: 'この記録を削除しますか？ この操作は取り消せません。',
    updatedToast: '更新しました',
    updateFailedToast: '更新に失敗しました',
    deletedToast: '削除しました',
    deleteFailedToast: '削除に失敗しました',
  },

  time: {
    justNow: 'たった今',
    minutesAgo: (n: number) => `${n}分前`,
    hoursAgo: (n: number) => `${n}時間前`,
    notSyncedYet: 'まだ同期していません',
  },

  localeSwitcher: {
    label: '言語',
    aria: '表示言語を選択',
  },

  nav: {
    safety: '安否',
    supply: '物資',
    shelter: '避難所',
    message: 'メッセージ',
    peer: '同期',
  },

  appHeader: {
    demo: 'デモ',
    synced: '同期済み',
    pending: (n: number) => `未同期 ${n}件`,
  },

  demoOverlay: {
    label: 'デモモード',
  },

  stationPreview: {
    enterDemo: 'デモ実演モード',
    backToStation: 'ステーション画面に戻る',
  },

  setup: {
    tagline: '通信インフラがなくても、QRコードで避難所の情報をつなぐ',
    footerNote: '入力した名前や避難所名は、同期する他の端末にも表示されます。個人情報の入力は必要ありません。',
    installBanner: {
      title: 'ホーム画面に追加してください',
      body: '一度追加しておくと、通信がない状況でもすぐに開けます。',
      installButton: 'ホーム画面に追加する',
      iosHintPrefix: '共有ボタン',
      iosHintSuffix: 'から「ホーム画面に追加」を選んでください。',
      menuHint: 'ブラウザのメニューから「ホーム画面に追加」を選んでください。',
      closeAria: 'このお知らせを閉じる',
    },
    roleChoice: {
      heading: 'この端末をどう使いますか？',
      personalTitle: '個人として使う',
      personalDesc: '自分のスマホとして、安否や物資の情報を記録・共有します',
      stationTitle: 'この端末を同期ステーションにする',
      stationDesc: '避難所の受付に固定し、来訪者のスマホと次々に同期し続けます',
    },
    nameStep: {
      backAria: '選択に戻る',
      stationHeading: '避難所の情報を入力',
      personalHeading: 'お名前を入力',
      stationLabel: '避難所名',
      personalLabel: 'お名前（イニシャルでも構いません）',
      stationPlaceholder: '例: 第一小学校 体育館',
      personalPlaceholder: '例: T.A.',
      stationHint: 'この端末は避難所の受付等に設置し、次々に来る方のスマホと同期し続ける「同期ステーション」として動作します。',
      submitting: '準備中…',
      start: 'はじめる',
    },
  },

  safetyPanel: {
    title: '安否情報',
    count: (n: number) => `${n}件`,
    addButton: '＋ 安否情報を登録',
    nameLabel: 'お名前',
    nameHint: 'イニシャルでも構いません（例: T.A.）',
    namePlaceholder: '例: T.A.',
    statusLabel: '状況',
    status: {
      safe: '無事',
      injured: 'けが有り',
      needs_help: '支援が必要',
      unknown: '不明',
    },
    phoneLabel: '電話番号',
    phoneShareLabel: '電話番号も入力する（他の端末と同期時に共有されます）',
    phonePlaceholder: '090-xxxx-xxxx',
    /** 【1-2追加】緊急扱いのレコードは避難所の垣根を越えて拡散されるため、
     *  電話番号を含めるとその拡散範囲にも同じく含まれてしまう。この
     *  組み合わせが選ばれたときだけ表示する注意書き（DECISIONS.md参照）。 */
    phoneUrgentWarning: '「緊急」に設定すると、この電話番号は避難所の垣根を越えて広く共有されます。共有範囲を絞りたい場合は、電話番号の入力を控えるか「緊急」を解除してください。',
    telPrefix: 'TEL: ',
    needsLabel: '必要な支援',
    needsMedicine: '薬が必要',
    needsCare: '介助が必要',
    notesLabel: '備考（任意）',
    submitting: '登録中…',
    submitButton: '登録する',
    successToast: '登録しました',
    errorToast: '登録に失敗しました',
    emptyTitle: 'まだ安否情報がありません',
    emptyDesc: '上のボタンから登録できます',
    urgentBadge: '緊急',
  },

  supplyPanel: {
    title: '物資情報',
    count: (n: number) => `${n}件`,
    addButton: '＋ 物資情報を登録',
    itemNameLabel: '品名',
    itemNamePlaceholder: '例: 飲料水',
    quantityLabel: '数量',
    quantityPlaceholder: '例: 20',
    unitLabel: '単位',
    unitPlaceholder: '例: 本 / 箱 / 個',
    notesLabel: '備考（任意）',
    submitting: '登録中…',
    submitButton: '登録する',
    successToast: '登録しました',
    errorToast: '登録に失敗しました',
    emptyTitle: 'まだ物資情報がありません',
    emptyDesc: '上のボタンから登録できます',
    urgentBadge: '緊急',
  },

  shelterPanel: {
    title: '避難所情報',
    count: (n: number) => `${n}件`,
    addButton: '＋ 避難所を登録',
    nameLabel: '避難所名',
    namePlaceholder: '例: 第一小学校 体育館',
    addressLabel: '所在地（任意）',
    addressHint: '詳細な住所ではなく大まかな場所に留めることを推奨します',
    addressPlaceholder: '例: 第一小学校',
    capacityLabel: '定員（任意）',
    occupancyLabel: '現在の人数（任意）',
    occupancyUnit: '人',
    statusLabel: '受け入れ状況',
    status: {
      open: '受入可',
      limited: '受入制限',
      full: '満員',
      closed: '閉鎖',
    },
    notesLabel: '備考（任意）',
    submitting: '登録中…',
    submitButton: '登録する',
    successToast: '登録しました',
    errorToast: '登録に失敗しました',
    emptyTitle: 'まだ避難所情報がありません',
    emptyDesc: '上のボタンから登録できます',
  },

  messagePanel: {
    title: 'メッセージ',
    count: (n: number) => `${n}件`,
    addButton: '＋ メッセージを投稿',
    authorLabel: 'お名前',
    authorHint: 'イニシャルでも構いません',
    authorPlaceholder: '例: T.A.',
    bodyLabel: '内容',
    bodyPlaceholder: '例: 道路が冠水しています。迂回してください。',
    submitting: '投稿中…',
    submitButton: '投稿する',
    successToast: '投稿しました',
    errorToast: '投稿に失敗しました',
    emptyTitle: 'まだメッセージがありません',
    emptyDesc: '上のボタンから投稿できます',
    urgentBadge: '緊急',
  },

  prioritySelector: {
    label: '緊急度',
    normal: '通常',
    urgent: '緊急',
  },

  shelterSelect: {
    label: '避難所（任意）',
    none: '選択しない',
    emptyHint: 'まだ避難所が登録されていません（Shelterタブから登録できます）',
  },

  syncStatus: {
    title: '接続状況',
    lastSync: '最終同期',
    lastSyncCount: '前回の同期件数',
    pending: '未同期のデータ',
    peerCount: '接続中のピア',
    unitEntries: (n: number) => `${n}件`,
    unitPeers: (n: number) => `${n}台`,
    methodQr: 'QRコード',
    methodWebrtc: 'WebRTC',
    methodText: 'テキスト',
  },

  qrScanner: {
    cameraErrorGeneric: 'カメラを起動できませんでした',
    cameraErrorWithDetail: (detail: string) => `カメラを起動できませんでした: ${detail}`,
    permissionHint: 'ブラウザの設定でカメラへのアクセスを許可してください。',
  },

  animatedQR: {
    frameCounter: (current: number, total: number) => `${current} / ${total} 枚表示中`,
    guideText: '相手のカメラをこのQRコードに向けてください',
  },

  demoMode: {
    heading: 'デモシナリオ',
    scenarioTitle: '令和8年熊本地震',
    actLabel: (n: number) => `Act ${n}`,
    playedBadge: '再生済み',
    play: '再生',
    playing: '投入中…',
    played: '再生済み',
    locked: 'ロック中',
    playedToast: (n: number) => `${n}件のデータを投入しました`,
    playFailedToast: 'データの投入に失敗しました',
    resetButton: 'デモをリセット（全データを削除）',
    resetConfirm: 'デモをリセットしますか？ このアプリに保存されている全てのデータ（デモ以外のデータも含む）が削除されます。',
    acts: [
      { title: '発災直後 — 安否確認の空白', subtitle: '誰が無事で、誰が助けを必要としているのか。まだ誰にも分からない。' },
      { title: '避難所の環境 — 見えない惨状', subtitle: '避難所ごとの受け入れ状況は、現地にいる人にしか分からない。' },
      { title: '物資不足 — 孤立したニーズ', subtitle: '何が、どこで、どれだけ足りないのか。' },
      { title: 'メッセージ同期 — つながる希望', subtitle: '通信が無くても、QRコードなら想いは届く。' },
    ],
  },

  stationScreen: {
    roleSuffix: '（同期ステーション）',
    todayUnit: '件 本日',
    lastSync: '最終同期',
    notSyncedTime: '--:--',
    waitingText: '次の方のスマホをカメラにかざしてください',
    receivingText: '受信中…',
    sendingText: '画面を相手に見せてください',
    backToWaiting: '待機に戻る',
    footerNote: 'この端末は同期ステーションとして動作しています。',
    exitButton: '同期ステーションを解除',
    exitSubmitting: '解除中…',
    exitConfirm: 'この端末の「同期ステーション」設定を解除して個人モードに戻しますか？ この変更は再読み込み後も維持されます。',
  },

  peerSync: {
    badScan: 'うまく読み取れていないようです。QRコードにカメラを近づけて、画面全体を映してください',
    sendPrepFailed: '送信データの準備に失敗しました',
    syncedAlready: '同期済みです',
    syncedCount: (n: number) => `${n}件同期しました`,
  },

  peerPanel: {
    waitingLabel: 'スキャン待機中',
    receivingLabel: '受信中…',
    myStatusHint: 'あなたの状態を、相手のカメラに見せています',
    sendingHint: '画面を相手に見せてください',
    backToScan: 'スキャンに戻る',
    scopeDetailPrefix: '詳細設定: ',
    scopeAll: '全データを同期する（オン）',
    scopeDefault: '緊急度の高いデータ・自分の避難所のみ同期する',
    textSync: {
      title: 'テキストで同期（緊急時）',
      hint: 'カメラが使えない場合の最終手段です。データをテキストとして作成し、他のアプリ（メッセージ等）でコピー&ペーストして共有してください。',
      createButton: '送信データを作成',
      copyButton: 'コピーする',
      pasteLabel: '受け取ったテキストを貼り付け',
      pastePlaceholder: 'ここに貼り付けてください',
      importButton: '取り込む',
      createdToast: (n: number) => `${n}件のデータを用意しました。コピーして相手に送ってください`,
      createFailedToast: 'データの準備に失敗しました',
      copiedToast: 'コピーしました',
      copyFailedToast: 'コピーできませんでした。テキストを選択して手動でコピーしてください',
      invalidFormatToast: 'データの形式が正しくありません',
      importedToast: (n: number) => `${n}件取り込みました`,
      importFailedToast: '取り込みに失敗しました',
    },
    webrtc: {
      title: '高速モード（同じWi-Fi内、任意）',
      unsupported: 'このブラウザは高速モードに対応していません。通常のQR同期をご利用ください。',
      fallbackNote: '通常のQR同期は引き続きご利用いただけます。',
      roleChoiceHint: '同じWi-Fiに接続した端末同士で、より高速に同期できます（iOS Safariでは動作しない場合があります。その場合は通常のQR同期をご利用ください）。',
      offerButton: 'オファーを作成する（先にはじめる）',
      answerButton: '相手の合図を読み取る',
      offerShowHint: '相手にこのQRを見せてください',
      nextButton: '次へ: 相手の合図を読み取る',
      scanHintOffer: '相手のAnswerのQRを読み取ってください',
      scanHintAnswer: '相手のOfferのQRを読み取ってください',
      answerShowHint: '相手にこのQRを見せてください。読み取られると自動的に接続されます。',
      connecting: '接続中…',
      syncing: '同期中…',
      doneBadge: '接続完了',
      doneCount: (n: number) => `${n}件同期しました`,
      cameraYielded: '高速モード使用中は',
      cameraYieldedSuffix: '一時的にカメラを譲っています',
    },
    webrtcErrors: {
      webrtcTimeout: '接続がタイムアウトしました（同じWi-Fiに接続されているか確認してください。iOS Safariでは接続できない場合があります）',
      webrtcUnsupported: 'このブラウザはWebRTC（高速モード）に対応していません',
      webrtcNotReady: '接続の準備ができていません（先にOfferを作成してください）',
      webrtcOfferGenerationFailed: 'SDP(Offer)の生成に失敗しました',
      webrtcAnswerGenerationFailed: 'SDP(Answer)の生成に失敗しました',
      webrtcIceFailed: '端末間の接続に失敗しました（同じWi-Fiに接続されているか確認してください）',
      webrtcDisconnected: '接続が切断されました',
      webrtcChannelError: '通信中にエラーが発生しました',
      invalidSignalingFormat: 'シグナリングQRの形式が不正です',
      invalidSignalingRole: 'シグナリングQRの内容が不正です',
      invalidSignalingFrameNumber: 'シグナリングQRのフレーム番号が不正です',
      signalingChunkDecodeFailed: 'シグナリングQRのデコードに失敗しました',
      signalingMissingFrame: '一部のQRフレームが読み取れていません。もう一度スキャンしてください',
      signalingHashMismatch: 'ハッシュ不一致です。もう一度スキャンしてください',
    },
  },
}

export type Dict = typeof ja
