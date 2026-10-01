/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Language, LanguageOption, SUPPORTED_LANGUAGES, getDefaultQuestionTranslations } from '../i18n';
import { getCachedTranslation } from '../translationCache';
import { Question, QuizConfig } from '../types';

const LANGUAGE_MAP = new Map<string, LanguageOption>();
SUPPORTED_LANGUAGES.forEach(l => LANGUAGE_MAP.set(l.code, l));

export function getLanguageOption(code?: string): LanguageOption {
  if (!code) return SUPPORTED_LANGUAGES[0];
  return LANGUAGE_MAP.get(code) || {
    code: code as Language,
    name: code.toUpperCase(),
    flag: '🌐'
  };
}

/**
 * Resolves the question text, options and text answer in the desired language.
 * Checks:
 * 1. q.translations[lang]
 * 2. If lang is originalLanguage -> q.text, q.options
 * 3. Default built-in question translations
 * 4. Translation cache
 * 5. Fallback to q.text, q.options
 */
export function getTranslatedQuestionContent(
  q: Question,
  lang: Language
): { text: string; options: string[]; correctTextAnswer?: string } {
  if (!q) {
    return { text: '', options: [] };
  }

  // 1. Direct translation in question object
  if (q.translations && q.translations[lang]) {
    const tr = q.translations[lang];
    if (tr.text && tr.text.trim().length > 0) {
      return {
        text: tr.text,
        options: tr.options && tr.options.length > 0 ? tr.options : (q.options || []),
        correctTextAnswer: tr.correctTextAnswer || q.correctTextAnswer
      };
    }
  }

  const orig = q.originalLanguage || 'sv';
  // 2. If desired lang is original language
  if (lang === orig) {
    return {
      text: q.text || '',
      options: q.options || [],
      correctTextAnswer: q.correctTextAnswer
    };
  }

  // 3. Default built-in translations
  try {
    const defaultTranslations = getDefaultQuestionTranslations();
    if (defaultTranslations && defaultTranslations[q.id]?.[lang]) {
      const dTr = defaultTranslations[q.id][lang];
      return {
        text: dTr.text,
        options: dTr.options || q.options || [],
        correctTextAnswer: q.correctTextAnswer
      };
    }
  } catch (e) {
    // ignore
  }

  // 4. Cache
  try {
    const cached = getCachedTranslation(q, lang);
    if (cached && cached.text) {
      return {
        text: cached.text,
        options: cached.options || q.options || [],
        correctTextAnswer: q.correctTextAnswer
      };
    }
  } catch (e) {
    // ignore
  }

  // 5. Fallback to original text
  return {
    text: q.text || '',
    options: q.options || [],
    correctTextAnswer: q.correctTextAnswer
  };
}

/**
 * Returns all languages that this specific question is available in
 * (original language + all translations in translations object + built-in defaults if default question).
 */
export function getQuestionAvailableLanguages(q: Question): LanguageOption[] {
  if (!q) return [];
  
  // 1. Built-in default question check (b1..b4, v1..v4) which have all 17 supported languages
  try {
    const defaultTranslations = getDefaultQuestionTranslations();
    if (defaultTranslations && defaultTranslations[q.id]) {
      return [...SUPPORTED_LANGUAGES];
    }
  } catch (e) {
    // ignore
  }

  const foundCodes = new Set<string>();

  // 2. Original language
  const orig = q.originalLanguage || 'sv';
  foundCodes.add(orig);

  // 3. Translations in the question object
  if (q.translations && typeof q.translations === 'object') {
    for (const [code, tr] of Object.entries(q.translations)) {
      if (tr && typeof tr === 'object' && tr.text && tr.text.trim().length > 0) {
        foundCodes.add(code);
      }
    }
  }

  // Return formatted LanguageOptions in the standard order
  const result: LanguageOption[] = [];
  SUPPORTED_LANGUAGES.forEach(l => {
    if (foundCodes.has(l.code)) {
      result.push(l);
    }
  });

  // Handle any custom language code not in standard list
  foundCodes.forEach(code => {
    if (!result.some(r => r.code === code)) {
      result.push(getLanguageOption(code));
    }
  });

  return result.length > 0 ? result : [getLanguageOption(orig)];
}

