import LZString from 'lz-string';
import { QuizConfig, Question } from '../types';

/**
 * Compact minified schema mapping for QuizConfig:
 * t: title
 * p: password
 * d: geotagUnlockDistance
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
 * a: correctTextAnswer
 * k: acceptedTextAnswers
 * g: originalLanguage
 * r: translations
 */

interface MinifiedQuestion {
  i?: string;
  y?: 'options' | 'text' | 'points';
  q: string;
  o?: string[];
  c?: number[];
  l?: [number, number];
  m?: number;
  a?: string;
  k?: string[];
  g?: string;
  r?: Record<string, { q: string; o?: string[] }>;
}

interface MinifiedQuizConfig {
  t: string;
  p?: string;
  d?: number;
  b: MinifiedQuestion[];
  v: MinifiedQuestion[];
}

function minifyQuestion(q: Question): MinifiedQuestion {
  const min: MinifiedQuestion = {
    q: q.text
  };

  if (q.id) min.i = q.id;
  if (q.type && q.type !== 'options') min.y = q.type;
  if (q.options && q.options.length > 0) min.o = q.options;
  if (q.correctAnswers && q.correctAnswers.length > 0) min.c = q.correctAnswers;
  if (q.location && typeof q.location.lat === 'number' && typeof q.location.lng === 'number') {
    // Round to 5 decimals (~1.1 meter precision) to save space
    min.l = [
      Math.round(q.location.lat * 100000) / 100000,
      Math.round(q.location.lng * 100000) / 100000
    ];
  }
  if (typeof q.maxPoints === 'number') min.m = q.maxPoints;
  if (q.correctTextAnswer) min.a = q.correctTextAnswer;
  if (q.acceptedTextAnswers && q.acceptedTextAnswers.length > 0) min.k = q.acceptedTextAnswers;
  if (q.originalLanguage && q.originalLanguage !== 'sv') min.g = q.originalLanguage;

  if (q.translations && Object.keys(q.translations).length > 0) {
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
    location: min.l ? { lat: min.l[0], lng: min.l[1] } : undefined,
    maxPoints: min.m,
    correctTextAnswer: min.a,
    acceptedTextAnswers: min.k,
    originalLanguage: (min.g as any) || 'sv',
    translations
  };
}

/**
 * Compresses a QuizConfig object into an ultra-compact, URL-safe string.
 * Uses schema minification + LZ-based compression encoded as URI component safe.
 */
export function compressQuizToUrlCode(config: QuizConfig): string {
  const minified: MinifiedQuizConfig = {
    t: config.title || 'Tipspromenad',
    b: (config.barnQuestions || []).map(minifyQuestion),
    v: (config.vuxenQuestions || []).map(minifyQuestion)
  };

  if (config.password) minified.p = config.password;
  if (config.geotagUnlockDistance && config.geotagUnlockDistance !== 20) {
    minified.d = config.geotagUnlockDistance;
  }

  const jsonStr = JSON.stringify(minified);
  // compressToEncodedURIComponent produces [a-zA-Z0-9 -_.!~*'()] string safe for URL hashes without encoding
  const compressed = LZString.compressToEncodedURIComponent(jsonStr);
  return `z=${compressed}`;
}

/**
 * Generates the full clickable direct-open URL for a quiz.
 */
export function generateQuizDirectUrl(config: QuizConfig): string {
  const code = compressQuizToUrlCode(config);
  const baseUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${window.location.pathname}` 
    : 'https://badminton-match-coach.github.io/FamilyQuiz-PWA-Preview/';
  return `${baseUrl}#${code}`;
}

/**
 * Decompresses an ultra-compact URL code into a full QuizConfig object.
 * Returns null if the code is invalid or not in the compressed format.
 */
export function decompressQuizFromUrlCode(code: string): QuizConfig | null {
  try {
    let cleanCode = code.trim();
    if (cleanCode.startsWith('#')) cleanCode = cleanCode.substring(1);
    if (cleanCode.startsWith('z=')) cleanCode = cleanCode.substring(2);
    if (cleanCode.startsWith('q=')) cleanCode = cleanCode.substring(2);

    const decompressedJson = LZString.decompressFromEncodedURIComponent(cleanCode);
    if (!decompressedJson) return null;

    const min: MinifiedQuizConfig = JSON.parse(decompressedJson);
    if (!min || (!Array.isArray(min.b) && !Array.isArray(min.v))) {
      return null;
    }

    return {
      title: min.t || 'Tipspromenad',
      password: min.p || '',
      geotagUnlockDistance: min.d || 20,
      barnQuestions: (min.b || []).map((q, idx) => unminifyQuestion(q, idx)),
      vuxenQuestions: (min.v || []).map((q, idx) => unminifyQuestion(q, idx))
    };
  } catch (err) {
    console.error('Failed to decompress quiz URL code:', err);
    return null;
  }
}
