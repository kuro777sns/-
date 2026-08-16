# 🍓 noteさがし

売れてるnoteを、ジャンル別に探せるかわいい検索アプリ。
ビルド不要のHTML/CSS/JavaScriptだけで動きます。

![ジャンル別に探せるパステル調のUI](docs/screenshot.png)

## できること

- **16ジャンル＋「いま人気」** から、note の記事をワンタップで検索
- **キーワード検索**（例：「副業のはじめかた」）
- **並び替え**：🔥 売れ筋順 / 💗 スキが多い順 / ✨ 新着順 / 🪙 価格が安い順
- **絞り込み**：有料のみ・無料のみ / 投稿期間（1ヶ月・3ヶ月・1年）
- **⭐ お気に入り**：ブラウザに保存されるので、あとから見返せる
- **売れ筋スコア**：有料noteは「価格 × スキ数」、無料noteは「スキ数」を
  表示中の記事のなかで100点満点に正規化したもの
- スマホ・PC両対応、URLに条件が入るので共有もできる

## 使いかた

このリポジトリを開いて `index.html` をブラウザで開くだけです。

```bash
# ローカルで見る場合（file:// でも動きますが、http のほうが確実です）
python3 -m http.server 8000
# → http://localhost:8000
```

### GitHub Pages で公開する

1. リポジトリの **Settings → Pages** を開く
2. **Source** を `Deploy from a branch`、ブランチをこのブランチ（または `main`）、
   フォルダを `/ (root)` に設定
3. 数十秒待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

ビルド作業やサーバーは不要です。

## データについて

note.com の公開検索API（`https://note.com/api/v3/searches`）を
ブラウザから直接読み込んで表示しています。

### 記事が出てこないとき（CORSエラー）

note.com 側の設定によっては、ブラウザから直接APIを読めないことがあります
（コンソールに CORS エラーが出ます）。その場合の動きは次のとおりです。

1. まず直接アクセスを試す
2. だめなら公開の中継サービス（corsproxy.io / allorigins）を順に試す
3. それも通らなければ **デモデータ**に切り替えて画面を保つ
   （画面上に「デモデータを表示しています」と明示されます）

自前の中継を使いたいときは、右上の **⚙️ 設定** から中継URLを登録できます。
`{url}` の部分が、取得先URL（URLエンコード済み）に置き換わります。

```
https://自分のワーカー.example.workers.dev/?url={url}
```

Cloudflare Workers を使う場合の最小構成の例：

```js
export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target || !target.startsWith('https://note.com/')) {
      return new Response('bad request', { status: 400 });
    }
    const res = await fetch(target, { headers: { Accept: 'application/json' } });
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
```

### 「売れ筋スコア」の注意

note は販売数を公開していないため、**実際の売上ではありません**。
価格とスキ数から算出した独自の目安として使ってください。

## ファイル構成

```
index.html            画面
assets/style.css      デザイン（パステル配色・レスポンシブ）
assets/app.js         検索・絞り込み・描画・お気に入り
assets/genres.js      ジャンル定義（絵文字・名前・検索キーワード）
assets/sample-data.js デモデータ（実在の記事ではありません）
```

### ジャンルを増やす・変える

`assets/genres.js` に1行足すだけです。

```js
{ id: 'pet', emoji: '🐈', name: 'ペット', queries: ['猫', '犬'] },
```

`queries` を複数書くと、それぞれの検索結果をまとめて重複を除いて表示します。
