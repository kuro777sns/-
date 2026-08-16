/**
 * デモデータ（サンプル）
 * 実在の記事ではありません。通信できないときの表示確認用です。
 * 画面上でも「デモデータ表示中」と明示されます。
 */
(function () {
  const raw = [
    ['money',    '新NISAのつみたて枠、最初の1年でやったこと全部', 980,  412, 12],
    ['money',    '家計簿が続かない人のためのゆるいお金管理',        0,    268, 40],
    ['money',    '30代からの資産形成ロードマップ',                 1480, 190, 75],
    ['sidejob',  '会社員のまま月5万円をつくるまでの記録',           1200, 534, 20],
    ['sidejob',  '副業のはじめかた：時間がない人向けの組み立て方',   500,  321, 8],
    ['sidejob',  'スキル0から受注までにやった営業のぜんぶ',         2000, 205, 130],
    ['ai',       'ChatGPTに毎日やらせている仕事の自動化テンプレ',    780,  689, 15],
    ['ai',       '生成AIで資料作成が3分の1になった話',              0,    455, 33],
    ['ai',       'AIライティングの型：読まれる記事の設計図',        1980, 231, 60],
    ['sns',      'フォロワー1000人までにやめた3つのこと',           0,    712, 10],
    ['sns',      '伸びる投稿のフック集100',                        1500, 388, 48],
    ['writing',  '文章がうまいと言われる人の共通点',               0,    521, 25],
    ['writing',  'セールスレターの型と書き出し例30',               2980, 176, 90],
    ['love',     '一緒にいて疲れない人の条件',                     0,    634, 18],
    ['love',     '婚活で疲れた日に読むノート',                     300,  259, 55],
    ['beauty',   '肌がゆらぐ季節のスキンケアの見直し方',            0,    342, 22],
    ['beauty',   '半年で無理なく落とした食事の記録',               680,  287, 70],
    ['health',   '自己肯定感が低い日のセルフケア手帳',             480,  398, 28],
    ['kosodate', 'イヤイヤ期を乗り切った声かけリスト',             0,    445, 35],
    ['career',   '30代の転職、面接で必ず聞かれた10の質問',          0,    512, 16],
    ['career',   '職務経歴書の書き方テンプレート',                 1280, 224, 100],
    ['study',    '社会人の勉強時間のつくり方',                     0,    366, 45],
    ['design',   'ノンデザイナーのための配色の考え方',             0,    478, 27],
    ['design',   'Canvaで作るバナー20パターン',                    900,  198, 62],
    ['code',     '個人開発を完走するためのやることリスト',          0,    301, 38],
    ['cook',     '平日夜の15分レシピまとめ',                       0,    412, 14],
    ['travel',   'ひとり旅のもちものリスト完全版',                 400,  256, 52],
    ['essay',    '何者にもなれなかった日のこと',                   0,    589, 30],
  ];

  const authors = ['さくら', 'ゆの', 'みなと', 'こまち', 'あおい', 'ひなた', 'つむぎ', 'りん'];
  const DAY = 86400000;
  const BASE = Date.now();   // 「◯日前」が常に自然に見えるよう、今日を基準にする

  window.SAMPLE_NOTES = raw.map(function (r, i) {
    const [genreId, title, price, likes, daysAgo] = r;
    const author = authors[i % authors.length] + '（サンプル）';
    return {
      id: 'demo-' + i,
      key: 'demo-' + i,
      genreId: genreId,
      title: title,
      // デモなので個別記事ではなく note の検索結果へ飛ばす
      url: 'https://note.com/search?context=note&q=' + encodeURIComponent(title),
      authorName: author,
      authorUrl: 'https://note.com/',
      authorIcon: '',
      likes: likes,
      comments: i % 3 === 0 ? 0 : Math.round(likes / (30 + (i % 7) * 6)),
      price: price,
      // 有料noteだけ購入数を持たせている（デモ用のサンプル値）
      buyers: price > 0 ? Math.max(1, Math.round(likes / (6 + (i % 5)))) : null,
      publishAt: new Date(BASE - daysAgo * DAY).toISOString(),
      thumb: '',
      isDemo: true,
    };
  });
})();
