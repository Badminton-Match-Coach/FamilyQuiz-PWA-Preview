import { Question } from './types';
import { Language } from './i18n';
import { translateQuestionsClient } from './geminiClient';

const MAX_TRANSLATION_CACHE_ENTRIES = 250;
const memoryCache = new Map<string, { text: string; options: string[] }>();

try {
  const saved = localStorage.getItem('quiz_app_translation_cache');
  if (saved) {
    const parsed = JSON.parse(saved);
    const keys = Object.keys(parsed);
    // Keep only latest MAX_TRANSLATION_CACHE_ENTRIES if storage is large
    const trimmedKeys = keys.length > MAX_TRANSLATION_CACHE_ENTRIES ? keys.slice(keys.length - MAX_TRANSLATION_CACHE_ENTRIES) : keys;
    trimmedKeys.forEach(k => {
      memoryCache.set(k, parsed[k]);
    });
  }
} catch (e) {
  console.warn('Failed to load translation cache:', e);
}

let saveTimeout: any = null;
function saveCacheToStorage() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      if (memoryCache.size > MAX_TRANSLATION_CACHE_ENTRIES) {
        const keys = Array.from(memoryCache.keys());
        const keysToRemove = keys.slice(0, keys.length - MAX_TRANSLATION_CACHE_ENTRIES);
        keysToRemove.forEach(k => memoryCache.delete(k));
      }
      const obj: Record<string, { text: string; options: string[] }> = {};
      memoryCache.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem('quiz_app_translation_cache', JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save translation cache:', e);
    }
  }, 400);
}

type CacheSubscriber = () => void;
const subscribers = new Set<CacheSubscriber>();

export function subscribeTranslationCache(sub: CacheSubscriber) {
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
  };
}

let notifyFrame: any = null;
function notifySubscribers() {
  if (notifyFrame) return;
  notifyFrame = requestAnimationFrame(() => {
    notifyFrame = null;
    subscribers.forEach(sub => sub());
  });
}

const pendingRequests = new Set<string>();

export function getCachedTranslation(q: Question, targetLang: Language): { text: string; options: string[] } | null {
  const origLang = q.originalLanguage || 'sv';
  if (origLang === targetLang) {
    return { text: q.text, options: q.options };
  }
  if (q.translations && q.translations[targetLang]) {
    return q.translations[targetLang];
  }
  const key = `${q.id}_${origLang}_to_${targetLang}_${q.text}`;
  return memoryCache.get(key) || null;
}

export function registerQuestionTranslation(qId: string, origLang: string, origText: string, targetLang: string, trans: { text: string; options: string[] }) {
  const cacheKey = `${qId}_${origLang}_to_${targetLang}_${origText}`;
  memoryCache.set(cacheKey, trans);
  saveCacheToStorage();
}

export async function requestQuestionTranslations(questions: Question[], targetLang: Language) {
  const origQuestionsToFetch: Question[] = [];

  for (const q of questions) {
    const origLang = q.originalLanguage || 'sv';
    if (origLang === targetLang) continue;

    const cacheKey = `${q.id}_${origLang}_to_${targetLang}_${q.text}`;
    if (!memoryCache.has(cacheKey) && !pendingRequests.has(cacheKey)) {
      origQuestionsToFetch.push(q);
      pendingRequests.add(cacheKey);
    }
  }

  if (origQuestionsToFetch.length === 0) return;

  try {
    const data = await translateQuestionsClient(
      origQuestionsToFetch.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options || [],
        originalLanguage: q.originalLanguage || 'sv'
      })),
      targetLang
    );

    if (data.translations && Array.isArray(data.translations)) {
      for (const item of data.translations) {
        const origQ = origQuestionsToFetch.find(q => q.id === item.id);
        if (origQ) {
          const origLang = origQ.originalLanguage || 'sv';
          const cacheKey = `${origQ.id}_${origLang}_to_${targetLang}_${origQ.text}`;
          memoryCache.set(cacheKey, {
            text: item.text,
            options: item.options || origQ.options
          });
        }
      }
      saveCacheToStorage();
      notifySubscribers();
    }
  } catch (err) {
    console.error('Failed to translate questions:', err);
  } finally {
    for (const q of origQuestionsToFetch) {
      const origLang = q.originalLanguage || 'sv';
      const cacheKey = `${q.id}_${origLang}_to_${targetLang}_${q.text}`;
      pendingRequests.delete(cacheKey);
    }
  }
}
