# 開発への参加

macOS、Raycast、Node.js 22.18以上とnpmを使用します。

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run lint
npm run build
```

UIを確認する場合は `npm run dev` でRaycastに登録します。build/devはローカルの同名拡張を更新するため、普段使っている辞書は先にバックアップしてください。CLIや認証がなくても自動テストは動きます。HTTP画像テストはループバックの一時ポートを使います。

不具合報告には再現手順、期待と実際の動作、macOS/Raycast/Node/Codexのバージョンを記載してください。辞書全体、認証ファイル、機密画像やログを添付せず、架空の最小データで再現してください。

変更は小さく保ち、挙動変更では独立した期待結果で検証してください。特に辞書の上書き防止、古い編集の拒否、SVG検証、非同期生成の中止を維持します。画像やコードを追加する場合は出典とライセンスを示してください。

公開前の確認事項は [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) を参照してください。

GitHub Actionsのチェック設定も同梱しています。push/PRで型・Lint・テストを実行し、公開やCodex問い合わせは行いません。設定は[checkout](https://github.com/actions/checkout)と[setup-node](https://github.com/actions/setup-node)の公式手順に基づきます。GitHub上ではまだ実行していません。
