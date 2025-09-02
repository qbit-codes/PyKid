// src/lib/praise.ts
export type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

export const PRAISE_BANK = {
  success: [
    'Süpersin, çözdün! 🚀',
    'Harika iş! 🌟',
    'Bravo, tam isabet! ✅',
    'Çok iyi yakaladın! 👏'
  ],
  error: [
    'Sakin ol, birlikte çözeriz. 💪',
    'Sorun normal—adım adım açalım. 🧩',
    'Harika deneme, küçük bir düzeltmeyle olur. 🔧',
    'İyi yaklaştın; minik bir ayar yeter. ✨'
  ],
  frustrated: [
    'Zorlanman çok normal, buradayım. 🤝',
    'Derin nefes—birlikte aşarız. 🧭',
    'Sabırla gidiyoruz, başaracağız. 🌱'
  ],
  question: [
    'Merakın şahane—sorular öğrenmenin yakıtı! 🔍',
    'Güzel soru, birlikte düşünelim. 🧠'
  ],
  start: [
    'Hazırsan başlıyoruz! 🚀',
    'Harika bir başlangıç yapalım! 🎯'
  ],
  neutral: [
    'Harika ilerliyorsun! 👏',
    'Çok iyi gidiyor, aynen devam! 🌟',
    'Adım adım ve doğru yoldasın! 🧭'
  ],
  topic: {
    degisken: [
      'Değişken mantığını güzel kavradın! 🧠',
      'Değişkenlerle oynamayı iyi götürüyorsun! 🔧'
    ],
    dongu: [
      'Döngü fikrini güzel kurdun! ♻️',
      'Döngülerle ritmi yakaladın! 🔁'
    ],
    liste: [
      'Listelerle çalışmayı iyi ilerletiyorsun! 📚'
    ],
    fonksiyon: [
      'Fonksiyon tasarımın gayet iyi! 🧩'
    ]
  }
} as const;

function findLast<T>(arr: T[], pred: (x: T) => boolean) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i]!)) return arr[i];
  return undefined;
}

function recentlyPraised(messages: Msg[], lookback = 4): boolean {
  const recent = messages.slice(-lookback).filter(m => m.role === 'assistant');
  const s = recent.map(m => m.content).join(' ');
  // Emojiler: 👏🌟🚀💪🔍✅✨🤝🧭♻️🔁🧠🧩📚
  return /[👏🌟🚀💪🔍✅✨🤝🧭♻️🔁🧠🧩📚]/u.test(s);
}

function pick(arr: readonly string[], recentSet: Set<string>): string {
  const pool = arr.filter(s => !recentSet.has(s));
  const use = pool.length ? pool : arr;
  return use[Math.floor(Math.random() * use.length)];
}

// Ana seçim: bağlama göre övgü + tekrar engeli
export function pickPraiseFor(
  messages: Msg[],
  opt: { rate?: number; lookback?: number; cooldownTurns?: number } = {}
): string | null {
  const rate = opt.rate ?? 0.6;          // %60 olasılıkla övgü
  const lookback = opt.lookback ?? 6;    // son 6 mesajda tekrar kontrolü
  const cooldown = opt.cooldownTurns ?? 1;

  if (Math.random() >= rate) return null;

  // Son asistan iletisinde övgü varsa (cooldown) atla
  const recentAssist = messages.filter(m => m.role === 'assistant').slice(-cooldown);
  if (recentAssist.some(m => /[👏🌟🚀💪🔍✅✨🤝🧭]/u.test(m.content))) return null;

  const lastUser = findLast(messages, m => m.role === 'user')?.content?.toLowerCase() || '';
  const recentSet = new Set<string>();
  messages.slice(-lookback).forEach(m => {
    if (m.role === 'assistant') {
      const firstLine = m.content.split('\n')[0].trim();
      if (firstLine.length <= 90) recentSet.add(firstLine);
    }
  });

  const hasSuccess = /(çalıştı|oldu|başardım|geçti|teşekkür|çözdüm|süper|tamam)/i.test(lastUser);
  const hasError   = /(error|exception|traceback|hata|olmuyor|çalışmadı|patladı)/i.test(lastUser);
  const frustrated = /(aptal|sinir|delir|yeter|bıktım|of|off)/i.test(lastUser);
  const asking     = /(\?|\bneden\b|\bniye\b|\bnasıl\b)/i.test(lastUser);

  // konu sezgisi
  let topic: keyof typeof PRAISE_BANK.topic | null = null;
  if (/(değişken|variable)/i.test(lastUser)) topic = 'degisken';
  else if (/(for|while|döngü|loop)/i.test(lastUser)) topic = 'dongu';
  else if (/(liste|list|array)/i.test(lastUser)) topic = 'liste';
  else if (/(fonksiyon|function|def)/i.test(lastUser)) topic = 'fonksiyon';

  if (hasSuccess) return pick(PRAISE_BANK.success, recentSet);
  if (hasError)   return pick(PRAISE_BANK.error, recentSet);
  if (frustrated) return pick(PRAISE_BANK.frustrated, recentSet);
  if (topic)      return pick(PRAISE_BANK.topic[topic], recentSet);
  if (asking)     return pick(PRAISE_BANK.question, recentSet);
  return pick(PRAISE_BANK.neutral, recentSet);
}
