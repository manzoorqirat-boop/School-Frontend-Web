// English → Hindi transliteration for the Students form's auto-Hindi fields.
// Ported verbatim from the web app's phoneticToHindi (translit.ts). The web
// version tries a backend proxy first (Google Input Tools) then falls back to
// this offline map; the .NET backend has no transliterate endpoint, so mobile
// uses the offline map directly — it works with no network and covers the
// common Indian-name phonetic patterns.

const cache = new Map<string, string>();

export function translitEnToHi(text: string): string {
  if (!text) return '';
  const key = text.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const hi = phoneticToHindi(text);
  if (hi && /[\u0900-\u097F]/.test(hi)) { cache.set(key, hi); return hi; }
  return text;
}

export function phoneticToHindi(str: string): string {
  const VOWELS_STANDALONE: Record<string, string> = {
    aa: 'आ', ee: 'ई', ii: 'ई', oo: 'ऊ', uu: 'ऊ',
    ai: 'ऐ', au: 'औ', ou: 'औ', ao: 'ऑ',
    a: 'अ', e: 'ए', i: 'इ', o: 'ओ', u: 'उ',
  };
  const VOWEL_MATRAS: Record<string, string> = {
    aa: 'ा', ee: 'ी', ii: 'ी', oo: 'ू', uu: 'ू',
    ai: 'ै', au: 'ौ', ou: 'ौ', ao: 'ॉ',
    a: '', e: 'े', i: 'ि', o: 'ो', u: 'ु',
  };
  const CONSONANTS: Record<string, string> = {
    shri: 'श्री', shru: 'श्रु',
    ksh: 'क्ष', gya: 'ज्ञ', tra: 'त्र', shr: 'श्र',
    sh: 'श', kh: 'ख', gh: 'घ', ch: 'च', jh: 'झ',
    th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', nh: 'ण', ng: 'ङ',
    k: 'क', g: 'ग', c: 'क', j: 'ज', t: 'त', d: 'द',
    n: 'न', p: 'प', b: 'ब', m: 'म', y: 'य', r: 'र',
    l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', f: 'फ',
    z: 'ज', q: 'क', x: 'क्स',
  };
  const VOWEL_KEYS = Object.keys(VOWELS_STANDALONE).sort((a, b) => b.length - a.length);
  const CONS_KEYS = Object.keys(CONSONANTS).sort((a, b) => b.length - a.length);
  const CONS_COMPLETE = new Set(['shri', 'shru', 'gya', 'tra', 'ksh', 'shr']);
  const HALANT = '\u094D';

  function matchPrefix(s: string, i: number, keys: string[]): string | null {
    for (const k of keys) if (s.startsWith(k, i)) return k;
    return null;
  }

  let result = '';
  let i = 0;
  let lastWasConsonant = false;
  const lower = str.toLowerCase();

  while (i < lower.length) {
    const v = matchPrefix(lower, i, VOWEL_KEYS);
    if (v) {
      result += lastWasConsonant ? VOWEL_MATRAS[v] : VOWELS_STANDALONE[v];
      i += v.length;
      lastWasConsonant = false;
      continue;
    }
    const c = matchPrefix(lower, i, CONS_KEYS);
    if (c) {
      if (lastWasConsonant) result += HALANT;
      result += CONSONANTS[c];
      i += c.length;
      lastWasConsonant = !CONS_COMPLETE.has(c);
      continue;
    }
    result += lower[i];
    i++;
    lastWasConsonant = false;
  }
  return result || str;
}
