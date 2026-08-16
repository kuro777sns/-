/**
 * ジャンル定義
 * queries: note の検索APIに投げるキーワード（複数指定すると結果をマージする）
 */
window.GENRES = [
  { id: 'money',    emoji: '💰', name: 'お金・投資',     queries: ['投資', '新NISA'] },
  { id: 'sidejob',  emoji: '🚀', name: '副業・稼ぐ',     queries: ['副業', '在宅ワーク'] },
  { id: 'ai',       emoji: '🤖', name: 'AI・ChatGPT',    queries: ['ChatGPT', 'AI活用'] },
  { id: 'sns',      emoji: '📱', name: 'SNS運用',        queries: ['SNS運用', 'Threads'] },
  { id: 'writing',  emoji: '✍️', name: 'ライティング',   queries: ['ライティング', '文章術'] },
  { id: 'love',     emoji: '💕', name: '恋愛・婚活',     queries: ['恋愛', '婚活'] },
  { id: 'beauty',   emoji: '💄', name: '美容・ダイエット', queries: ['美容', 'ダイエット'] },
  { id: 'health',   emoji: '🧘', name: 'メンタル・健康', queries: ['メンタル', '自己肯定感'] },
  { id: 'kosodate', emoji: '🍼', name: '子育て',         queries: ['子育て', '育児'] },
  { id: 'career',   emoji: '🏢', name: '仕事・キャリア', queries: ['転職', 'キャリア'] },
  { id: 'study',    emoji: '📚', name: '勉強・資格',     queries: ['勉強法', '資格'] },
  { id: 'design',   emoji: '🎨', name: 'デザイン',       queries: ['デザイン', 'イラスト'] },
  { id: 'code',     emoji: '💻', name: 'プログラミング', queries: ['プログラミング', 'エンジニア'] },
  { id: 'cook',     emoji: '🍳', name: '料理・レシピ',   queries: ['レシピ', '料理'] },
  { id: 'travel',   emoji: '✈️', name: '旅行・おでかけ', queries: ['旅行', 'おでかけ'] },
  { id: 'essay',    emoji: '🌷', name: 'エッセイ・日記', queries: ['エッセイ', '日記'] },
];
