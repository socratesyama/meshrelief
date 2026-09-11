# PWA更新戦略

Service Workerはprompt更新を採用する。新しいworkerは待機状態に置き、ユーザーが同期・Outbox送信・DB migrationの完了を確認した後に更新する。`skipWaiting`と`clientsClaim`は無効化し、既存タブを業務途中で強制切替しない。
