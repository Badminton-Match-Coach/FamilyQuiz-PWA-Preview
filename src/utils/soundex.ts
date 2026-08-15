/**
 * Multi-lingual Linguistic Validation Engine for PWA Quiz Application.
 * Supports: Swedish (sv), English (en), German (de), French (fr), Spanish (es).
 * 
 * Implements strict dyslexia-forgiving and phonetic rules:
 * 1. Case-insensitivity.
 * 2. Collapse/flexibility with double & repeated consonants (e.g., "aba" / "abbba" -> "Abba", "alene" -> "alleine").
 * 3. Diacritic & accent normalization (é/è -> e, ä/ö/ü -> a/o/u, ñ -> n, ß -> ss).
 * 4. Damerau-Levenshtein transposition forgiveness (e.g., "teh" -> "the", "baab" -> "barn").
 * 5. Language-specific phonetic substitutions (Swedish skj/stj/sj, English ph/f, Spanish v/b, c/z/s, French ph/f, c/s).
 * 6. Up to 30-35% fuzziness / error margin of target word length.
 * 
 * Works 100% locally and offline in browser, with optional Gemini AI validation when connected.
 */

export type SupportedLinguisticLang = 'sv' | 'en' | 'de' | 'fr' | 'es';

export interface LinguisticValidationResult {
  match: boolean;
  confidence: number; // 0.0 to 1.0
  detected_language: SupportedLinguisticLang;
  method?: 'exact' | 'phonetic' | 'transposition' | 'fuzzy' | 'ai' | 'none';
  damerauDistance?: number;
  similarityPercentage?: number;
  // Backward compatibility fields
  isCorrect: boolean;
  soundexCodeUser?: string;
  soundexCodeTarget?: string;
  distance?: number;
}

// Backward compatible alias
export type SoundexMatchResult = LinguisticValidationResult;

/**
 * Standard Soundex letter mapping
 */
