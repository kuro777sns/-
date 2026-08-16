/**
 * ジャンル定義
 *   group   : 画面上のまとまり（同じ group が1ブロックになる）
 *   queries : note の検索APIに投げるキーワード
 *             複数書くと、それぞれの結果をまとめて重複を除いて表示する
 */
window.GENRE_GROUPS = [
  { id: 'love',   emoji: '💕', name: '恋愛',
    queries: ['恋愛', '復縁', '婚活', '男性心理', '夫婦', '不倫',
              '元カレ', '片思い', '回避型'] },
  { id: 'uranai', emoji: '🔮', name: '占い・スピ',
    queries: ['占い', 'タロット', '占星術', 'スピリチュアル', '引き寄せの法則', '開運',
              '潜在意識', 'ツインレイ', '金運'] },
  { id: 'biz',    emoji: '💼', name: 'ビジネス・お金',
    queries: ['副業', '投資', 'SNS運用', 'ライティング', 'ChatGPT', '転職',
              'note販売', 'マーケティング', '起業'] },
  { id: 'life',   emoji: '🌿', name: 'くらし',
    queries: ['メンタル', '美容', 'ダイエット', '子育て', '勉強法', 'エッセイ',
              '自己肯定感', '健康', '働き方'] },
];

window.GENRES = [
  /* ---- 恋愛 ---- */
  { id: 'love',       group: 'love', emoji: '💕', name: '恋愛全般',
    queries: ['恋愛', '恋愛相談', '片思い', '両思い', '恋愛note'] },
  { id: 'fukuen',     group: 'love', emoji: '💔', name: '復縁・失恋',
    queries: ['復縁', '失恋', '別れた', '元カレ', '元カノ'] },
  { id: 'konkatsu',   group: 'love', emoji: '💍', name: '婚活・結婚',
    queries: ['婚活', 'マッチングアプリ', 'プロポーズ', '結婚したい', 'お見合い'] },
  { id: 'danshinri',  group: 'love', emoji: '🧠', name: '男性心理',
    queries: ['男性心理', '男心', '本命', '男の本音', '追わせる'] },
  { id: 'joshinri',   group: 'love', emoji: '💭', name: '女性心理',
    queries: ['女性心理', '愛される女', 'モテる女', '女の本音', '手放し'] },
  { id: 'kaihi',      group: 'love', emoji: '🫥', name: '回避型・愛着',
    queries: ['回避型', '愛着スタイル', '不安型', '既読スルー', '距離を置く'] },
  { id: 'fukuzatsu',  group: 'love', emoji: '🥀', name: '不倫・複雑恋愛',
    queries: ['不倫', '浮気', '既婚者', '略奪愛', '本命'] },
  { id: 'fufu',       group: 'love', emoji: '👫', name: '夫婦・パートナー',
    queries: ['夫婦', 'パートナーシップ', '夫婦関係', '離婚', 'セックスレス'] },

  /* ---- 占い・スピリチュアル ---- */
  { id: 'uranai',     group: 'uranai', emoji: '🔮', name: '占い全般',
    queries: ['占い', '鑑定', '相性占い', '恋愛占い', '当たる占い'] },
  { id: 'tarot',      group: 'uranai', emoji: '🃏', name: 'タロット',
    queries: ['タロット', 'タロットカード', 'オラクルカード', 'カード占い', 'タロット占い'] },
  { id: 'astrology',  group: 'uranai', emoji: '⭐', name: '占星術',
    queries: ['占星術', 'ホロスコープ', '西洋占星術', '星読み', 'トランジット'] },
  { id: 'toyo',       group: 'uranai', emoji: '☯️', name: '東洋占術',
    queries: ['四柱推命', '算命学', '九星気学', '手相', '運勢'] },
  { id: 'suumei',     group: 'uranai', emoji: '🔢', name: '数秘・姓名判断',
    queries: ['数秘術', '姓名判断', '名前', '生年月日', '性格診断'] },
  { id: 'spiritual',  group: 'uranai', emoji: '✨', name: 'スピリチュアル',
    queries: ['スピリチュアル', 'ヒーリング', 'チャネリング', 'ツインレイ', '前世'] },
  { id: 'hikiyose',   group: 'uranai', emoji: '🌈', name: '引き寄せ',
    queries: ['引き寄せの法則', '潜在意識', 'アファメーション', '願望実現', '自愛'] },
  { id: 'kaiun',      group: 'uranai', emoji: '🍀', name: '開運・金運',
    queries: ['開運', '金運', '風水', '新月', '満月'] },

  /* ---- ビジネス・お金 ---- */
  { id: 'sidejob',  group: 'biz', emoji: '🚀', name: '副業・稼ぐ',
    queries: ['副業', '在宅ワーク', '物販', 'せどり', 'ネット副業'] },
  { id: 'money',    group: 'biz', emoji: '💰', name: 'お金・投資',
    queries: ['投資', '新NISA', '資産運用', 'お金', '家計'] },
  { id: 'sns',      group: 'biz', emoji: '📱', name: 'SNS運用',
    queries: ['SNS運用', 'Threads', 'X運用', 'インスタ', 'フォロワー'] },
  { id: 'writing',  group: 'biz', emoji: '✍️', name: 'ライティング',
    queries: ['ライティング', '文章術', 'セールスライティング', 'コピーライティング', 'note運用'] },
  { id: 'ai',       group: 'biz', emoji: '🤖', name: 'AI・ChatGPT',
    queries: ['ChatGPT', 'AI活用', '生成AI', 'プロンプト', 'Claude'] },
  { id: 'career',   group: 'biz', emoji: '🏢', name: '仕事・キャリア',
    queries: ['転職', 'キャリア', '職務経歴書', '面接', '働き方'] },
  { id: 'design',   group: 'biz', emoji: '🎨', name: 'デザイン',
    queries: ['デザイン', 'イラスト', 'Canva', 'ロゴ', 'バナー'] },
  { id: 'code',     group: 'biz', emoji: '💻', name: 'プログラミング',
    queries: ['プログラミング', 'エンジニア', '個人開発', 'Python', 'Web制作'] },

  /* ---- くらし・その他 ---- */
  { id: 'health',   group: 'life', emoji: '🧘', name: 'メンタル',
    queries: ['メンタル', '自己肯定感', 'HSP', '睡眠', '不安'] },
  { id: 'beauty',   group: 'life', emoji: '💄', name: '美容・ダイエット',
    queries: ['美容', 'ダイエット', 'スキンケア', '垢抜け', '骨格'] },
  { id: 'kosodate', group: 'life', emoji: '🍼', name: '子育て',
    queries: ['子育て', '育児', '中学受験', '発達障害', 'ワンオペ'] },
  { id: 'study',    group: 'life', emoji: '📚', name: '勉強・資格',
    queries: ['勉強法', '資格', '英語学習', '簿記', '独学'] },
  { id: 'essay',    group: 'life', emoji: '🌷', name: 'エッセイ',
    queries: ['エッセイ', '日記', '自分語り', '人生', '体験談'] },
  { id: 'cook',     group: 'life', emoji: '🍳', name: '料理',
    queries: ['レシピ', '料理', '作り置き', '時短ごはん', 'お弁当'] },
  { id: 'travel',   group: 'life', emoji: '✈️', name: '旅行',
    queries: ['旅行', 'おでかけ', '一人旅', '旅行記', '海外旅行'] },
];
