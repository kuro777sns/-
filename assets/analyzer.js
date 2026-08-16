/* ============================================================
   セールスレター分析
   貼り付けたテキストを構成要素ごとにチェックして、
   足りていないパートと改善案を出す。
   （売上予測ではなく、あくまで構成の抜けを見つけるための道具）
   ============================================================ */
(function () {
  'use strict';

  /**
   * 売れるレターに入っている要素。
   * weight = 総合点への配点（合計100）
   */
  const RULES = [
    {
      key: 'hook',
      emoji: '🎣',
      name: 'フック（冒頭の引き）',
      weight: 12,
      where: 'head',
      patterns: [
        /実は/, /ぶっちゃけ/, /正直/, /もし.{0,12}なら/, /知って(い)?ますか/,
        /あなたは/, /^.{0,40}[？?]/m, /衝撃/, /断言/, /たった\d/, /\d+日で/,
      ],
      hint: '1〜3行目で「え、なに？」と思わせる一文を置く。断定・数字・逆説のどれかを入れると強い。',
    },
    {
      key: 'empathy',
      emoji: '🫂',
      name: '共感・問題提起',
      weight: 12,
      patterns: [
        /悩(ん|み)/, /つら(い|かった)/, /しんど(い|かった)/, /不安/, /焦/,
        /わからな(い|かった)/, /できな(い|かった)/, /うまくいかな/, /続かな(い|かった)/,
        /自信がな/, /疲れ/,
      ],
      hint: '読者が「それ私だ」と思う状態を具体的に描写する。抽象語より、その日の場面を書くほうが刺さる。',
    },
    {
      key: 'story',
      emoji: '📖',
      name: 'ストーリー・実体験',
      weight: 10,
      patterns: [
        /私(は|が)/, /僕(は|が)/, /俺(は|が)/, /当時/, /あの(頃|時)/, /きっかけ/,
        /経験/, /失敗/, /どん底/, /変わ(っ|り)/,
      ],
      hint: 'ビフォー→転機→アフターの順で自分の話を入れる。信頼はスペックではなく物語で生まれる。',
    },
    {
      key: 'proof',
      emoji: '📊',
      name: '実績・証拠',
      weight: 12,
      patterns: [
        /\d[\d,]*\s*(万)?円/, /\d[\d,]*\s*(人|名)/, /\d+\s*[%％]/,
        /\d+\s*(ヶ月|か月|カ月|日|週間)で/, /実績/, /証拠/, /スクショ/, /画像の通り/,
        /達成/, /突破/,
      ],
      hint: '数字＋期間＋条件のセットで書く。「月5万」より「副業で3ヶ月目に月5万」のほうが信じられる。',
    },
    {
      key: 'voice',
      emoji: '💬',
      name: 'お客様の声・第三者評価',
      weight: 8,
      patterns: [
        /感想/, /レビュー/, /(いただ|頂)(き|い)ました/, /読者さん/, /購入者/,
        /「.{10,}」/, /DM/, /反響/,
      ],
      hint: '自分で言うより他人に言わせる。短い引用を2〜3本並べるだけで説得力が跳ねる。',
    },
    {
      key: 'benefit',
      emoji: '✨',
      name: 'ベネフィット（手に入る未来）',
      weight: 10,
      patterns: [
        /できるように/, /手に入/, /なれ(る|ます)/, /変わ(る|ります)/, /迷わなく/,
        /悩まなく/, /不要に/, /時短/, /楽になる/, /自信/,
      ],
      hint: '機能ではなく「読んだ翌日どう変わるか」を書く。動詞で終わる短い箇条書きが効く。',
    },
    {
      key: 'content',
      emoji: '📦',
      name: '中身・目次',
      weight: 10,
      patterns: [
        /目次/, /第\s*\d+\s*章/, /収録/, /ページ/, /文字/, /ステップ\s*\d/,
        /テンプレ/, /チェックリスト/, /特典/,
      ],
      hint: '章タイトルを並べて「何が書いてあるか」を見せる。隠すほど売れないので、目次は出す。',
    },
    {
      key: 'price',
      emoji: '💰',
      name: '価格の提示と理由づけ',
      weight: 8,
      patterns: [
        /¥\s*[\d,]+/, /[\d,]+\s*円/, /価格/, /値段/, /定価/, /(値上げ|値下げ)/,
        /に比べ(たら|れば)/, /コンサル/, /一回の/,
      ],
      hint: '金額だけ置かない。「セミナー1回分」など比較対象を隣に置くと高く感じにくくなる。',
    },
    {
      key: 'scarcity',
      emoji: '⏳',
      name: '限定性・緊急性',
      weight: 8,
      patterns: [
        /限定/, /先着/, /\d+\s*(名|部)(様)?(まで)?/, /締(切|め切)/, /まで(に|の)/,
        /値上げ/, /予告なく/, /終了/,
      ],
      hint: '嘘の煽りは逆効果。「◯部で値上げ」など自分が本当に守れる条件だけを書く。',
    },
    {
      key: 'guarantee',
      emoji: '🛡',
      name: 'リスク除去・保証',
      weight: 5,
      patterns: [
        /返金/, /保証/, /合わなかっ/, /向いていない人/, /おすすめしない/,
        /デメリット/, /注意/,
      ],
      hint: '「こういう人には向きません」を書くのが最強のリスク除去。誠実さが購入の言い訳になる。',
    },
    {
      key: 'cta',
      emoji: '👇',
      name: 'CTA（行動の指示）',
      weight: 3,
      patterns: [
        /今すぐ/, /下(の|記)/, /こちら/, /購入/, /ボタン/, /クリック/, /タップ/, /お進み/,
      ],
      hint: '「買ってください」ではなく「下のボタンを押して、今日の夜に1章だけ読んでください」と行動を指定する。',
    },
    {
      key: 'ps',
      emoji: '✉️',
      name: '追伸',
      weight: 2,
      where: 'tail',
      patterns: [/追伸/, /P\.?S\.?/i, /最後に/],
      hint: '追伸は本文の次に読まれる場所。ここに「一番言いたい一言」と価格をもう一度置く。',
    },
  ];

  function snippet(text, index, len) {
    const start = Math.max(0, index - 12);
    const raw = text.slice(start, Math.min(text.length, index + (len || 24)));
    return (start > 0 ? '…' : '') + raw.replace(/\s+/g, ' ').trim() + '…';
  }

  function checkRule(rule, text, head, tail) {
    const target = rule.where === 'head' ? head : rule.where === 'tail' ? tail : text;
    const offset = rule.where === 'tail' ? text.length - tail.length : 0;
    const hits = [];

    for (let i = 0; i < rule.patterns.length; i++) {
      const m = target.match(rule.patterns[i]);
      if (m && m.index != null) {
        hits.push(snippet(text, m.index + offset, m[0].length + 20));
        if (hits.length >= 2) break;
      }
    }
    return hits;
  }

  /** レターの型をざっくり判定する */
  function detectType(items, stats) {
    const has = function (k) {
      return items.filter(function (i) { return i.key === k; })[0].found;
    };

    if (has('story') && has('empathy') && stats.firstPersonRate > 0.004) return 'ストーリー訴求型';
    if (has('proof') && stats.numbers >= 12) return '実績訴求型';
    if (has('content') && has('benefit')) return 'ノウハウ提示型';
    if (has('empathy') && !has('story')) return '共感訴求型';
    return '情報整理型';
  }

  window.analyzeLetter = function (rawText) {
    const text = String(rawText || '').replace(/\r\n/g, '\n');
    const head = text.slice(0, 400);
    const tail = text.slice(Math.max(0, text.length - 600));

    const lines = text.split('\n');
    const paragraphs = text.split(/\n\s*\n/).filter(function (p) { return p.trim(); });
    const headings = lines.filter(function (l) {
      return /^\s*(#{1,4}\s|[■◆●▼【\[])/.test(l) || (/^【.+】$/.test(l.trim()));
    });

    const numbers = (text.match(/\d[\d,]*/g) || []).length;
    const questions = (text.match(/[？?]/g) || []).length;
    const firstPerson = (text.match(/(私|僕|俺)/g) || []).length;

    // 価格が本文のどのあたりで出てくるか（％）
    const priceMatch = text.match(/(¥\s*[\d,]{3,}|[\d,]{3,}\s*円)/);
    const pricePos = priceMatch && priceMatch.index != null && text.length
      ? Math.round((priceMatch.index / text.length) * 100)
      : null;

    const stats = {
      chars: text.length,
      lines: lines.length,
      paragraphs: paragraphs.length,
      headings: headings.length,
      numbers: numbers,
      questions: questions,
      avgParagraph: paragraphs.length ? Math.round(text.length / paragraphs.length) : 0,
      pricePos: pricePos,
      firstPersonRate: text.length ? firstPerson / text.length : 0,
    };

    const items = RULES.map(function (rule) {
      const hits = checkRule(rule, text, head, tail);
      return {
        key: rule.key,
        emoji: rule.emoji,
        name: rule.name,
        weight: rule.weight,
        hint: rule.hint,
        found: hits.length > 0,
        hits: hits,
      };
    });

    const score = items.reduce(function (sum, i) { return sum + (i.found ? i.weight : 0); }, 0);

    // 構成以外の気になる点
    const notes = [];
    if (stats.chars < 1500) {
      notes.push('全体が' + stats.chars + '字と短めです。売れているレターは3,000〜10,000字が多く、情報量そのものが信頼になります。');
    }
    if (stats.avgParagraph > 160) {
      notes.push('1段落が平均' + stats.avgParagraph + '字と長めです。スマホでは3行ごとに空行を入れると読了率が上がります。');
    }
    if (stats.headings < 3 && stats.chars > 2000) {
      notes.push('見出しが' + stats.headings + '個しかありません。長文は【】や■で区切ると、流し読みでも中身が伝わります。');
    }
    if (stats.pricePos !== null && stats.pricePos < 25) {
      notes.push('価格が全体の' + stats.pricePos + '%地点と早めに出ています。価値を積み上げる前に金額を見せると高く感じられがちです。');
    }
    if (stats.questions === 0) {
      notes.push('問いかけ（？）が1つもありません。1つ入れるだけで「自分ごと」になり、読み進めてもらいやすくなります。');
    }

    const missing = items.filter(function (i) { return !i.found; })
      .sort(function (a, b) { return b.weight - a.weight; });

    return {
      stats: stats,
      items: items,
      score: score,
      grade: score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D',
      type: detectType(items, stats),
      missing: missing,
      notes: notes,
    };
  };
})();