const SOUNDEX_MAP: Record<string, string> = {
  B: '1', F: '1', P: '1', V: '1', W: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

export function soundex(str: string): string {
  if (!str) return '0000';
  const normalized = str
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');

  if (!normalized) return '0000';

  const firstLetter = normalized[0];
  let codes = firstLetter;
  let prevCode = SOUNDEX_MAP[firstLetter] || '0';

  for (let i = 1; i < normalized.length; i++) {
    const char = normalized[i];
    const code = SOUNDEX_MAP[char] || '0';
    if (code !== '0' && code !== prevCode) {
      codes += code;
    }
    prevCode = code;
  }

  return (codes + '0000').slice(0, 4);
}

/**
 * Detect language from text or fall back to specified language.
 */
export function detectLinguisticLanguage(text: string, defaultLang: string = 'sv'): SupportedLinguisticLang {
  const norm = text.toLowerCase();
  if (/[åäö]/i.test(norm) || /\b(och|inte|en|ett|den|det|är|vad|vem|hur)\b/i.test(norm)) return 'sv';
  if (/[üß]/i.test(norm) || /\b(und|nicht|der|die|das|ist|ein|eine|wie)\b/i.test(norm)) return 'de';
  if (/[éèêëàâçîïôùûœæ]/i.test(norm) || /\b(le|la|les|un|une|des|est|que|qui|dans)\b/i.test(norm)) return 'fr';
  if (/[ñáéíóúü¿¡]/i.test(norm) || /\b(el|la|los|las|un|una|es|que|por|para|con)\b/i.test(norm)) return 'es';
  if (/\b(the|is|and|a|an|in|of|what|who|where|how)\b/i.test(norm)) return 'en';

  const valid: SupportedLinguisticLang[] = ['sv', 'en', 'de', 'fr', 'es'];
  return (valid.includes(defaultLang as any) ? defaultLang : 'sv') as SupportedLinguisticLang;
}

/**
 * Rule 3: Normalize diacritics and special characters across European languages.
 */
export function normalizeDiacritics(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ñ/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Rule 2: Collapse repeated consecutive consonants to handle dyslexia double-consonant issues
 * (e.g., "aba" vs "Abba", "alene" vs "alleine").
 */
export function collapseRepeatedConsonants(str: string): string {
  // Replace consecutive identical consonants with single consonant
  return str.replace(/([bcdfghjklmnpqrstvwxyz])\1+/gi, '$1');
}

/**
 * Strip common leading articles in Swedish, English, German, French, and Spanish.
 */
export function stripArticles(text: string): string {
  const cleaned = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const words = cleaned.split(' ');
  if (words.length > 1) {
    const articles = [
      // Swedish
      'en', 'ett', 'den', 'det', 'de',
      // English
      'the', 'a', 'an',
      // German
      'der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer',
      // French
      'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du',
      // Spanish
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'
    ];
    if (articles.includes(words[0])) {
      return words.slice(1).join(' ');
    }
  }
  return cleaned;
}

/**
 * Rule 5: Language-specific phonetic substitutions.
 * Transform text into a canonical phonetic representation based on target language.
 */
export function applyPhoneticSubstitutions(str: string, lang: SupportedLinguisticLang): string {
  let s = normalizeDiacritics(str);
  s = stripArticles(s);

  switch (lang) {
    case 'sv': // Swedish
      // sk, stj, skj, sch, sj, sh, ch -> sj
      s = s.replace(/(stj|skj|sch|sj|sh|ch)/g, 'sj');
      // k before soft vowels (e, i, y, ä, ö) or tj, kj -> tj
      s = s.replace(/(tj|kj)/g, 'tj');
      s = s.replace(/k(?=[eiyäö])/g, 'tj');
      // dj, gj, hj, lj -> j
      s = s.replace(/(dj|gj|hj|lj)/g, 'j');
      // ck -> k, dt -> t
      s = s.replace(/ck/g, 'k');
      s = s.replace(/dt/g, 't');
      s = s.replace(/ph/g, 'f');
      break;

    case 'en': // English
      s = s.replace(/ph/g, 'f');
      s = s.replace(/gh(?=[aeiou]|$)/g, 'f');
      s = s.replace(/^kn/g, 'n');
      s = s.replace(/^wr/g, 'r');
      s = s.replace(/^wh/g, 'w');
      s = s.replace(/(ck|qu)/g, 'k');
      s = s.replace(/c(?=[eiy])/g, 's');
      s = s.replace(/c(?=[aou])/g, 'k');
      s = s.replace(/(tion|sion)/g, 'shn');
      s = s.replace(/x/g, 'ks');
      break;

    case 'de': // German
      s = s.replace(/ph/g, 'f');
      s = s.replace(/tsch/g, 'tsh');
      s = s.replace(/sch/g, 'sh');
      s = s.replace(/sp(?=[aeiouäöü])/g, 'shp');
      s = s.replace(/st(?=[aeiouäöü])/g, 'sht');
      s = s.replace(/tz/g, 'z');
      s = s.replace(/dt/g, 't');
      s = s.replace(/v/g, 'f');
      s = s.replace(/ie/g, 'i');
      s = s.replace(/ei/g, 'ai');
      break;

    case 'fr': // French
      s = s.replace(/ph/g, 'f');
      s = s.replace(/eau|au/g, 'o');
      s = s.replace(/ai|ei/g, 'e');
      s = s.replace(/ch/g, 'sh');
      s = s.replace(/gn/g, 'ny');
      s = s.replace(/qu/g, 'k');
      s = s.replace(/c(?=[eiy])/g, 's');
      s = s.replace(/c(?=[aou])/g, 'k');
      s = s.replace(/z/g, 's');
      break;

    case 'es': // Spanish
      // betacism: v <-> b
      s = s.replace(/v/g, 'b');
      // seseo / ceceo: z <-> s, c before e/i <-> s
      s = s.replace(/z/g, 's');
      s = s.replace(/c(?=[ei])/g, 's');
      s = s.replace(/c(?=[aou])/g, 'k');
      s = s.replace(/qu/g, 'k');
      // yeísmo: ll <-> y
      s = s.replace(/ll/g, 'y');
      // silent h
      s = s.replace(/h/g, '');
      // j and g before e/i
      s = s.replace(/g(?=[ei])/g, 'j');
      break;
  }

  // Common universal phonetics
  s = s.replace(/ph/g, 'f');
  s = s.replace(/w/g, 'v');
  s = collapseRepeatedConsonants(s);
  return s.replace(/\s+/g, '');
}

/**
 * Rule 4: Damerau-Levenshtein Distance.
 * Supports insertions, deletions, substitutions, AND character transpositions/swaps.
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const d: number[][] = [];
  for (let i = 0; i <= al; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= bl; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      // Transposition check
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}

/**
 * Clean and normalize text
 */
export function cleanText(input: string): string {
  if (!input) return '';
  return normalizeDiacritics(input);
}

/**
 * Evaluates whether a user's text answer matches the expected answer using the full 5-rule linguistic validation engine.
 * 
 * Rules applied:
 * 1. Ignore case sensitivity completely.
 * 2. Ignore missing, extra, or swapped double consonants ("aba" == "Abba", "alene" == "alleine").
 * 3. Ignore missing or incorrect diacritics/accents.
 * 4. Forgive character transpositions/swaps ("baab" == "barn", "teh" == "the").
 * 5. Forgive language-specific phonetic substitutions (Swedish sk/stj/sj, English ph/f, Spanish v/b, c/z/s, French ph/f).
 * 
 * Fuzziness / error margin: allows up to 30-35% of target word length.
 */
export function evaluateTextAnswer(
  userAnswer: string,
  correctAnswer: string,
  acceptedAnswers: string[] = [],
  preferredLang: string = 'sv'
): LinguisticValidationResult {
  if (!userAnswer || !userAnswer.trim()) {
    return {
      match: false,
      isCorrect: false,
      confidence: 0,
      detected_language: detectLinguisticLanguage(correctAnswer, preferredLang),
      method: 'none',
      soundexCodeUser: '',
      soundexCodeTarget: soundex(correctAnswer || ''),
      distance: 99,
      similarityPercentage: 0,
    };
  }

  const detectedLang = detectLinguisticLanguage(correctAnswer + ' ' + userAnswer, preferredLang);
  const allTargets = [correctAnswer, ...(acceptedAnswers || [])]
    .filter(Boolean)
    .map(ans => ans.trim());

  if (allTargets.length === 0) {
    return {
      match: false,
      isCorrect: false,
      confidence: 0,
      detected_language: detectedLang,
      method: 'none',
      distance: 99,
      similarityPercentage: 0,
    };
  }

  const rawUser = userAnswer.trim();
  const cleanUser = normalizeDiacritics(rawUser);
  const strippedUser = stripArticles(cleanUser);
  const collapsedUser = collapseRepeatedConsonants(strippedUser);
  const phoneticUser = applyPhoneticSubstitutions(rawUser, detectedLang);
  const userSx = soundex(rawUser);

  let bestResult: LinguisticValidationResult = {
    match: false,
    isCorrect: false,
    confidence: 0,
    detected_language: detectedLang,
    method: 'none',
    damerauDistance: 99,
    distance: 99,
    soundexCodeUser: userSx,
    soundexCodeTarget: soundex(correctAnswer),
    similarityPercentage: 0,
  };

  for (const target of allTargets) {
    const rawTarget = target.trim();
    const cleanTarget = normalizeDiacritics(rawTarget);
    const strippedTarget = stripArticles(cleanTarget);
    const collapsedTarget = collapseRepeatedConsonants(strippedTarget);
    const phoneticTarget = applyPhoneticSubstitutions(rawTarget, detectedLang);
    const targetSx = soundex(rawTarget);

    const targetLen = Math.max(strippedTarget.length, 1);
    // Allow up to 25% error margin for "reasonable" tolerance (was 35% for heavy dyslexia support)
    const allowedErrorMargin = Math.max(1, Math.floor(targetLen * 0.25));

    // 1. EXACT or DIRECT MATCH (Rule 1 & Rule 3)
    if (
      cleanUser === cleanTarget ||
      strippedUser === strippedTarget ||
      (cleanUser.length >= 3 && cleanTarget.length >= 3 && (cleanUser.includes(cleanTarget) || cleanTarget.includes(cleanUser)))
    ) {
      return {
        match: true,
        isCorrect: true,
        confidence: 1.0,
        detected_language: detectedLang,
        method: 'exact',
        damerauDistance: 0,
        distance: 0,
        soundexCodeUser: userSx,
        soundexCodeTarget: targetSx,
        similarityPercentage: 100,
      };
    }

    // 2. DOUBLE CONSONANT COLLAPSE MATCH (Rule 2: "aba" vs "Abba", "alene" vs "alleine")
    if (collapsedUser === collapsedTarget && collapsedTarget.length >= 2) {
      return {
        match: true,
        isCorrect: true,
        confidence: 0.96,
        detected_language: detectedLang,
        method: 'phonetic',
        damerauDistance: damerauLevenshteinDistance(strippedUser, strippedTarget),
        distance: damerauLevenshteinDistance(strippedUser, strippedTarget),
        soundexCodeUser: userSx,
        soundexCodeTarget: targetSx,
        similarityPercentage: 96,
      };
    }

    // 3. PHONETIC SUBSTITUTIONS MATCH (Rule 5: Swedish skj/stj/sj, English ph/f, Spanish v/b, etc.)
    if (phoneticUser === phoneticTarget && phoneticTarget.length >= 2) {
      return {
        match: true,
        isCorrect: true,
        confidence: 0.94,
        detected_language: detectedLang,
        method: 'phonetic',
        damerauDistance: damerauLevenshteinDistance(strippedUser, strippedTarget),
        distance: damerauLevenshteinDistance(strippedUser, strippedTarget),
        soundexCodeUser: userSx,
        soundexCodeTarget: targetSx,
        similarityPercentage: 94,
      };
    }

    // 4. DAMERAU-LEVENSHTEIN TRANSPOSITION & FUZZY MATCH (Rule 4 & 30-35% fuzziness)
    const distDirect = damerauLevenshteinDistance(strippedUser, strippedTarget);
    const distCollapsed = damerauLevenshteinDistance(collapsedUser, collapsedTarget);
    const distPhonetic = damerauLevenshteinDistance(phoneticUser, phoneticTarget);
    const minDistance = Math.min(distDirect, distCollapsed, distPhonetic);

    const maxLen = Math.max(strippedUser.length, strippedTarget.length);
    const similarity = maxLen > 0 ? Math.max(0, Math.round(((maxLen - minDistance) / maxLen) * 100)) : 0;
    const isSoundexMatch = userSx === targetSx && userSx !== '0000';

    // Evaluation threshold: within 30-35% error margin or soundex with reasonable edit distance
    const isMatch = (
      minDistance <= allowedErrorMargin ||
      (isSoundexMatch && minDistance <= Math.max(2, Math.floor(maxLen * 0.45))) ||
      (maxLen >= 4 && similarity >= 65) ||
      (maxLen <= 3 && minDistance <= 1)
    );

    const confidence = isMatch
      ? Math.min(0.99, Math.max(0.70, (100 - (minDistance * (100 / Math.max(maxLen, 3)))) / 100))
      : Math.max(0, (100 - (minDistance * 20)) / 100);

    if (isMatch) {
      return {
        match: true,
        isCorrect: true,
        confidence: Math.round(confidence * 100) / 100,
        detected_language: detectedLang,
        method: distDirect <= 1 ? 'transposition' : isSoundexMatch ? 'phonetic' : 'fuzzy',
        damerauDistance: minDistance,
        distance: minDistance,
        soundexCodeUser: userSx,
        soundexCodeTarget: targetSx,
        similarityPercentage: Math.max(similarity, 75),
      };
    }

    if (confidence > bestResult.confidence) {
      bestResult = {
        match: false,
        isCorrect: false,
        confidence: Math.round(confidence * 100) / 100,
        detected_language: detectedLang,
        method: 'none',
        damerauDistance: minDistance,
        distance: minDistance,
        soundexCodeUser: userSx,
        soundexCodeTarget: targetSx,
        similarityPercentage: similarity,
      };
    }
  }

  return bestResult;
}
