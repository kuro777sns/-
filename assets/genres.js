/**
 * ジャンル定義
 * queries: note の検索APIに投げるキーワード
 *   複数書くと、それぞれの検索結果をまとめて重複を除いて表示する。
 *   増やすほど件数は増えるが、そのぶん通信も増える。
 */
window.GENRES = [
  { id: 'money',    emoji: '💰', name: 'お金・投資',
    queries: ['投資', '新NISA', '資産運用', 'お金', '家計'] },
  { id: 'sidejob',  emoji: '🚀', name: '副業・稼ぐ',
    queries: ['副業', '在宅ワーク', '物販', 'せどり', '個人で稼ぐ'] },
  { id: 'ai',       emoji: '🤖', name: 'AI・ChatGPT',
    queries: ['ChatGPT', 'AI活用', '生成AI', 'プロンプト', 'Claude'] },
  { id: 'sns',      emoji: '📱', name: 'SNS運用',
    queries: ['SNS運用', 'Threads', 'X運用', 'インスタ', 'フォロワー'] },
  { id: 'writing',  emoji: '✍️', name: 'ライティング',
    queries: ['ライティング', '文章術', 'セールスライティング', 'コピーライティング', 'note運用'] },
  { id: 'love',     emoji: '💕', name: '恋愛・婚活',
    queries: ['恋愛', '婚活', '復縁', '男性心理', '恋愛心理'] },
  { id: 'beauty',   emoji: '💄', name: '美容・ダイエット',
    queries: ['美容', 'ダイエット', 'スキンケア', '垢抜け', '骨格'] },
  { id: 'health',   emoji: '🧘', name: 'メンタル・健康',
    queries: ['メンタル', '自己肯定感', 'HSP', '睡眠', '不安'] },
  { id: 'kosodate', emoji: '🍼', name: '子育て',
    queries: ['子育て', '育児', '中学受験', '発達障害', 'ワンオペ'] },
  { id: 'career',   emoji: '🏢', name: '仕事・キャリア',
    queries: ['転職', 'キャリア', '職務経歴書', '面接', '働き方'] },
  { id: 'study',    emoji: '📚', name: '勉強・資格',
    queries: ['勉強法', '資格', '英語学習', '簿記', '独学'] },
  { id: 'design',   emoji: '🎨', name: 'デザイン',
    queries: ['デザイン', 'イラスト', 'Canva', '配色', 'バナー'] },
  { id: 'code',     emoji: '💻', name: 'プログラミング',
    queries: ['プログラミング', 'エンジニア', '個人開発', 'Python', 'Web制作'] },
  { id: 'cook',     emoji: '🍳', name: '料理・レシピ',
    queries: ['レシピ', '料理', '作り置き', '時短ごはん', 'お弁当'] },
  { id: 'travel',   emoji: '✈️', name: '旅行・おでかけ',
    queries: ['旅行', 'おでかけ', '一人旅', '旅行記', '海外旅行'] },
  { id: 'essay',    emoji: '🌷', name: 'エッセイ・日記',
    queries: ['エッセイ', '日記', '自分語り', '人生', '手記'] },
];
