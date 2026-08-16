/* ============================================================
   noteさがし — アプリ本体
   note.com の公開検索APIをブラウザから直接読みにいく。
   CORSで弾かれた場合は中継（プロキシ）候補を順に試し、
   それも駄目ならデモデータに切り替えて表示を保つ。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 定数 ---------- */

  const API_BASE = 'https://note.com/api/v3/searches';
  const PAGE_SIZE = 20;          // 1回の検索で取る件数
  const PAGES_PER_LOAD = 3;      // 1回の読み込みで、キーワードごとに何ページ分取るか
  const DETAIL_LIMIT = 60;       // 購入状況を調べにいく上限（絞り込み後の上位から）
  const FETCH_TIMEOUT = 12000;
  const PRICE_MAX = 10000;         // スライダーの右端。この値は「上限なし」の意味
  const DEFAULT_MIN_PRICE = 980;   // 初期の下限価格

  // 購入数がどのキーで返ってくるか分からないので、ありそうなものを順に見る
  const BUYER_KEYS = [
    'buyer_count', 'buyers_count', 'purchase_count', 'purchased_count',
    'sales_count', 'sold_count', 'buy_count', 'paid_count',
  ];

  // 中継サーバーに負荷をかけすぎないよう、同時に投げる本数を絞る
  const SEARCH_CONCURRENCY = 5;
  const DETAIL_CONCURRENCY = 3;

  // 中継候補（先頭 null = 直接アクセス）
  const PROXY_CANDIDATES = [
    null,
    'https://corsproxy.io/?url={url}',
    'https://api.allorigins.win/raw?url={url}',
  ];

  const STORAGE = {
    favs:  'notesagashi:favs',
    proxy: 'notesagashi:proxy',
    demo:  'notesagashi:demo',
  };

  const POPULAR_GENRE = {
    id: 'popular',
    emoji: '🔥',
    name: 'いま人気',
    queries: ['副業', 'ChatGPT', '恋愛', 'エッセイ', '働き方'],
  };

  const GENRES = [POPULAR_GENRE].concat(window.GENRES || []);

  /* ---------- 状態 ---------- */

  const state = {
    genreId: 'popular',
    query: '',        // キーワード検索（入力があればジャンルより優先）
    sort: 'selling',
    price: 'paid',         // 無料noteは初期状態では出さない
    period: '7',           // 直近1週間の記事から探す
    bought: 'yes',         // 初期状態から「買われています」だけを出す
    priceMin: DEFAULT_MIN_PRICE,
    priceMax: PRICE_MAX,   // PRICE_MAX = 上限なし
    favOnly: false,
    page: 0,
    items: [],
    hasMore: false,
    loading: false,
    usingDemo: false,
    reqId: 0,         // 古いリクエストの結果を捨てるための世代番号
  };

  let favs = loadFavs();
  let settings = {
    proxy: localStorage.getItem(STORAGE.proxy) || '',
    demo: localStorage.getItem(STORAGE.demo) === '1',
  };
  let workingProxy;   // 一度成功した中継を覚えておく（undefined = 未確定）

  /* ---------- DOM ---------- */

  const el = {
    genreGrid:   document.getElementById('genreGrid'),
    cardGrid:    document.getElementById('cardGrid'),
    status:      document.getElementById('status'),
    resultTitle: document.getElementById('resultTitle'),
    resultCount: document.getElementById('resultCount'),
    moreBtn:     document.getElementById('moreBtn'),
    searchForm:  document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    sortChips:   document.getElementById('sortChips'),
    priceChips:  document.getElementById('priceChips'),
    periodChips: document.getElementById('periodChips'),
    boughtChips: document.getElementById('boughtChips'),
    boughtNote:  document.getElementById('boughtNote'),
    priceMin:    document.getElementById('priceMin'),
    priceMax:    document.getElementById('priceMax'),
    rangeFill:   document.getElementById('rangeFill'),
    rangeLabel:  document.getElementById('priceRangeLabel'),
    tabs:        document.getElementById('tabs'),
    searchPane:  document.getElementById('searchPane'),
    letterPane:  document.getElementById('letterPane'),
    letterInput: document.getElementById('letterInput'),
    letterCount: document.getElementById('letterCount'),
    letterRun:   document.getElementById('letterRun'),
    letterClear: document.getElementById('letterClear'),
    letterResult: document.getElementById('letterResult'),
    letterUrl:   document.getElementById('letterUrl'),
    letterFetch: document.getElementById('letterFetch'),
    letterUrlStatus: document.getElementById('letterUrlStatus'),
    favToggle:   document.getElementById('favToggle'),
    favCount:    document.getElementById('favCount'),
    settingsBtn: document.getElementById('settingsBtn'),
    modal:       document.getElementById('settingsModal'),
    proxyInput:  document.getElementById('proxyInput'),
    demoCheck:   document.getElementById('demoCheck'),
    diagBtn:     document.getElementById('diagBtn'),
    diagOut:     document.getElementById('diagOut'),
    probeUrl:    document.getElementById('probeUrl'),
    probeBtn:    document.getElementById('probeBtn'),
    probeOut:    document.getElementById('probeOut'),
    saveBtn:     document.getElementById('saveSettings'),
  };

  /* ============================================================
     ユーティリティ
     ============================================================ */

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadFavs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.favs) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveFavs() {
    try {
      localStorage.setItem(STORAGE.favs, JSON.stringify(favs));
    } catch (e) {
      /* 保存できなくても表示は続ける */
    }
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays <= 0) return 'きょう';
    if (diffDays === 1) return 'きのう';
    if (diffDays < 30) return diffDays + '日前';
    if (diffDays < 365) return Math.floor(diffDays / 30) + 'ヶ月前';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
  }

  function formatPrice(price) {
    return price > 0 ? '¥' + price.toLocaleString('ja-JP') : '無料';
  }

  function genreById(id) {
    return GENRES.filter(function (g) { return g.id === id; })[0] || POPULAR_GENRE;
  }

  /* ============================================================
     取得まわり
     ============================================================ */

  function buildUrl(query, start, apiSort) {
    const params = new URLSearchParams({
      context: 'note',
      q: query,
      size: String(PAGE_SIZE),
      start: String(start),
      sort: apiSort,
    });
    return API_BASE + '?' + params.toString();
  }

  function applyProxy(template, url) {
    if (!template) return url;
    return template
      .replace('{rawurl}', url)
      .replace('{url}', encodeURIComponent(url));
  }

  function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    return fetch(url, { signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function fetchJson(url) {
    return fetchText(url).then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('JSONとして読めませんでした');
      }
    });
  }

  /**
   * 中継候補を順に試す。成功した中継は workingProxy に記憶する。
   * asText を立てると、JSONではなく生テキスト（HTMLなど）で受け取る。
   */
  function fetchViaAnyRoute(targetUrl, asText) {
    const routes = [];
    if (settings.proxy) routes.push(settings.proxy);
    if (workingProxy !== undefined && routes.indexOf(workingProxy) === -1) routes.push(workingProxy);
    PROXY_CANDIDATES.forEach(function (p) {
      if (routes.indexOf(p) === -1) routes.push(p);
    });

    let lastError = new Error('取得できませんでした');

    return routes.reduce(function (chain, route) {
      return chain.catch(function (err) {
        lastError = err;
        const get = asText ? fetchText : fetchJson;
        return get(applyProxy(route, targetUrl)).then(function (result) {
          workingProxy = route;
          return result;
        });
      });
    }, Promise.reject(lastError));
  }

  /**
   * note API のレスポンス形が変わっても拾えるよう、
   * 「key と name を持つオブジェクト」を再帰的に集める。
   */
  function extractNotes(json) {
    const found = [];
    const seen = new Set();

    (function walk(value, depth) {
      if (!value || depth > 7 || typeof value !== 'object') return;

      if (Array.isArray(value)) {
        value.forEach(function (v) { walk(v, depth + 1); });
        return;
      }

      const looksLikeNote = typeof value.key === 'string' &&
        (typeof value.name === 'string' || typeof value.title === 'string');

      if (looksLikeNote) {
        if (!seen.has(value.key)) {
          seen.add(value.key);
          found.push(value);
        }
        return;
      }

      Object.keys(value).forEach(function (k) { walk(value[k], depth + 1); });
    })(json, 0);

    return found;
  }

  /** 購入数を取り出す。取れなければ null（＝データなし、0件とは区別する） */
  function extractBuyers(n) {
    for (let i = 0; i < BUYER_KEYS.length; i++) {
      const v = n[BUYER_KEYS[i]];
      if (typeof v === 'number' && isFinite(v)) return v;
      if (typeof v === 'string' && v !== '' && isFinite(Number(v))) return Number(v);
    }
    return null;
  }

  function normalize(n, genreId) {
    const user = n.user || n.note_user || {};
    const urlname = user.urlname || user.url_name || '';
    return {
      id: String(n.id || n.key),
      key: n.key,
      genreId: genreId,
      title: n.name || n.title || '(無題)',
      url: n.note_url || (urlname ? 'https://note.com/' + urlname + '/n/' + n.key : 'https://note.com/'),
      authorName: user.nickname || user.name || '名無しさん',
      authorUrl: urlname ? 'https://note.com/' + urlname : 'https://note.com/',
      authorIcon: user.user_profile_image_path || user.profile_image_path || '',
      likes: Number(n.like_count || n.likeCount || 0),
      comments: Number(n.comment_count || n.commentCount || 0),
      price: Number(n.price || 0),
      buyers: extractBuyers(n),
      publishAt: n.publish_at || n.publishAt || n.created_at || '',
      thumb: n.eyecatch || (Array.isArray(n.pictures) && n.pictures[0] && n.pictures[0].url) || '',
      isDemo: false,
    };
  }

  /**
   * 同時実行数を絞って順に走らせる。
   * 中継サーバーに一度に投げすぎると弾かれることがあるため。
   */
  function runLimited(tasks, limit) {
    const results = new Array(tasks.length);
    let index = 0;

    function worker() {
      if (index >= tasks.length) return Promise.resolve();
      const i = index++;
      return tasks[i]()
        .then(function (r) { results[i] = r; }, function () { results[i] = null; })
        .then(worker);
    }

    const workers = [];
    for (let i = 0; i < Math.min(limit, tasks.length); i++) workers.push(worker());
    return Promise.all(workers).then(function () { return results; });
  }

  /**
   * 現在の状態にあわせてまとめて取得する。
   * キーワードごとに PAGES_PER_LOAD ページ分を並べて投げるので、
   * 1回の読み込みで キーワード数 × ページ数 × PAGE_SIZE 件まで集まる。
   */
  function fetchPage(page) {
    const genre = genreById(state.genreId);
    const queries = state.query ? [state.query] : genre.queries;

    // 期間を短く絞っているときに人気順で取ると古い記事ばかり返ってくるので、
    // そのときは新着順で取ってきて、並べ替えは手元でやる
    const shortPeriod = state.period !== 'all' && Number(state.period) <= 30;
    const apiSort = (state.sort === 'new' || shortPeriod) ? 'new' : 'popular';

    const jobs = [];
    queries.forEach(function (q) {
      for (let i = 0; i < PAGES_PER_LOAD; i++) {
        const start = (page * PAGES_PER_LOAD + i) * PAGE_SIZE;
        jobs.push(function () {
          // 1本失敗しても他が生きていれば表示する
          return fetchViaAnyRoute(buildUrl(q, start, apiSort))
            .then(function (json) { return extractNotes(json); })
            .catch(function () { return null; });
        });
      }
    });

    return runLimited(jobs, SEARCH_CONCURRENCY).then(function (results) {
      if (results.every(function (r) { return r === null; })) {
        throw new Error('note.com からデータを取得できませんでした');
      }
      const merged = [];
      results.forEach(function (list) {
        (list || []).forEach(function (raw) { merged.push(normalize(raw, state.genreId)); });
      });
      // 最後のページが埋まっていれば、まだ先がある
      const last = results[results.length - 1];
      merged.hasMore = !!(last && last.length >= PAGE_SIZE);
      return merged;
    });
  }

  /* ============================================================
     記事詳細（購入されたかどうか）の取得

     検索APIは購入状況を返さないが、記事詳細APIには
     is_purchased_within_last_24_hours / is_recently_purchased がある。
     note.com が出している「買われています｜過去24時間」バッジと同じデータ。
     一覧に出た記事ぶんだけ、あとから順に取りにいって補完する。
     ============================================================ */

  const details = Object.create(null);   // key -> { state, data }
  let rerenderTimer = null;

  function pickDetail(json) {
    const d = (json && json.data) || extractNotes(json)[0] || json || {};
    return {
      purchased24: d.is_purchased_within_last_24_hours === true,
      purchasedRecently: d.is_recently_purchased === true,
      remainedChars: Number(d.remained_char_num || 0),
      shares: Number(d.note_share_total_count || 0),
      raters: Number(d.rater_count || 0),
    };
  }

  function detailOf(note) {
    const entry = details[note.key];
    return entry && entry.state === 'ok' ? entry.data : null;
  }

  /** 実データで「買われた」と言えるか */
  function isBought(note) {
    const d = detailOf(note);
    return !!(d && (d.purchased24 || d.purchasedRecently));
  }

  function scheduleRerender() {
    if (rerenderTimer) return;
    rerenderTimer = setTimeout(function () {
      rerenderTimer = null;
      render();
    }, 400);
  }

  function detailProgress(list) {
    let done = 0;
    let total = 0;
    list.forEach(function (n) {
      if (n.isDemo || !n.key) return;
      total++;
      const entry = details[n.key];
      if (entry && entry.state !== 'pending') done++;
    });
    return { done: done, total: total };
  }

  /** まだ調べていない記事の詳細を、少しずつ取りにいく */
  function enrichDetails(list) {
    const queue = list.filter(function (n) {
      return !n.isDemo && n.key && !details[n.key];
    });
    if (!queue.length) return;

    queue.forEach(function (n) { details[n.key] = { state: 'pending' }; });

    let index = 0;
    function next() {
      if (index >= queue.length) return;
      const note = queue[index++];

      fetchViaAnyRoute('https://note.com/api/v3/notes/' + note.key)
        .then(function (json) { details[note.key] = { state: 'ok', data: pickDetail(json) }; })
        .catch(function () { details[note.key] = { state: 'fail' }; })
        .then(function () { scheduleRerender(); next(); });
    }

    for (let i = 0; i < DETAIL_CONCURRENCY; i++) next();
  }

  /* ============================================================
     並び替え・絞り込み・スコア
     ============================================================ */

  /**
   * 反応の大きさ。
   * 有料noteにわざわざコメントする人は購入者である可能性が高いので、
   * コメント1件をスキ5個ぶんとして数える。
   */
  const COMMENT_WEIGHT = 5;

  function engagement(note) {
    return note.likes + note.comments * COMMENT_WEIGHT;
  }

  /**
   * 売れ筋スコアの元になる値。
   * 購入数が取れる記事はそれを最優先で使い、取れなければ推定に落とす。
   */
  function rawScore(note) {
    if (note.buyers !== null && note.price > 0) return note.price * note.buyers * 10;

    const base = note.price > 0 ? note.price * engagement(note) : engagement(note);

    // 実際に買われていることが分かっている記事を上に持ってくる
    const d = detailOf(note);
    if (d && d.purchased24) return base * 4;
    if (d && d.purchasedRecently) return base * 2;
    return base;
  }

  /** この結果セットで購入数が取れているか */
  function hasBuyerData(items) {
    return items.some(function (n) { return n.buyers !== null; });
  }

  /**
   * 「売れてる可能性大」のライン。
   * 購入数が公開されていないので、有料noteのスキ数で上位3分の1に入る値を使う。
   */
  let likelyThreshold = Infinity;

  function computeLikelyThreshold(pool) {
    const paid = pool
      .filter(function (n) { return n.price > 0; })
      .map(engagement)
      .sort(function (a, b) { return b - a; });

    if (!paid.length) return Infinity;

    // 件数が少ないうちは中央値、多ければ上位3分の1のライン
    const idx = paid.length < 6
      ? Math.floor((paid.length - 1) / 2)
      : Math.floor(paid.length / 3);

    return Math.max(20, paid[idx]);
  }

  /** skipBought を立てると、購入実績の判定だけ後回しにする */
  function applyFilters(items, skipBought) {
    const now = Date.now();
    const periodDays = state.period === 'all' ? null : Number(state.period);
    const noUpperLimit = state.priceMax >= PRICE_MAX;

    return items.filter(function (n) {
      if (state.price === 'paid' && n.price <= 0) return false;
      if (state.price === 'free' && n.price > 0) return false;

      // 価格帯。「無料のみ」を選んでいるときは下限が邪魔になるので効かせない
      if (state.price !== 'free') {
        if (n.price < state.priceMin) return false;
        if (!noUpperLimit && n.price > state.priceMax) return false;
      }

      if (!skipBought && state.bought === 'yes' && !isBought(n)) return false;
      if (state.bought === 'likely' && !(n.price > 0 && engagement(n) >= likelyThreshold)) return false;

      if (periodDays && n.publishAt) {
        const t = Date.parse(n.publishAt);
        if (!isNaN(t) && (now - t) / 86400000 > periodDays) return false;
      }
      return true;
    });
  }

  function applySort(items) {
    const sorted = items.slice();
    switch (state.sort) {
      case 'likes':
        sorted.sort(function (a, b) { return b.likes - a.likes; });
        break;
      case 'new':
        sorted.sort(function (a, b) {
          return (Date.parse(b.publishAt) || 0) - (Date.parse(a.publishAt) || 0);
        });
        break;
      case 'cheap':
        sorted.sort(function (a, b) {
          if (a.price !== b.price) return a.price - b.price;
          return b.likes - a.likes;
        });
        break;
      default: // selling
        sorted.sort(function (a, b) {
          const diff = rawScore(b) - rawScore(a);
          return diff !== 0 ? diff : b.likes - a.likes;
        });
    }
    return sorted;
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(function (n) {
      const k = n.key || n.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* ============================================================
     描画
     ============================================================ */

  function renderGenres() {
    el.genreGrid.innerHTML = GENRES.map(function (g) {
      const active = !state.query && g.id === state.genreId;
      return '<button type="button" class="genre-card' + (active ? ' is-active' : '') + '"' +
        ' data-genre="' + escapeHtml(g.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        '<span class="emoji" aria-hidden="true">' + g.emoji + '</span>' +
        '<span class="genre-name">' + escapeHtml(g.name) + '</span>' +
        '</button>';
    }).join('');
  }

  function setStatus(type, emoji, html) {
    if (!type) { el.status.innerHTML = ''; return; }
    el.status.innerHTML =
      '<div class="status-box ' + type + '">' +
      '<span class="status-emoji" aria-hidden="true">' + emoji + '</span>' +
      '<div>' + html + '</div></div>';
  }

  function renderSkeleton() {
    let html = '';
    for (let i = 0; i < 6; i++) {
      html += '<div class="card skeleton" aria-hidden="true">' +
        '<div class="sk sk-thumb"></div>' +
        '<div class="card-body">' +
        '<div class="sk sk-line"></div>' +
        '<div class="sk sk-line short"></div>' +
        '<div class="sk sk-line short"></div>' +
        '</div></div>';
    }
    el.cardGrid.innerHTML = html;
  }

  function cardHtml(n, scorePct, isHot) {
    const isFav = Object.prototype.hasOwnProperty.call(favs, n.id);
    const paid = n.price > 0;
    const detail = detailOf(n);
    const scoreLabel = !paid ? '人気度'
      : detail && (detail.purchased24 || detail.purchasedRecently) ? '売れ筋スコア（購入実績あり）'
      : n.comments > 0 ? '売れ筋スコア（コメント込み推定）'
      : '売れ筋スコア（推定）';

    const thumb = n.thumb
      ? '<img src="' + escapeHtml(n.thumb) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="thumb-fallback" aria-hidden="true">' + (n.isDemo ? '🧸' : '📝') + '</span>';

    const icon = n.authorIcon
      ? '<img src="' + escapeHtml(n.authorIcon) + '" alt="" loading="lazy" decoding="async">'
      : '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E" alt="">';

    return '<article class="card">' +
      '<div class="card-thumb">' + thumb +
        '<div class="card-badges">' +
          '<span class="badge ' + (paid ? 'paid">' + escapeHtml(formatPrice(n.price)) : 'free">無料') + '</span>' +
          (detail && detail.purchased24
            ? '<span class="badge bought">🔥 買われています</span>'
            : detail && detail.purchasedRecently
              ? '<span class="badge bought">📈 最近買われた</span>'
              : '') +
          (n.buyers !== null && n.buyers > 0
            ? '<span class="badge bought">🛒 ' + n.buyers.toLocaleString('ja-JP') + '人が購入</span>'
            : '') +
          (isHot ? '<span class="badge hot">🔥 売れ筋</span>' : '') +
        '</div>' +
        // デモ記事は実在しないので分析ボタンは出さない
        (n.isDemo ? '' :
          '<button type="button" class="analyze-btn" data-analyze="' + escapeHtml(n.url) + '"' +
          ' title="このnoteのセールスレターを分析する">📝 分析</button>') +
        '<button type="button" class="fav-btn' + (isFav ? ' is-on' : '') + '"' +
          ' data-fav="' + escapeHtml(n.id) + '"' +
          ' aria-pressed="' + (isFav ? 'true' : 'false') + '"' +
          ' aria-label="' + (isFav ? 'お気に入りから外す' : 'お気に入りに追加') + '">' +
          (isFav ? '⭐' : '☆') +
        '</button>' +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-title"><a href="' + escapeHtml(n.url) + '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(n.title) + '</a></h3>' +
        '<a class="card-author" href="' + escapeHtml(n.authorUrl) + '" target="_blank" rel="noopener noreferrer">' +
          icon + '<span>' + escapeHtml(n.authorName) + '</span></a>' +
        '<div class="score-label"><span>' + scoreLabel + '</span><span>' + scorePct + '</span></div>' +
        '<div class="score-bar"><span style="width:' + scorePct + '%"></span></div>' +
        '<div class="card-meta">' +
          '<span class="likes">♡ ' + n.likes.toLocaleString('ja-JP') + '</span>' +
          (n.comments > 0 ? '<span class="comments">💬 ' + n.comments.toLocaleString('ja-JP') + '</span>' : '') +
          (n.buyers !== null ? '<span>🛒 ' + n.buyers.toLocaleString('ja-JP') + '</span>' : '') +
          (detail && detail.remainedChars > 0
            ? '<span title="有料部分の文字数">📄 ' + detail.remainedChars.toLocaleString('ja-JP') + '字</span>'
            : '') +
          '<span class="price">' + escapeHtml(formatPrice(n.price)) + '</span>' +
          (n.publishAt ? '<span>' + escapeHtml(formatDate(n.publishAt)) + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderEmpty(message, sub) {
    el.cardGrid.innerHTML =
      '<div class="empty">' +
      '<span class="empty-emoji" aria-hidden="true">🍰</span>' +
      '<p>' + escapeHtml(message) + '</p>' +
      (sub ? '<p>' + escapeHtml(sub) + '</p>' : '') +
      '</div>';
  }

  /**
   * 購入数が取れているかどうかで「買われた実績あり」フィルタの有効/無効を切り替える。
   * 取れないのに絞り込めるように見せると嘘になるので、そのときは無効化して理由を出す。
   */
  function updateBoughtChips(pool) {
    const progress = detailProgress(pool);
    const boughtCount = pool.filter(isBought).length;

    if (!pool.length) { el.boughtNote.textContent = ''; return; }

    if (progress.total && progress.done < progress.total) {
      el.boughtNote.textContent =
        '購入状況を確認中… ' + progress.done + '/' + progress.total + '件';
    } else if (progress.total) {
      el.boughtNote.textContent =
        'note公式の「買われています」表示と同じデータ。上位' + progress.total +
        '件を確認して該当 ' + boughtCount + '件。';
    } else {
      el.boughtNote.textContent = '';
    }
  }

  function render() {
    // 見出し
    if (state.favOnly) {
      el.resultTitle.textContent = 'お気に入り';
    } else if (state.query) {
      el.resultTitle.textContent = '「' + state.query + '」の検索結果';
    } else {
      const g = genreById(state.genreId);
      el.resultTitle.textContent = g.emoji + ' ' + g.name + ' のnote';
    }

    const source = state.favOnly
      ? Object.keys(favs).map(function (k) { return favs[k]; })
      : state.items;

    const pool = dedupe(source);
    likelyThreshold = computeLikelyThreshold(pool);

    // 購入状況は、他の条件を満たした上位だけ調べる（そのぶん通信を節約できる）
    const candidates = applySort(applyFilters(pool, true));
    const targets = candidates.slice(0, DETAIL_LIMIT);
    enrichDetails(targets);
    updateBoughtChips(targets);

    const progress = detailProgress(targets);
    const list = state.bought === 'yes'
      ? candidates.filter(isBought)
      : candidates;

    el.resultCount.textContent = list.length ? list.length + '件' : '';

    if (!list.length) {
      // 購入状況を調べている最中は「0件」ではなく進捗を出す
      if (state.bought === 'yes' && progress.done < progress.total) {
        el.cardGrid.innerHTML =
          '<div class="empty"><span class="empty-emoji" aria-hidden="true">🔎</span>' +
          '<p>買われているnoteを探しています…</p>' +
          '<p>' + progress.done + ' / ' + progress.total + '件を確認しました</p></div>';
        el.moreBtn.hidden = true;
        return;
      }

      renderEmpty(
        state.favOnly ? 'お気に入りはまだありません'
          : state.bought === 'yes' ? '買われているnoteが見つかりませんでした'
          : '条件に合うnoteが見つかりませんでした',
        state.favOnly ? 'カードの☆を押すとここに貯まります'
          : state.bought === 'yes' ? '「すべて」に切り替えるか、価格の下限を下げてみてください'
          : '絞り込みをゆるめるか、別のジャンルを試してみてください'
      );
      el.moreBtn.hidden = true;
      return;
    }

    // スコア正規化（有料と無料で別の物差しにする）
    const maxPaid = Math.max.apply(null, [1].concat(
      list.filter(function (n) { return n.price > 0; }).map(rawScore)));
    const maxFree = Math.max.apply(null, [1].concat(
      list.filter(function (n) { return n.price <= 0; }).map(rawScore)));

    const hotIds = applySort(list.slice()).slice(0, 3).map(function (n) { return n.id; });

    el.cardGrid.innerHTML = list.map(function (n) {
      const max = n.price > 0 ? maxPaid : maxFree;
      const pct = Math.max(4, Math.round((rawScore(n) / max) * 100));
      const isHot = state.sort === 'selling' && n.price > 0 && hotIds.indexOf(n.id) !== -1;
      return cardHtml(n, pct, isHot);
    }).join('');

    el.moreBtn.hidden = state.favOnly || !state.hasMore;
    el.favCount.textContent = String(Object.keys(favs).length);
  }

  /* ============================================================
     ロード処理
     ============================================================ */

  function loadDemo(reason) {
    state.usingDemo = true;
    state.hasMore = false;

    const genre = genreById(state.genreId);
    let picked = window.SAMPLE_NOTES || [];

    if (state.query) {
      const q = state.query.toLowerCase();
      picked = picked.filter(function (n) { return n.title.toLowerCase().indexOf(q) !== -1; });
      if (!picked.length) picked = window.SAMPLE_NOTES || [];
    } else if (genre.id !== 'popular') {
      picked = picked.filter(function (n) { return n.genreId === genre.id; });
      if (!picked.length) picked = window.SAMPLE_NOTES || [];
    }

    state.items = picked.slice();
    setStatus('warn', '🧸',
      '<p><strong>デモデータを表示しています。</strong>' + escapeHtml(reason || '') + '</p>' +
      '<p>実在の記事ではありません（購入数もサンプル値です）。' +
      '設定（⚙️）から中継URLを入れると本物のnoteを表示できます。</p>');
    render();
  }

  function load(reset) {
    if (state.loading) return;

    if (state.favOnly) {
      state.usingDemo = false;
      setStatus(null);
      render();
      return;
    }

    if (settings.demo) {
      if (reset) state.page = 0;
      loadDemo('（設定でデモ表示がONになっています）');
      return;
    }

    if (reset) {
      state.page = 0;
      state.items = [];
      renderSkeleton();
      setStatus(null);
    }

    state.loading = true;
    state.usingDemo = false;
    el.moreBtn.disabled = true;

    const myReq = ++state.reqId;

    fetchPage(state.page)
      .then(function (fetched) {
        if (myReq !== state.reqId) return; // もっと新しいリクエストが走っている

        const before = state.items.length;
        state.items = dedupe(state.items.concat(fetched));
        // 新しく増えたものが無ければ、これ以上ページを進めても意味がない
        state.hasMore = fetched.hasMore !== false && state.items.length > before;

        if (!state.items.length) {
          setStatus('info', '🔎', '<p>結果が0件でした。別のキーワードで試してみてください。</p>');
        } else {
          setStatus(null);
        }
        render();
      })
      .catch(function (err) {
        if (myReq !== state.reqId) return;
        if (state.items.length) {
          setStatus('error', '😢', '<p>追加の読み込みに失敗しました（' + escapeHtml(err.message) + '）</p>');
          render();
        } else {
          loadDemo('（note.com に接続できませんでした：' + err.message + '）');
        }
      })
      .finally(function () {
        if (myReq !== state.reqId) return;
        state.loading = false;
        el.moreBtn.disabled = false;
      });
  }

  /* ============================================================
     URLハッシュ（共有用）
     ============================================================ */

  function syncHash() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    else params.set('genre', state.genreId);
    if (state.sort !== 'selling') params.set('sort', state.sort);
    const next = '#' + params.toString();
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const q = params.get('q');
    const genre = params.get('genre');
    const sort = params.get('sort');

    if (q) { state.query = q; el.searchInput.value = q; }
    if (genre && GENRES.some(function (g) { return g.id === genre; })) state.genreId = genre;
    if (sort) {
      state.sort = sort;
      Array.prototype.forEach.call(el.sortChips.children, function (btn) {
        btn.classList.toggle('is-active', btn.dataset.sort === sort);
      });
    }
  }

  /* ============================================================
     イベント
     ============================================================ */

  function bindChipGroup(container, key, onChange) {
    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.chip');
      if (!btn || !container.contains(btn) || btn.disabled) return;
      Array.prototype.forEach.call(container.children, function (c) {
        c.classList.toggle('is-active', c === btn);
      });
      state[key] = btn.dataset[key];
      onChange();
    });
  }

  /* ---------- タブ ---------- */

  function switchTab(name) {
    const isSearch = name === 'search';

    Array.prototype.forEach.call(el.tabs.children, function (t) {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });

    el.searchPane.hidden = !isSearch;
    el.letterPane.hidden = isSearch;
    el.searchForm.hidden = !isSearch;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 価格帯スライダー ---------- */

  function syncPriceRange() {
    let min = Number(el.priceMin.value);
    let max = Number(el.priceMax.value);

    // つまみが交差したら押し返す
    if (min > max) {
      if (document.activeElement === el.priceMin) { max = min; el.priceMax.value = String(max); }
      else { min = max; el.priceMin.value = String(min); }
    }

    state.priceMin = min;
    state.priceMax = max;

    const left = (min / PRICE_MAX) * 100;
    const right = (max / PRICE_MAX) * 100;
    el.rangeFill.style.left = left + '%';
    el.rangeFill.style.width = Math.max(0, right - left) + '%';

    el.rangeLabel.textContent = '¥' + min.toLocaleString('ja-JP') + ' 〜 ' +
      (max >= PRICE_MAX ? '上限なし' : '¥' + max.toLocaleString('ja-JP'));
  }

  /* ---------- API診断 ---------- */

  /**
   * note.com が実際に返してくるフィールドを見る。
   * 「購入数が取れない」ことを推測ではなく事実として確認するための道具。
   */
  /** 1つの記事オブジェクトについて、購入数まわりを中心に中身を書き出す */
  function describeNoteObject(obj) {
    if (!obj || typeof obj !== 'object') return '（データなし）';

    const keys = Object.keys(obj).sort();
    const nums = keys.filter(function (k) { return typeof obj[k] === 'number'; });
    const bools = keys.filter(function (k) { return typeof obj[k] === 'boolean'; });
    const exact = BUYER_KEYS.filter(function (k) { return k in obj; });
    // 名前に buy / purchase / sale / sold が入るキーを広めに拾う
    const fuzzy = keys.filter(function (k) {
      return /buy|purchas|sale|sold|order/i.test(k) && exact.indexOf(k) === -1;
    });

    const lines = [];
    lines.push('項目数: ' + keys.length);
    lines.push('');
    lines.push('■ 購入数のデータ');
    lines.push(exact.length
      ? '✅ あります → ' + exact.map(function (k) { return k + '=' + obj[k]; }).join(', ')
      : '❌ ありません');
    if (fuzzy.length) {
      lines.push('  （購入まわりの項目: ' +
        fuzzy.map(function (k) { return k + '=' + JSON.stringify(obj[k]); }).join(', ') + '）');
    }
    lines.push('');
    lines.push('■ 数値の項目');
    lines.push(nums.length
      ? nums.map(function (k) { return '  ' + k + ' : ' + obj[k]; }).join('\n') : '  なし');
    if (bools.length) {
      lines.push('');
      lines.push('■ true/false の項目');
      lines.push('  ' + bools.map(function (k) { return k + '=' + obj[k]; }).join(', '));
    }
    lines.push('');
    lines.push('■ キー全部');
    lines.push('  ' + keys.join(', '));
    return lines.join('\n');
  }

  /* --- 「買われています」バッジの出どころ調査 --- */

  const TREND_RE = /買われて|急上昇|話題|trend|ranking|popular|hot|badge|label|bought|purchas/i;

  function summarizeValue(v) {
    if (typeof v === 'string') {
      return v.length > 70 ? JSON.stringify(v.slice(0, 70)) + '…(' + v.length + '字)' : JSON.stringify(v);
    }
    if (v && typeof v === 'object') {
      return Array.isArray(v) ? '[配列 ' + v.length + '件]' : '{' + Object.keys(v).slice(0, 8).join(', ') + '}';
    }
    return JSON.stringify(v);
  }

  /** JSONの中から、キー名か値が正規表現にあたる場所を探す */
  function searchJson(json, re, maxHits) {
    const hits = [];
    (function walk(v, path, depth) {
      if (hits.length >= maxHits || depth > 7 || !v || typeof v !== 'object') return;

      if (Array.isArray(v)) {
        v.slice(0, 20).forEach(function (x, i) { walk(x, path + '[' + i + ']', depth + 1); });
        return;
      }

      Object.keys(v).forEach(function (k) {
        if (hits.length >= maxHits) return;
        const val = v[k];
        const here = path + '.' + k;

        if (re.test(k)) hits.push('キー名 ' + here + ' = ' + summarizeValue(val));
        // 本文は長いうえに誤検知するので値の検索からは外す
        else if (typeof val === 'string' && k !== 'body' && re.test(val)) {
          hits.push('値　　 ' + here + ' = ' + JSON.stringify(val.slice(0, 70)));
        }
        walk(val, here, depth + 1);
      });
    })(json, '', 0);
    return hits;
  }

  /** HTMLの中で語句が出てくる前後を切り出す */
  function findInHtml(html, word, maxHits) {
    const hits = [];
    let from = 0;
    while (hits.length < maxHits) {
      const at = html.indexOf(word, from);
      if (at === -1) break;
      hits.push(html.slice(Math.max(0, at - 160), at + 160).replace(/\s+/g, ' '));
      from = at + word.length;
    }
    return hits;
  }

  function runNoteProbe() {
    const url = el.probeUrl.value.trim();
    const key = parseNoteKey(url);

    el.probeOut.hidden = false;
    if (!key) {
      el.probeOut.textContent = '❌ noteの記事URLとして読み取れませんでした。\n' +
        'https://note.com/○○○/n/n○○○○ の形で貼ってください。';
      return;
    }

    el.probeOut.textContent = '調べています…（10秒ほどかかります）';
    const out = ['記事キー: ' + key];

    fetchViaAnyRoute('https://note.com/api/v3/notes/' + key)
      .then(function (detail) {
        const hits = searchJson(detail, TREND_RE, 25);
        out.push('');
        out.push('=== ① 記事詳細API ===');
        out.push(hits.length
          ? '👀 それらしい項目が見つかりました\n' + hits.map(function (h) { return '  ' + h; }).join('\n')
          : '該当なし');

        const obj = extractNotes(detail)[0] || (detail && detail.data) || detail;
        if (obj && typeof obj === 'object') {
          const bools = Object.keys(obj).filter(function (k) { return typeof obj[k] === 'boolean'; });
          const nums = Object.keys(obj).filter(function (k) { return typeof obj[k] === 'number'; });
          out.push('');
          out.push('数値: ' + (nums.map(function (k) { return k + '=' + obj[k]; }).join(', ') || 'なし'));
          out.push('真偽: ' + (bools.map(function (k) { return k + '=' + obj[k]; }).join(', ') || 'なし'));
        }
      })
      .catch(function (e) {
        out.push('');
        out.push('=== ① 記事詳細API ===');
        out.push('❌ 取得できませんでした（' + e.message + '）');
      })
      .then(function () {
        el.probeOut.textContent = out.join('\n') + '\n\n記事ページを調べています…';
        const pageUrl = /^https?:\/\//.test(url) ? url : 'https://note.com/n/' + key;
        return fetchViaAnyRoute(pageUrl, true);
      })
      .then(function (html) {
        out.push('');
        out.push('=== ② 記事ページのHTML ===');
        out.push('サイズ: ' + html.length.toLocaleString('ja-JP') + '文字');

        const found = findInHtml(html, '買われて', 3);
        out.push('');
        out.push('「買われて」の出現: ' + found.length + '件');
        found.forEach(function (h, i) {
          out.push('--- ' + (i + 1) + ' ---');
          out.push(h);
        });
        if (!found.length) {
          out.push('（HTMLには含まれていません。バッジは表示後にJavaScriptが');
          out.push('  別のAPIから取ってきて描画している可能性が高いです）');
        }
      })
      .catch(function (e) {
        out.push('');
        out.push('=== ② 記事ページのHTML ===');
        out.push('❌ 取得できませんでした（' + e.message + '）');
      })
      .then(function () {
        el.probeOut.textContent = out.join('\n');
      });
  }

  function runDiagnostics() {
    el.diagOut.hidden = false;
    el.diagOut.textContent = '調べています…';

    fetchViaAnyRoute(buildUrl('副業', 0, 'popular'))
      .then(function (json) {
        const notes = extractNotes(json);
        const first = notes[0];
        const out = [];

        out.push('✅ note.com からデータを取得できました');
        out.push('経路: ' + (workingProxy ? '中継 ' + workingProxy : '直接アクセス'));
        out.push('取得件数: ' + notes.length + '件');

        if (!first) {
          out.push('');
          out.push('⚠️ 記事オブジェクトが見つかりませんでした。レスポンスの形が変わった可能性があります。');
          el.diagOut.textContent = out.join('\n');
          return;
        }

        out.push('');
        out.push('=== ① 検索API ===');
        out.push(describeNoteObject(first));
        out.push('');
        out.push('=== ② 記事詳細API（' + first.key + '） ===');
        out.push('調べています…');
        el.diagOut.textContent = out.join('\n');

        // 検索APIより詳細APIのほうが項目が多い可能性があるので、そちらも見る
        return fetchViaAnyRoute('https://note.com/api/v3/notes/' + first.key)
          .then(function (detail) {
            const obj = extractNotes(detail)[0] || (detail && detail.data) || detail;
            out.pop();
            out.push(describeNoteObject(obj));
            el.diagOut.textContent = out.join('\n');
          })
          .catch(function (e) {
            out.pop();
            out.push('❌ 取得できませんでした（' + e.message + '）');
            el.diagOut.textContent = out.join('\n');
          });
      })
      .catch(function (err) {
        el.diagOut.textContent =
          '❌ note.com からデータを取得できませんでした\n' +
          '理由: ' + err.message + '\n\n' +
          'ブラウザからの直接アクセスがCORSでブロックされている可能性が高いです。\n' +
          '上の「CORSプロキシ」に中継URLを設定すると読めるようになります。';
      });
  }

  /* ---------- noteのURLから本文を取り込む ---------- */

  /** https://note.com/xxx/n/nabc123 → nabc123 */
  function parseNoteKey(input) {
    const s = String(input || '').trim();
    const m = s.match(/\/n\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    if (/^n[A-Za-z0-9]{6,}$/.test(s)) return s;   // キーだけ貼られた場合
    return null;
  }

  /** タグを消して、段落の区切りだけ改行に残す */
  function htmlToText(html) {
    const withBreaks = String(html || '')
      .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|h[1-6]|li|section|article|blockquote|tr)\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '');

    // 実体参照（&nbsp; など）を戻す。タグは既に落としてあるので安全
    const box = document.createElement('textarea');
    box.innerHTML = withBreaks;
    return box.value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** JSONのどこかにある一番長い body を探す */
  function findBody(json) {
    let best = '';
    (function walk(v, depth) {
      if (!v || depth > 6 || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1); }); return; }
      Object.keys(v).forEach(function (k) {
        const val = v[k];
        if ((k === 'body' || k === 'free_body' || k === 'note_body') &&
            typeof val === 'string' && val.length > best.length) {
          best = val;
        } else {
          walk(val, depth + 1);
        }
      });
    })(json, 0);
    return best;
  }

  /** 記事ページのHTMLから本文らしいところを抜く */
  function extractFromPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const container =
      doc.querySelector('.note-common-styles__textnote-body') ||
      doc.querySelector('[class*="textnote-body"]') ||
      doc.querySelector('article') ||
      doc.querySelector('main');

    const title = (doc.querySelector('h1') || {}).textContent || doc.title || '';
    const body = container ? htmlToText(container.innerHTML) : '';
    return { title: title.trim(), body: body };
  }

  /**
   * noteのURLから本文テキストを取る。
   * まずAPI、だめなら記事ページのHTMLを読む。
   */
  function fetchNoteText(url) {
    const key = parseNoteKey(url);
    if (!key) {
      return Promise.reject(new Error('noteのURLとして読み取れませんでした'));
    }

    return fetchViaAnyRoute('https://note.com/api/v3/notes/' + key)
      .then(function (json) {
        const body = htmlToText(findBody(json));
        if (body.length < 50) throw new Error('本文が取れませんでした');
        const notes = extractNotes(json);
        return { title: (notes[0] && (notes[0].name || notes[0].title)) || '', body: body, via: 'API' };
      })
      .catch(function () {
        // APIがだめなら記事ページそのものを読む
        const pageUrl = /^https?:\/\//.test(url) ? url : 'https://note.com/n/' + key;
        return fetchViaAnyRoute(pageUrl, true).then(function (html) {
          const got = extractFromPage(html);
          if (got.body.length < 50) throw new Error('本文が見つかりませんでした');
          return { title: got.title, body: got.body, via: 'ページ' };
        });
      });
  }

  /* ---------- セールスレター分析 ---------- */

  function renderLetterResult(result) {
    const angle = Math.round((result.score / 100) * 360);

    const stats = [
      ['文字数', result.stats.chars.toLocaleString('ja-JP') + '字'],
      ['段落', result.stats.paragraphs + '個'],
      ['見出し', result.stats.headings + '個'],
      ['1段落あたり', result.stats.avgParagraph + '字'],
      ['数字の登場', result.stats.numbers + '回'],
      ['問いかけ', result.stats.questions + '回'],
    ];
    if (result.stats.pricePos !== null) stats.push(['価格が出る位置', result.stats.pricePos + '%地点']);

    const found = result.items.filter(function (i) { return i.found; }).length;

    let html =
      '<div class="score-card">' +
        '<div class="score-ring" style="background:conic-gradient(var(--pink) ' + angle + 'deg, var(--cream-deep) 0)">' +
          '<span class="score-inner"><span class="score-num">' + result.score + '</span>' +
          '<span class="score-max">/ 100</span></span>' +
        '</div>' +
        '<div class="score-summary">' +
          '<h3>構成スコア<span class="grade-pill">' + result.grade + '判定</span></h3>' +
          '<p>タイプ：<b>' + escapeHtml(result.type) + '</b><br>' +
          '12の要素のうち <b>' + found + '個</b> が入っています。' +
          (result.missing.length
            ? '足りないのは「' + escapeHtml(result.missing[0].name) + '」あたりです。'
            : 'ひととおりそろっています。') + '</p>' +
          '<div class="stat-row">' +
            stats.map(function (s) {
              return '<span class="stat-pill">' + escapeHtml(s[0]) + ' <b>' + escapeHtml(s[1]) + '</b></span>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    html += '<div class="check-list">' + result.items.map(function (i) {
      return '<div class="check-item' + (i.found ? '' : ' is-missing') + '">' +
        '<span class="check-emoji" aria-hidden="true">' + i.emoji + '</span>' +
        '<div class="check-body">' +
          '<div class="check-name">' + escapeHtml(i.name) +
            '<span class="check-mark">' + (i.found ? '✅' : '⚠️ 不足') + '</span></div>' +
          (i.found
            ? '<p class="check-hit">' + escapeHtml(i.hits[0]) + '</p>'
            : '<p class="check-hint">' + escapeHtml(i.hint) + '</p>') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';

    if (result.missing.length) {
      html += '<div class="advice-box"><h3>🎯 まず直すならこの順番</h3><ol>' +
        result.missing.slice(0, 4).map(function (m) {
          return '<li><b>' + escapeHtml(m.name) + '</b>：' + escapeHtml(m.hint) + '</li>';
        }).join('') + '</ol></div>';
    }

    if (result.notes.length) {
      html += '<div class="advice-box"><h3>👀 読みやすさで気になったところ</h3><ul>' +
        result.notes.map(function (n) { return '<li>' + escapeHtml(n) + '</li>'; }).join('') +
        '</ul></div>';
    }

    html += '<div class="advice-box"><h3>ℹ️ この判定について</h3><ul>' +
      '<li>キーワードと文章構造から「要素が入っているか」を機械的に見ているだけです。' +
      '売上を予測するものではありません。</li>' +
      '<li>スコアが低くても売れるレターはあります。あくまで抜けを見つけるチェックリストとして使ってください。</li>' +
      '</ul></div>';

    el.letterResult.innerHTML = html;
    el.letterResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function runAnalysis() {
    const text = el.letterInput.value.trim();
    if (text.length < 100) {
      el.letterResult.innerHTML =
        '<div class="advice-box"><h3>📋 もう少し貼り付けてください</h3>' +
        '<p style="margin:0;font-size:.85rem;line-height:1.8">' +
        '判定には100字以上必要です。noteのURLを貼って「取り込む」を押すか、' +
        '無料部分をまるごとコピーして貼ってください。</p></div>';
      return;
    }
    renderLetterResult(window.analyzeLetter(text));
  }

  function setUrlStatus(kind, message) {
    el.letterUrlStatus.className = 'url-status' + (kind ? ' is-' + kind : '');
    el.letterUrlStatus.textContent = message || '';
  }

  /** URLを取り込んで、そのまま分析まで走らせる */
  function importFromUrl(url) {
    if (!url) { setUrlStatus('error', 'noteのURLを入力してください。'); return; }

    el.letterFetch.disabled = true;
    setUrlStatus('', '読み込んでいます…');

    fetchNoteText(url)
      .then(function (got) {
        el.letterInput.value = (got.title ? got.title + '\n\n' : '') + got.body;
        el.letterCount.textContent = el.letterInput.value.length.toLocaleString('ja-JP') + '字';
        setUrlStatus('ok', '✅ 取り込みました（' + got.via + '経由 / ' +
          got.body.length.toLocaleString('ja-JP') + '字）。有料noteの場合、読めるのは無料部分だけです。');
        runAnalysis();
      })
      .catch(function (err) {
        setUrlStatus('error', '❌ 取り込めませんでした：' + err.message +
          ' — 記事ページを開いて本文をコピーし、下の欄に直接貼り付けてください。');
      })
      .finally(function () { el.letterFetch.disabled = false; });
  }

  /** 検索結果からこのnoteを分析タブに送る */
  function analyzeNote(url) {
    switchTab('letter');
    el.letterUrl.value = url;
    importFromUrl(url);
  }

  function bindLetterEvents() {
    function updateCount() {
      el.letterCount.textContent = el.letterInput.value.length.toLocaleString('ja-JP') + '字';
    }

    el.letterInput.addEventListener('input', updateCount);

    el.letterFetch.addEventListener('click', function () {
      importFromUrl(el.letterUrl.value.trim());
    });

    el.letterUrl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); importFromUrl(el.letterUrl.value.trim()); }
    });

    el.letterRun.addEventListener('click', runAnalysis);

    el.letterClear.addEventListener('click', function () {
      el.letterInput.value = '';
      el.letterUrl.value = '';
      el.letterResult.innerHTML = '';
      setUrlStatus('', '');
      updateCount();
      el.letterInput.focus();
    });
  }

  function bindEvents() {
    // タブ
    el.tabs.addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (btn) switchTab(btn.dataset.tab);
    });

    // 価格帯スライダー
    el.priceMin.addEventListener('input', function () { syncPriceRange(); render(); });
    el.priceMax.addEventListener('input', function () { syncPriceRange(); render(); });

    bindLetterEvents();

    // ジャンル
    el.genreGrid.addEventListener('click', function (e) {
      const btn = e.target.closest('.genre-card');
      if (!btn) return;
      state.genreId = btn.dataset.genre;
      state.query = '';
      el.searchInput.value = '';
      state.favOnly = false;
      el.favToggle.setAttribute('aria-pressed', 'false');
      renderGenres();
      syncHash();
      load(true);
    });

    // 検索
    el.searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      state.query = el.searchInput.value.trim();
      state.favOnly = false;
      el.favToggle.setAttribute('aria-pressed', 'false');
      renderGenres();
      syncHash();
      load(true);
    });

    // 絞り込み（sort だけ再取得、他は手元で絞る）
    bindChipGroup(el.sortChips, 'sort', function () { syncHash(); load(true); });
    bindChipGroup(el.priceChips, 'price', render);
    // 期間によって取得の仕方（人気順／新着順）が変わるので取り直す
    bindChipGroup(el.periodChips, 'period', function () { load(true); });
    bindChipGroup(el.boughtChips, 'bought', render);

    // お気に入り表示切替
    el.favToggle.addEventListener('click', function () {
      state.favOnly = !state.favOnly;
      el.favToggle.setAttribute('aria-pressed', String(state.favOnly));
      // 一覧に戻るときは、すでに取得済みならそのまま描き直すだけ
      if (!state.favOnly && state.items.length) render();
      else load(!state.favOnly);
    });

    // カード内のボタン（カードは差し替わるのでイベント委譲）
    el.cardGrid.addEventListener('click', function (e) {
      const analyzeBtn = e.target.closest('.analyze-btn');
      if (analyzeBtn) { analyzeNote(analyzeBtn.dataset.analyze); return; }

      const btn = e.target.closest('.fav-btn');
      if (!btn) return;
      const id = btn.dataset.fav;
      const source = state.favOnly
        ? Object.keys(favs).map(function (k) { return favs[k]; })
        : state.items;
      const note = source.filter(function (n) { return n.id === id; })[0];

      if (favs[id]) delete favs[id];
      else if (note) favs[id] = note;

      saveFavs();
      render();
    });

    // もっと見る
    el.moreBtn.addEventListener('click', function () {
      state.page += 1;
      load(false);
    });

    // 設定モーダル
    el.settingsBtn.addEventListener('click', function () {
      el.proxyInput.value = settings.proxy;
      el.demoCheck.checked = settings.demo;
      el.diagOut.hidden = true;
      el.diagOut.textContent = '';
      el.probeOut.hidden = true;
      el.probeOut.textContent = '';
      el.modal.hidden = false;
    });

    el.diagBtn.addEventListener('click', runDiagnostics);
    el.probeBtn.addEventListener('click', runNoteProbe);

    el.modal.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) el.modal.hidden = true;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.modal.hidden) el.modal.hidden = true;
    });

    el.saveBtn.addEventListener('click', function () {
      settings.proxy = el.proxyInput.value.trim();
      settings.demo = el.demoCheck.checked;
      localStorage.setItem(STORAGE.proxy, settings.proxy);
      localStorage.setItem(STORAGE.demo, settings.demo ? '1' : '0');
      workingProxy = undefined;
      el.modal.hidden = true;
      load(true);
    });
  }

  /* ---------- 起動 ---------- */

  readHash();
  renderGenres();
  syncPriceRange();
  bindEvents();
  el.favCount.textContent = String(Object.keys(favs).length);
  load(true);
})();
