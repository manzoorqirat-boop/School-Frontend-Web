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
    ngh: '\u0902\u0939',                                    // Singh -> सिंह, not सिङ्ह
    th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', nh: 'ण', ng: 'ङ',
    k: 'क', g: 'ग', c: 'क', j: 'ज', t: 'त', d: 'द',
    n: 'न', p: 'प', b: 'ब', m: 'म', y: 'य', r: 'र',
    l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', f: 'फ',
    z: 'ज', q: 'क', x: 'क्स',
  };
  const VOWEL_KEYS = Object.keys(VOWELS_STANDALONE).sort((a, b) => b.length - a.length);
  const CONS_KEYS = Object.keys(CONSONANTS).sort((a, b) => b.length - a.length);
  // "Complete" means the cluster already carries its own vowel, so a vowel
  // after it starts a NEW syllable. shri/shru end in a matra and gya/tra
  // carry the inherent 'a'. ksh and shr do NOT — they end on a bare
  // consonant, and marking them complete turned "Mishra" into मिश्रअ
  // (a stray standalone अ) instead of मिश्रा.
  const CONS_COMPLETE = new Set(['shri', 'shru', 'gya', 'tra']);
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
      if (lastWasConsonant) {
        // A TRAILING 'a' is not the inherent vowel — it has to be written as
        // the matra ा. Without this the word ends on a bare consonant, so
        // "Sharma" came out शर्म ("sharm"). Every -a name was wrong the same
        // way: Verma, Gupta, Meena, Priya, Anita, Sinha...
        const isFinalA = v === 'a' && i + v.length === lower.length;
        result += isFinalA ? '\u093E' : VOWEL_MATRAS[v];
      } else {
        result += VOWELS_STANDALONE[v];
      }
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
