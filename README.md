# 🎰 Casino Royale – School Festival Ranking

高校文化祭カジノランキングシステム  
**複数端末リアルタイム同期 / Firebase Realtime Database 使用**

---

## ページ構成

| ファイル | 説明 | 認証 |
|---|---|---|
| `index.html` | トップ・各ゲームTOP5 | 不要（全員閲覧可） |
| `ranking.html` | フルランキング・自分の順位検索 | 不要（全員閲覧可） |
| `obs.html` | OBS/プロジェクター表示（自動スライド） | 不要 |
| `admin.html` | 管理者画面（閲覧は全員可、追加・編集・削除はPW必要） | 操作のみ要PW |
| `data.js` | Firebase接続・データ共有ライブラリ | – |

**管理者パスワード: `admin`**（data.js の ADMIN_PASSWORD で変更可）

---

## ① Firebase セットアップ手順

### 1. Googleアカウントでログイン
https://console.firebase.google.com にアクセスしてGoogleアカウントでログイン。

### 2. プロジェクト作成
1. 「プロジェクトを追加」をクリック
2. プロジェクト名を入力（例: `casino-ranking-2025`）
3. Google アナリティクスは「無効」でOK → 「プロジェクトを作成」

### 3. Realtime Database を有効化
1. 左メニュー「構築」→「Realtime Database」
2. 「データベースを作成」をクリック
3. ロケーション: **asia-southeast1**（シンガポール、日本に最近い）を選択
4. セキュリティルール: **「テストモード」** を選択 → 「有効にする」
   > ⚠️ テストモードは30日間で期限切れになります。本番運用するなら後でルールを更新してください。

### 4. Webアプリを登録して設定値を取得
1. プロジェクトの概要ページで「</>」（Web）アイコンをクリック
2. アプリのニックネームを入力（例: `casino-web`）→「アプリを登録」
3. 表示される `firebaseConfig` の内容をコピーする

```javascript
// こういう形のものが表示されます
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "casino-ranking-2025.firebaseapp.com",
  databaseURL: "https://casino-ranking-2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "casino-ranking-2025",
  storageBucket: "casino-ranking-2025.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 5. data.js を書き換える
`data.js` の先頭にある `FIREBASE_CONFIG` を上記の値で上書きする。

```javascript
// data.js の先頭部分（ここだけ書き換えればOK）
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",          // ← コピーした値
  authDomain:        "casino-ranking-2025.firebaseapp.com",
  databaseURL:       "https://casino-ranking-2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "casino-ranking-2025",
  storageBucket:     "casino-ranking-2025.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef"
};
```

---

## ② GitHub Pages で公開する手順

1. GitHubで新しいリポジトリを作成（例: `casino-ranking`）
2. このフォルダ内の **全ファイル**（index.html / ranking.html / obs.html / admin.html / data.js）をアップロード
3. Settings → Pages → Source を「Deploy from a branch」→「main」に設定
4. 数分後、`https://<ユーザー名>.github.io/casino-ranking/` でアクセス可能

---

## ③ Firebase セキュリティルール（本番推奨）

テストモード（30日）が切れる前に、Realtime Database の「ルール」タブで以下に変更してください。

```json
{
  "rules": {
    "records": {
      ".read": true,
      ".write": true
    }
  }
}
```

> ※ GitHub Pages は静的サイトなので、サーバーサイドでの認証ができません。  
> 管理者パスワードはフロントエンドのみの簡易保護です。  
> 文化祭の短期利用を想定しています。

---

## ④ 運用メモ

- **リアルタイム同期**: admin.html で追加/編集すると、他の端末の index / ranking / obs が即時更新されます
- **OBS スライド切替**: 6秒ごとに自動切替（obs.html の `setInterval(,6000)` で変更可）
- **デモデータ**: DB が空の時のみ自動投入されます。管理者画面から全削除可能
- **パスワード変更**: data.js の `ADMIN_PASSWORD = 'admin'` を書き換えてください
