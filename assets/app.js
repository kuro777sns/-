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
  const PAGE_SIZE = 12;
  const FETCH_TIMEOUT = 12000;

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
    queries: ['副業', 'ChatGPT', 'エッセイ'],
  };

  const GENRES = [POPULAR_GENRE].concat(window.GENRES || []);

  /* ---------- 状態 ---------- */

  const state = {
    genreId: 'popular',
    query: '',        // キーワード検索（入力があればジャンルより優先）
    sort: 'selling',
    price: 'all',
    period: 'all',
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
    favToggle:   document.getElementById('favToggle'),
    favCount:    document.getElementById('favCount'),
    settingsBtn: document.getElementById('settingsBtn'),
    modal:       document.getElementById('settingsModal'),
    proxyInput:  document.getElementById('proxyInput'),
    demoCheck:   document.getElementById('demoCheck'),
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

  function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    return fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error('JSONとして読めませんでした');
        }
      })
      .finally(function () { clearTimeout(timer); });
  }

  /**
   * 中継候補を順に試す。成功した中継は workingProxy に記憶する。
   */
  function fetchViaAnyRoute(targetUrl) {
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
        return fetchJson(applyProxy(route, targetUrl)).then(function (json) {
          workingProxy = route;
          return json;
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
      price: Number(n.price || 0),
      publishAt: n.publish_at || n.publishAt || n.created_at || '',
      thumb: n.eyecatch || (Array.isArray(n.pictures) && n.pictures[0] && n.pictures[0].url) || '',
      isDemo: false,
    };
  }

  /**
   * 現在の状態にあわせて1ページ分を取得する。
   */
  function fetchPage(page) {
    const genre = genreById(state.genreId);
    const queries = state.query ? [state.query] : genre.queries;
    const apiSort = state.sort === 'new' ? 'new' : 'popular';
    const start = page * PAGE_SIZE;

    const jobs = queries.map(function (q) {
      return fetchViaAnyRoute(buildUrl(q, start, apiSort))
        .then(function (json) { return extractNotes(json); })
        .catch(function () { return null; }); // 1本失敗しても他が生きていれば表示する
    });

    return Promise.all(jobs).then(function (results) {
      if (results.every(function (r) { return r === null; })) {
        throw new Error('note.com からデータを取得できませんでした');
      }
      const merged = [];
      results.forEach(function (list) {
        (list || []).forEach(function (raw) { merged.push(normalize(raw, state.genreId)); });
      });
      return merged;
    });
  }

  /* ============================================================
     並び替え・絞り込み・スコア
     ============================================================ */

  /** 売れ筋スコアの元になる値（有料＝価格×スキ、無料＝スキのみ） */
  function rawScore(note) {
    return note.price > 0 ? note.price * note.likes : note.likes;
  }

  function applyFilters(items) {
    const now = Date.now();
    const periodDays = state.period === 'all' ? null : Number(state.period);

    return items.filter(function (n) {
      if (state.price === 'paid' && n.price <= 0) return false;
      if (state.price === 'free' && n.price > 0) return false;

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
    const scoreLabel = paid ? '売れ筋スコア' : '人気度';

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
          (isHot ? '<span class="badge hot">🔥 売れ筋</span>' : '') +
        '</div>' +
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

    const list = applySort(applyFilters(dedupe(source)));

    el.resultCount.textContent = list.length ? list.length + '件' : '';

    if (!list.length) {
      renderEmpty(
        state.favOnly ? 'お気に入りはまだありません' : '条件に合うnoteが見つかりませんでした',
        state.favOnly ? 'カードの☆を押すとここに貯まります' : '絞り込みをゆるめるか、別のジャンルを試してみてください'
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
      '<p>実在の記事ではありません。設定（⚙️）から中継URLを入れると本物のnoteを表示できます。</p>');
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

        state.items = dedupe(state.items.concat(fetched));
        state.hasMore = fetched.length >= PAGE_SIZE;

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
      if (!btn || !container.contains(btn)) return;
      Array.prototype.forEach.call(container.children, function (c) {
        c.classList.toggle('is-active', c === btn);
      });
      state[key] = btn.dataset[key];
      onChange();
    });
  }

  function bindEvents() {
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
    bindChipGroup(el.periodChips, 'period', render);

    // お気に入り表示切替
    el.favToggle.addEventListener('click', function () {
      state.favOnly = !state.favOnly;
      el.favToggle.setAttribute('aria-pressed', String(state.favOnly));
      // 一覧に戻るときは、すでに取得済みならそのまま描き直すだけ
      if (!state.favOnly && state.items.length) render();
      else load(!state.favOnly);
    });

    // お気に入り登録（カードは差し替わるのでイベント委譲）
    el.cardGrid.addEventListener('click', function (e) {
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
      el.modal.hidden = false;
    });

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
  bindEvents();
  el.favCount.textContent = String(Object.keys(favs).length);
  load(true);
})();
