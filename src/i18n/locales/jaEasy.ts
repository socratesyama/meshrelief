/**
 * MeshRelief — 翻訳辞書: やさしい日本語
 * =============================================================================
 * 単なる「日本語の言い換え」ではなく、やさしい日本語のガイドライン
 * （文を短くする・難しい漢字の言葉を避ける・二重否定を避ける・
 * 「です/ます」中心のやさしい敬語にする等）に沿って書き直したもの。
 * 対象読者は、日本語を勉強中の外国人や、子どもを想定している。
 *
 * 判断が難しかった語について:
 *  - 「避難所」「安否」は防災の重要語だが、そのまま使うと伝わらない
 *    おそれがあるため、意味が分かる言い方（「にげるところ」
 *    「ぶじかどうか」）に言い換えている。
 *  - 「QRコード」「カメラ」「Wi-Fi」はやさしい日本語でもそのまま
 *    使われることが多い外来語のため、そのまま残している。
 * =============================================================================
 */
import type { Dict } from './ja'

export const jaEasy = {
  common: {
    close: 'とじる',
    open: 'ひらく',
    loading: 'よみこみちゅう…',
    edit: 'なおす',
    cancel: 'やめる',
    saveButton: 'なおして ほぞんする',
    deleteButton: 'けす',
    deleteConfirm: 'この きろくを けしますか？ もとに もどせません。',
    updatedToast: 'なおしました',
    updateFailedToast: 'なおすことが できませんでした',
    deletedToast: 'けしました',
    deleteFailedToast: 'けすことが できませんでした',
  },

  time: {
    justNow: 'いま',
    minutesAgo: (n) => `${n}ぷんまえ`,
    hoursAgo: (n) => `${n}じかんまえ`,
    notSyncedYet: 'まだ つながっていません',
  },

  localeSwitcher: {
    label: 'ことば',
    aria: 'つかう ことばを えらぶ',
  },

  nav: {
    safety: 'ぶじ',
    supply: 'しなもの',
    shelter: 'にげるところ',
    message: 'れんらく',
    peer: 'つながる',
  },

  appHeader: {
    demo: 'れんしゅう',
    synced: 'おわりました',
    pending: (n) => `まだ ${n}けん あります`,
  },

  demoOverlay: {
    label: 'れんしゅう モード',
  },

  stationPreview: {
    enterDemo: 'れんしゅうを みる',
    backToStation: 'まえの がめんに もどる',
  },

  setup: {
    tagline: 'でんわが つながらなくても、QRコードで じょうほうを つたえます',
    footerNote: 'かいた なまえや ばしょの なまえは、ほかの スマホにも みえます。じぶんの くわしい じょうほうは、かかなくて だいじょうぶです。',
    installBanner: {
      title: 'ホームがめんに ついかしてください',
      body: 'いちど ついかすると、でんわが つながらなくても すぐに ひらけます。',
      installButton: 'ホームがめんに ついかする',
      iosHintPrefix: 'きょうゆう ボタン',
      iosHintSuffix: 'を おして、「ホームがめんに ついか」を えらんでください。',
      menuHint: 'メニューから「ホームがめんに ついか」を えらんでください。',
      closeAria: 'この おしらせを とじる',
    },
    roleChoice: {
      heading: 'この スマホを どう つかいますか？',
      personalTitle: 'じぶんの スマホとして つかう',
      personalDesc: 'じぶんの ぶじや ひつような ものを かきます',
      stationTitle: 'この スマホを 「うけつけ」に する',
      stationDesc: 'にげるところの うけつけに おいて、きた ひとの スマホと なんども つなげます',
    },
    nameStep: {
      backAria: 'まえに もどる',
      stationHeading: 'にげるところの なまえを かいてください',
      personalHeading: 'なまえを かいてください',
      stationLabel: 'にげるところの なまえ',
      personalLabel: 'なまえ（かしら もじだけでも いいです）',
      stationPlaceholder: 'れい: だいいち しょうがっこう たいいくかん',
      personalPlaceholder: 'れい: T.A.',
      stationHint: 'この スマホは、にげるところの うけつけに おいて つかいます。きた ひとの スマホと なんども つながります。',
      submitting: 'じゅんび中…',
      start: 'はじめる',
    },
  },

  safetyPanel: {
    title: 'ぶじの じょうほう',
    count: (n) => `${n}けん`,
    addButton: '＋ ぶじを かく',
    nameLabel: 'なまえ',
    nameHint: 'かしら もじだけでも いいです（れい: T.A.）',
    namePlaceholder: 'れい: T.A.',
    statusLabel: 'いまの ようす',
    status: {
      safe: 'ぶじです',
      injured: 'けがを しました',
      needs_help: 'たすけて ほしいです',
      unknown: 'わかりません',
    },
    phoneLabel: 'でんわばんごう',
    phoneShareLabel: 'でんわばんごうも かく（ほかの スマホにも みえます）',
    phonePlaceholder: '090-xxxx-xxxx',
    phoneUrgentWarning: '「きんきゅう」に すると、この でんわばんごうは ほかの ひなんじょにも ひろく つたわります。しりあいだけに つたえたい ときは、でんわばんごうを かかないか「きんきゅう」を やめてください。',
    telPrefix: 'でんわ: ',
    needsLabel: 'ひつような たすけ',
    needsMedicine: 'くすりが ひつようです',
    needsCare: 'てつだいが ひつようです',
    notesLabel: 'メモ（かかなくても いいです）',
    submitting: 'おくって います…',
    submitButton: 'かく',
    successToast: 'かきました',
    errorToast: 'かけませんでした',
    emptyTitle: 'まだ なにも ありません',
    emptyDesc: 'うえの ボタンから かけます',
    urgentBadge: 'たいへん',
  },

  supplyPanel: {
    title: 'しなものの じょうほう',
    count: (n) => `${n}けん`,
    addButton: '＋ しなものを かく',
    itemNameLabel: 'なに',
    itemNamePlaceholder: 'れい: のみみず',
    quantityLabel: 'かず',
    quantityPlaceholder: 'れい: 20',
    unitLabel: 'たんい',
    unitPlaceholder: 'れい: ほん・はこ・こ',
    notesLabel: 'メモ（かかなくても いいです）',
    submitting: 'おくって います…',
    submitButton: 'かく',
    successToast: 'かきました',
    errorToast: 'かけませんでした',
    emptyTitle: 'まだ なにも ありません',
    emptyDesc: 'うえの ボタンから かけます',
    urgentBadge: 'たいへん',
  },

  shelterPanel: {
    title: 'にげるところの じょうほう',
    count: (n) => `${n}けん`,
    addButton: '＋ にげるところを かく',
    nameLabel: 'なまえ',
    namePlaceholder: 'れい: だいいち しょうがっこう たいいくかん',
    addressLabel: 'ばしょ（かかなくても いいです）',
    addressHint: 'くわしい じゅうしょより、だいたいの ばしょで だいじょうぶです',
    addressPlaceholder: 'れい: だいいち しょうがっこう',
    capacityLabel: 'なんにん はいれるか（かかなくても いいです）',
    occupancyLabel: 'いま なんにん いるか（かかなくても いいです）',
    occupancyUnit: 'にん',
    statusLabel: 'いま はいれますか',
    status: {
      open: 'はいれます',
      limited: 'すこしだけ はいれます',
      full: 'いっぱいです',
      closed: 'はいれません',
    },
    notesLabel: 'メモ（かかなくても いいです）',
    submitting: 'おくって います…',
    submitButton: 'かく',
    successToast: 'かきました',
    errorToast: 'かけませんでした',
    emptyTitle: 'まだ なにも ありません',
    emptyDesc: 'うえの ボタンから かけます',
  },

  messagePanel: {
    title: 'れんらく',
    count: (n) => `${n}けん`,
    addButton: '＋ れんらくを かく',
    authorLabel: 'なまえ',
    authorHint: 'かしら もじだけでも いいです',
    authorPlaceholder: 'れい: T.A.',
    bodyLabel: 'ないよう',
    bodyPlaceholder: 'れい: みちが みずで あるけません。ほかの みちを つかってください。',
    submitting: 'おくって います…',
    submitButton: 'かく',
    successToast: 'かきました',
    errorToast: 'かけませんでした',
    emptyTitle: 'まだ なにも ありません',
    emptyDesc: 'うえの ボタンから かけます',
    urgentBadge: 'たいへん',
  },

  prioritySelector: {
    label: 'たいへんさ',
    normal: 'ふつう',
    urgent: 'たいへん',
  },

  shelterSelect: {
    label: 'にげるところ（かかなくても いいです）',
    none: 'えらばない',
    emptyHint: 'まだ にげるところが ありません（「にげるところ」の ボタンから かけます）',
  },

  syncStatus: {
    title: 'つながって いるか',
    lastSync: 'まえに つながった とき',
    lastSyncCount: 'まえに もらった かず',
    pending: 'まだ おくって いない データ',
    peerCount: 'いま つながって いる スマホ',
    unitEntries: (n) => `${n}けん`,
    unitPeers: (n) => `${n}だい`,
    methodQr: 'QRコード',
    methodWebrtc: 'はやい つながりかた',
    methodText: 'もじ',
  },

  qrScanner: {
    cameraErrorGeneric: 'カメラが うごきません',
    cameraErrorWithDetail: (detail) => `カメラが うごきません: ${detail}`,
    permissionHint: 'ブラウザの せっていで カメラを つかえるようにしてください。',
  },

  animatedQR: {
    frameCounter: (current, total) => `${current} / ${total} まいめ`,
    guideText: 'あいてに この QRコードを カメラで うつして もらってください',
  },

  demoMode: {
    heading: 'れんしゅう',
    scenarioTitle: 'れんしゅうの おはなし（つくった おはなしです）',
    actLabel: (n) => `その ${n}`,
    playedBadge: 'みました',
    play: 'みる',
    playing: 'いれて います…',
    played: 'みました',
    locked: 'まだ みられません',
    playedToast: (n) => `${n}けん いれました`,
    playFailedToast: 'いれられませんでした',
    resetButton: 'れんしゅうを はじめから にする（ぜんぶ けす）',
    resetConfirm: 'ほんとうに はじめから にしますか？ この アプリに ある データは ぜんぶ きえます。',
    acts: [
      { title: 'じしんの すぐあと — だれが ぶじか わからない', subtitle: 'だれが ぶじで、だれが たすけを ひつようと しているか。まだ だれも しりません。' },
      { title: 'にげるところの ようす — みえない こまりごと', subtitle: 'にげるところが どうなって いるか、そこに いる ひとしか しりません。' },
      { title: 'しなものが たりない — こまって いる ひとが わからない', subtitle: 'なにが、どこで、どれだけ たりないか。' },
      { title: 'れんらくが とどく — きぼう', subtitle: 'でんわが つながらなくても、QRコードなら きもちが とどきます。' },
    ],
  },

  stationScreen: {
    roleSuffix: '（うけつけ）',
    todayUnit: 'けん（きょう）',
    lastSync: 'まえに つながった とき',
    notSyncedTime: '--:--',
    waitingText: 'つぎの ひとの スマホを カメラに かざしてください',
    receivingText: 'もらって います…',
    sendingText: 'がめんを あいてに みせてください',
    backToWaiting: 'まつ がめんに もどる',
    footerNote: 'この スマホは「うけつけ」として うごいて います。',
    exitButton: 'うけつけを やめる',
    exitSubmitting: 'やめて います…',
    exitConfirm: 'この スマホの「うけつけ」せっていを やめて、ふつうの モードに もどしますか？ この へんこうは さいよみこみ しても のこります。',
  },

  peerSync: {
    badScan: 'うまく よみとれません。QRコードに カメラを ちかづけて、ぜんぶ うつしてください',
    sendPrepFailed: 'おくる じゅんびが できませんでした',
    syncedAlready: 'もう おわって います',
    syncedCount: (n) => `${n}けん おわりました`,
  },

  peerPanel: {
    waitingLabel: 'よみとりを まって います',
    receivingLabel: 'もらって います…',
    myStatusHint: 'あなたの じょうほうを あいてに みせて います',
    sendingHint: 'がめんを あいてに みせてください',
    backToScan: 'よみとりに もどる',
    scopeDetailPrefix: 'くわしい せってい: ',
    scopeAll: 'ぜんぶの データを つなげる（オン）',
    scopeDefault: 'たいへんな データと、じぶんの にげるところだけ つなげる',
    textSync: {
      title: 'もじで つたえる（たいへんな とき）',
      hint: 'カメラが つかえない ときの さいごの ほうほうです。データを もじに して、ほかの アプリ（メッセージなど）で コピーして おくってください。',
      createButton: 'おくる データを つくる',
      copyButton: 'コピーする',
      pasteLabel: 'もらった もじを はりつける',
      pastePlaceholder: 'ここに はりつけてください',
      importButton: 'いれる',
      createdToast: (n) => `${n}けんの データが できました。コピーして あいてに おくってください`,
      createFailedToast: 'じゅんびが できませんでした',
      copiedToast: 'コピーしました',
      copyFailedToast: 'コピーできませんでした。もじを えらんで じぶんで コピーしてください',
      invalidFormatToast: 'この もじは つかえません',
      importedToast: (n) => `${n}けん いれました`,
      importFailedToast: 'いれられませんでした',
    },
    webrtc: {
      title: 'はやい モード（おなじ Wi-Fiの とき、やらなくても いいです）',
      unsupported: 'この ブラウザでは はやい モードが つかえません。いつもの QRの つながりかたを つかってください。',
      fallbackNote: 'いつもの QRの つながりかたは、これからも つかえます。',
      roleChoiceHint: 'おなじ Wi-Fiに つながって いる スマホどうしなら、もっと はやく つながります（iPhoneの Safariでは うごかない ことが あります。その ときは いつもの QRを つかってください）。',
      offerButton: 'さきに はじめる',
      answerButton: 'あいての しんごうを よみとる',
      offerShowHint: 'この QRコードを あいてに みせてください',
      nextButton: 'つぎへ: あいての しんごうを よみとる',
      scanHintOffer: 'あいての QRコードを よみとってください',
      scanHintAnswer: 'あいての QRコードを よみとってください',
      answerShowHint: 'この QRコードを あいてに みせてください。よみとられると じどうで つながります。',
      connecting: 'つないで います…',
      syncing: 'おくって います…',
      doneBadge: 'つながりました',
      doneCount: (n) => `${n}けん おわりました`,
      cameraYielded: 'はやい モードを つかって いる あいだは、',
      cameraYieldedSuffix: 'すこしの あいだ カメラが つかえません。',
    },
    webrtcErrors: {
      webrtcTimeout: 'じかんが かかりすぎて つながりませんでした（おなじ Wi-Fiか かくにんしてください。iPhoneの Safariでは つながらない ことが あります）',
      webrtcUnsupported: 'この ブラウザでは はやい モードが つかえません',
      webrtcNotReady: 'まだ じゅんびが できて いません（さきに 「さきに はじめる」を おしてください）',
      webrtcOfferGenerationFailed: 'つながる じゅんびに しっぱいしました',
      webrtcAnswerGenerationFailed: 'へんじの じゅんびに しっぱいしました',
      webrtcIceFailed: 'つながりませんでした（おなじ Wi-Fiか かくにんしてください）',
      webrtcDisconnected: 'つながりが きれました',
      webrtcChannelError: 'エラーが おきました',
      invalidSignalingFormat: 'この QRコードは つかえません',
      invalidSignalingRole: 'この QRコードは つかえません',
      invalidSignalingFrameNumber: 'この QRコードは つかえません',
      signalingChunkDecodeFailed: 'この QRコードを よみとれませんでした',
      signalingMissingFrame: 'よみとれて いない QRコードが あります。もういちど よみとってください',
      signalingHashMismatch: 'よみとりに しっぱいしました。もういちど よみとってください',
    },
  },
} satisfies Dict
