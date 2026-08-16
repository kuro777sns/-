/**
 * noteさがし専用の中継サーバー（Cloudflare Workers）
 *
 * ブラウザから note.com を直接読むと CORS で弾かれるため、
 * ここを経由させて Access-Control-Allow-Origin を付けて返す。
 *
 * 使い方:
 *   1. Cloudflare の Workers でこのコードを貼り付けてデプロイ
 *   2. アプリの ⚙️設定 → CORSプロキシ に次の形で登録する
 *      https://<自分のワーカー名>.workers.dev/?url={url}
 *
 * note.com 以外へは中継しないので、他人に使われても踏み台にはならない。
 */

const ALLOWED = 'https://note.com/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // ブラウザの事前確認（プリフライト）に答える
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const target = new URL(request.url).searchParams.get('url');

    if (!target) {
      return json({ error: 'url パラメータがありません' }, 400);
    }
    if (!target.startsWith(ALLOWED)) {
      return json({ error: 'note.com 以外には中継しません' }, 403);
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          // note 側に普通のブラウザからのアクセスとして扱ってもらう
          'User-Agent': 'Mozilla/5.0 (compatible; note-sagashi/1.0)',
          'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
          'Accept-Language': 'ja',
        },
        // 同じURLの結果を5分間キャッシュして、note への負荷と待ち時間を減らす
        cf: { cacheTtl: 300, cacheEverything: true },
      });
    } catch (e) {
      return json({ error: '取得に失敗しました', detail: String(e) }, 502);
    }

    const headers = new Headers(CORS);
    headers.set(
      'Content-Type',
      upstream.headers.get('Content-Type') || 'application/json; charset=utf-8'
    );
    headers.set('Cache-Control', 'public, max-age=300');

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS),
  });
}
