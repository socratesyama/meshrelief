# MeshRelief

通信インフラに依存しない、QR差分同期型の防災情報共有PWA。
U-22プログラミングコンテスト2026応募作品。

詳しい設計判断・実装経緯は [`docs/DECISIONS.md`](./docs/DECISIONS.md) を、
手動テストの確認項目は [`docs/MANUAL_TEST_CHECKLIST.md`](./docs/MANUAL_TEST_CHECKLIST.md)
を参照。

## セットアップ

```bash
npm install
npm run dev
```

## テスト

```bash
npm test
```

## デプロイ（Cloudflare Pages）

実装計画書 v2 §4「PWA配布戦略」の「戦略1: 平時インストール推奨」に対応する、
通常のPWAとしての配布手順。

### 初回セットアップ

1. [Cloudflare Pages](https://pages.cloudflare.com/) にログインし、
   「Create a project」→「Connect to Git」からこのリポジトリを接続する。
2. ビルド設定は以下の通り指定する。

   | 項目 | 値 |
   |---|---|
   | Framework preset | Vite |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | （リポジトリ直下に配置しているなら空欄のまま） |

3. 「Save and Deploy」でデプロイを開始する。以後、接続したブランチへの
   pushで自動的に再デプロイされる。

### HTTPS・セキュアコンテキストについて

Cloudflare Pagesは自動でHTTPS配信されるため、公開後はカメラAPI
（QRスキャン）・WebRTC（高速モード）に必要な「セキュアコンテキスト」の
制約は基本的に解消される。これらはローカル開発時（LANのIPアドレス
経由でのアクセス等）にのみ生じうる制約であり、本番公開後は意識する
必要が無い。

### キャッシュ・Service Worker関連

`public/_headers` に以下を設定済み（Cloudflare Pagesはリポジトリ直下の
publicディレクトリ内にある `_headers` ファイルを自動的に読み込み、
配信時のレスポンスヘッダーに反映する）。

- `sw.js`（Service Worker本体）: 常に最新を取得させる（`Cache-Control: no-cache`）。
  ここがキャッシュされるとPWAの更新が端末に届かなくなるため。
- `dist/assets/` 配下（Viteがビルド時にコンテンツハッシュを付与する
  JS/CSS等）: 内容が変われば必ずファイル名も変わるため、長期間・
  不変（`immutable`）としてキャッシュしてよい。
- `manifest.json`・アイコン類: ファイル名にハッシュが付かない静的
  ファイルのため、短〜中期間のキャッシュに留めている。

詳しい設定内容は `public/_headers` 本体を参照。

### 動作確認

デプロイ後、実機のChrome（Android推奨）等でアクセスし、以下を確認する
（詳細は `docs/MANUAL_TEST_CHECKLIST.md` の「PWAインストール」項目）。

- ホーム画面への追加（インストール）ができる
- インストール後、スタンドアロン表示（ブラウザのアドレスバー等が無い状態）で起動する
- 機内モードにしても起動・データ登録ができる（Service Workerによる
  完全オフラインキャッシュの確認）

## 多言語対応

日本語 / やさしい日本語 / 英語 / 中国語(簡体字) / 韓国語に対応している。
翻訳辞書は`src/i18n/locales/`配下（`ja.ts`がソース・オブ・トゥルース）。
新しい文言を追加する際は、必ず`ja.ts`に追加してから他4ファイルにも
対応するキーを追加すること（`satisfies Dict`により、追加を忘れると
`npm run build`時に型エラーで検出される）。詳細は`docs/DECISIONS.md`の
「多言語対応（i18n）の実装」セクション参照。

**重要**: このセッションの終盤でサンドボックス環境のネットワークが
制限され、i18n関連の変更一式は`npm run build`等での実機検証ができて
いない。**このリポジトリを受け取ったら、まず`npm install && npm test
&& npm run build`を実行し、型エラーが無いことを確認すること。**

## アイコンについて

`public/icon-192.png` / `public/icon-512.png` / `public/favicon.ico` は
`public/icon-source.svg` / `public/favicon.svg` から生成済み（`rsvg-convert`
使用。手順は`public/icon-source.svg`内のコメント参照）。デザインは
「シェルター（家の形）+内部のメッシュノード」モチーフ（v5、詳細は
`docs/DECISIONS.md`の「taste-skillによる配色・ディテール刷新」参照）。
アイコン画像を差し替える場合は、`public/icon-source.svg` /
`public/favicon.svg` を編集した上で、同じ手順でPNG/ICOを再生成すること。