export interface QuizLanguagesSummary {
  allLanguages: LanguageOption[];
  isFullyTranslated: (langCode: Language | string) => boolean;
  questionLanguageCounts: Record<string, number>;
  totalQuestions: number;
  hasTranslations: boolean;
}

/**
 * Computes available languages across an entire QuizConfig.
 */
export function getQuizAvailableLanguages(quiz: QuizConfig): QuizLanguagesSummary {
  if (!quiz) {
    return {
      allLanguages: [...SUPPORTED_LANGUAGES],
      isFullyTranslated: () => true,
      questionLanguageCounts: {},
      totalQuestions: 0,
      hasTranslations: true
    };
  }

  const allQuestions: Question[] = [
    ...(Array.isArray(quiz.barnQuestions) ? quiz.barnQuestions : []),
    ...(Array.isArray(quiz.vuxenQuestions) ? quiz.vuxenQuestions : [])
  ];

  const total = allQuestions.length;
  if (total === 0) {
    return {
      allLanguages: [getLanguageOption('sv')],
      isFullyTranslated: () => true,
      questionLanguageCounts: {},
      totalQuestions: 0,
      hasTranslations: false
    };
  }

  const counts: Record<string, number> = {};
  const allLanguageOptionsMap = new Map<string, LanguageOption>();

  SUPPORTED_LANGUAGES.forEach(l => {
    counts[l.code] = 0;
    allLanguageOptionsMap.set(l.code, l);
  });

  let anyTranslationFound = false;

  for (const q of allQuestions) {
    const qLangs = getQuestionAvailableLanguages(q);
    if (qLangs.length > 1) {
      anyTranslationFound = true;
    }
    for (const l of qLangs) {
      counts[l.code] = (counts[l.code] || 0) + 1;
      if (!allLanguageOptionsMap.has(l.code)) {
        allLanguageOptionsMap.set(l.code, l);
      }
    }
  }

  // Filter to languages present in at least 1 question
  const presentCodes = Object.keys(counts).filter(code => counts[code] > 0);
  
  // Sort: fully translated first, then highest question count
  presentCodes.sort((a, b) => {
    const countA = counts[a] || 0;
    const countB = counts[b] || 0;
    if (countA >= total && countB < total) return -1;
    if (countB >= total && countA < total) return 1;
    return countB - countA;
  });

  const allLanguages: LanguageOption[] = presentCodes.map(code => 
    allLanguageOptionsMap.get(code) || getLanguageOption(code)
  );

  return {
    allLanguages: allLanguages.length > 0 ? allLanguages : [getLanguageOption('sv')],
    isFullyTranslated: (code: string) => (counts[code] || 0) >= total,
    questionLanguageCounts: counts,
    totalQuestions: total,
    hasTranslations: anyTranslationFound
  };
}

/**
 * Returns available languages for items displayed in the Library modal (saved DB quizzes or premade catalog quizzes).
 */
export function getLibraryItemLanguages(item: any): LanguageOption[] {
  if (!item) return [getLanguageOption('sv')];

  // 1. Saved quiz with quizConfig
  if (item.quizConfig) {
    return getQuizAvailableLanguages(item.quizConfig).allLanguages;
  }

  // 2. Catalog item with languages array
  if (Array.isArray(item.languages) && item.languages.length > 0) {
    return item.languages.map((code: string) => getLanguageOption(code));
  }

  // 3. Fallback from item title or filename
  const filename = (item.filename || item.id || '').toLowerCase();
  if (filename.includes('_en') || filename.includes('-en') || filename.includes('en.')) {
    return [getLanguageOption('en')];
  }
  if (filename.includes('_de') || filename.includes('-de')) {
    return [getLanguageOption('de')];
  }
  if (filename.includes('_fr') || filename.includes('-fr')) {
    return [getLanguageOption('fr')];
  }

  return [getLanguageOption('sv')];
}
