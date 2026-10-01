import LZString from 'lz-string';
import { QuizConfig, Question } from '../types';
import { assertValidQuizConfig } from './quizValidation';

/**
 * Compact minified schema mapping for QuizConfig:
 * t: title
 * u: logoUrl
 * p: password
 * d: geotagUnlockDistance
 * s: requireSequentialAnswers
 * b: barnQuestions
 * v: vuxenQuestions
 *
 * Question mapping:
 * i: id
 * y: type ('options' | 'text' | 'points')
 * q: text
 * o: options
 * c: correctAnswers
 * l: location [lat, lng]
 * m: maxPoints
 * f: followUpQuestionId
 * w: followUpMode
 * a: correctTextAnswer
 * k: acceptedTextAnswers
 * g: originalLanguage
 * r: translations
 */

interface MinifiedQuestion {
  i?: string;
  y?: 'options' | 'text' | 'points';
  q: string;
  j?: string; // imageUrl (URL link)
  p?: string[]; // optionImages (URL links)
  o?: string[];
  c?: number[];
  l?: [number, number];
  h?: boolean; // hideLocationOnMap (treasure hunt)
  m?: number;
  f?: string;
  w?: 'always' | 'correct' | 'incorrect';
  a?: string;
  k?: string[];
  g?: string;
  r?: Record<string, { q: string; o?: string[] }>;
}

interface MinifiedQuizConfig {
  i?: string;
  t: string;
  u?: string;
  p?: string;
  d?: number;
  s?: boolean;
  x?: 'strict' | 'normal' | 'lenient';
  b: MinifiedQuestion[];
  v: MinifiedQuestion[];
}

function minifyQuestion(q: Question, compactForQr?: boolean): MinifiedQuestion {
  const min: MinifiedQuestion = {
    q: q.text
  };

  if (q.id) min.i = q.id;
  if (q.type && q.type !== 'options') min.y = q.type;
  if (q.options && q.options.length > 0) min.o = q.options;
  if (q.correctAnswers && q.correctAnswers.length > 0) min.c = q.correctAnswers;
  if (q.location && typeof q.location.lat === 'number' && typeof q.location.lng === 'number') {
    // Round to 4 decimals (~11m precision) for QR codes or 5 decimals (~1.1m precision) otherwise
    const precision = compactForQr ? 10000 : 100000;
    min.l = [
      Math.round(q.location.lat * precision) / precision,
      Math.round(q.location.lng * precision) / precision
    ];
  }
  if (q.hideLocationOnMap || q.location?.hideOnMap) min.h = true;
  if (typeof q.maxPoints === 'number') min.m = q.maxPoints;
  if (q.followUpQuestionId) min.f = q.followUpQuestionId;
  if (q.followUpMode && q.followUpMode !== 'always') min.w = q.followUpMode;
  if (q.correctTextAnswer) min.a = q.correctTextAnswer;
  if (q.acceptedTextAnswers && q.acceptedTextAnswers.length > 0) {
    min.k = compactForQr ? q.acceptedTextAnswers.slice(0, 3) : q.acceptedTextAnswers;
  }
  if (q.originalLanguage && q.originalLanguage !== 'sv') min.g = q.originalLanguage;

  // Include image URL links only (omit giant base64 data URLs to keep share codes and QR codes tiny)
  if (q.imageUrl && (!q.imageUrl.startsWith('data:') || q.imageUrl.length < 150)) {
    min.j = q.imageUrl;
  }
  if (q.optionImages && q.optionImages.length > 0) {
    const sanitized = q.optionImages.map(img => (!img || (img.startsWith('data:') && img.length >= 150)) ? '' : img);
    if (sanitized.some(Boolean)) {
      min.p = sanitized;
    }
  }

  if (!compactForQr && q.translations && Object.keys(q.translations).length > 0) {
    const minTrans: Record<string, { q: string; o?: string[] }> = {};
    for (const [langKey, trans] of Object.entries(q.translations)) {
      const transObj = trans as { text?: string; options?: string[] } | undefined;
      if (transObj && transObj.text) {
        minTrans[langKey] = {
          q: transObj.text,
          ...(transObj.options && transObj.options.length > 0 ? { o: transObj.options } : {})
        };
      }
    }
    if (Object.keys(minTrans).length > 0) {
      min.r = minTrans;
    }
  }

  return min;
}

function unminifyQuestion(min: MinifiedQuestion, fallbackIdx: number): Question {
  const translations: Record<string, { text: string; options: string[] }> | undefined = min.r
    ? Object.fromEntries(
        Object.entries(min.r).map(([k, v]) => [
          k,
          { text: v.q, options: v.o || [] }
        ])
      )
    : undefined;

  return {
    id: min.i || `q-${fallbackIdx}-${Math.random().toString(36).substring(2, 7)}`,
    type: min.y || 'options',
    text: min.q || '',
    options: min.o || (min.y === 'points' || min.y === 'text' ? [] : ['1', 'X', '2']),
    correctAnswers: min.c || (min.y === 'points' || min.y === 'text' ? [] : [0]),
    location: min.l ? { lat: min.l[0], lng: min.l[1], hideOnMap: min.h || undefined } : undefined,
    hideLocationOnMap: min.h || undefined,
    maxPoints: min.m,
    followUpQuestionId: min.f,
    followUpMode: min.w || 'always',
    correctTextAnswer: min.a,
    acceptedTextAnswers: min.k,
    originalLanguage: (min.g as any) || 'sv',
    imageUrl: min.j || undefined,
    optionImages: min.p && min.p.length > 0 ? min.p : undefined,
    translations
  };
}

/**
 * Compresses a QuizConfig object into an ultra-compact, URL-safe string.
 * Uses schema minification + LZ-based compression encoded as URI component safe.
 */
export function compressQuizToUrlCode(config: QuizConfig, options?: { compactForQr?: boolean }): string {
  assertValidQuizConfig(config);
  const isCompact = options?.compactForQr;
  const minified: MinifiedQuizConfig = {
    i: config.quizId,
    t: config.title || 'Tipspromenad',
    b: (config.barnQuestions || []).map(q => minifyQuestion(q, isCompact)),
    v: (config.vuxenQuestions || []).map(q => minifyQuestion(q, isCompact))
  };

  if (config.logoUrl && (!isCompact || !config.logoUrl.startsWith('data:') || config.logoUrl.length < 80)) {
    minified.u = config.logoUrl;
  }
  if (config.password) minified.p = config.password;
  if (config.geotagUnlockDistance && config.geotagUnlockDistance !== 20) {
    minified.d = config.geotagUnlockDistance;
  }
  if (config.requireSequentialAnswers) minified.s = true;
  if (config.textMatchStrictness && config.textMatchStrictness !== 'normal') {
    minified.x = config.textMatchStrictness;
  }

  const jsonStr = JSON.stringify(minified);
  // compressToEncodedURIComponent produces [a-zA-Z0-9 -_.!~*'()] string safe for URL hashes without encoding
  const compressed = LZString.compressToEncodedURIComponent(jsonStr);
  return `z=${compressed}`;
}

/**
 * Generates the full clickable direct-open URL for a quiz.
 */
export function generateQuizDirectUrl(config: QuizConfig, options?: { lockMode?: boolean; compactForQr?: boolean; walkId?: string }): string {
  const code = compressQuizToUrlCode(config, options);
  let baseUrl = 'https://badminton-match-coach.github.io/FamilyQuiz-PWA/';
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('family_quiz_cached_app_url');
      if (cached && (cached.startsWith('http://') || cached.startsWith('https://'))) {
        baseUrl = cached;
      } else if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        baseUrl = `${window.location.origin}${window.location.pathname}`;
      }
    } catch {
      baseUrl = `${window.location.origin}${window.location.pathname}`;
    }
  }
  let suffix = options?.lockMode ? '&lock=1' : '';
  if (options?.walkId) {
    suffix += `&w=${options.walkId}`;
  }
  return `${baseUrl}?${code}${suffix}`;
}

/**
 * Decompresses an ultra-compact URL code into a full QuizConfig object.
 * Returns null if the code is invalid or not in the compressed format.
 */
export function decompressQuizFromUrlCode(code: string): QuizConfig | null {
  try {
    let cleanCode = code.trim();
    if (cleanCode.startsWith('#')) cleanCode = cleanCode.substring(1).trim();
    if (cleanCode.toLowerCase().startsWith('quiz=')) cleanCode = cleanCode.substring(5).trim();
    if (cleanCode.toLowerCase().startsWith('z=')) cleanCode = cleanCode.substring(2).trim();
    if (cleanCode.toLowerCase().startsWith('q=')) cleanCode = cleanCode.substring(2).trim();

    let decompressedJson = LZString.decompressFromEncodedURIComponent(cleanCode);
    if (!decompressedJson) {
      try {
        const urlDecoded = decodeURIComponent(cleanCode);
        decompressedJson = LZString.decompressFromEncodedURIComponent(urlDecoded);
      } catch {
        // ignore
      }
    }
    if (!decompressedJson) return null;

    const min: MinifiedQuizConfig = JSON.parse(decompressedJson);
    if (!min || (!Array.isArray(min.b) && !Array.isArray(min.v))) {
      return null;
    }

    const config: QuizConfig = {
      quizId: min.i || 'default-quiz-template',
      title: min.t || 'Tipspromenad',
      logoUrl: min.u || undefined,
      password: min.p || '',
      geotagUnlockDistance: min.d || 20,
      requireSequentialAnswers: min.s === true,
      textMatchStrictness: min.x || 'normal',
      barnQuestions: (min.b || []).map((q, idx) => unminifyQuestion(q, idx)),
      vuxenQuestions: (min.v || []).map((q, idx) => unminifyQuestion(q, idx))
    };
    assertValidQuizConfig(config);
    return config;
  } catch (err) {
    console.error('Failed to decompress quiz URL code:', err);
    return null;
  }
}
