/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnswerRecord, Participant, QuizConfig } from './types';
import { assertValidQuizConfig } from './utils/quizValidation';
import { cacheAllQuizImages } from './utils/offlineImageCache';

export interface QuizSessionState {
  participants: Participant[];
  answers: AnswerRecord[];
}

export interface SavedQuizRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  barnCount: number;
  vuxenCount: number;
  hasLocations: boolean;
  quizConfig: QuizConfig;
  quizState?: QuizSessionState;
}

const DB_NAME = 'FamilyQuizIndexedDB';
const DB_VERSION = 2;
const STORE_NAME = 'quizzes';
const LOCALSTORAGE_MIRROR_KEY = 'family_quiz_db_mirror';

// Cached DB connection to prevent Safari connection leaks
let cachedDB: IDBDatabase | null = null;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

// LocalStorage helpers for seamless fallback and mirror syncing
function getLocalStorageMirror(): SavedQuizRecord[] {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalStorageMirror(records: SavedQuizRecord[]): void {
  try {
    localStorage.setItem(LOCALSTORAGE_MIRROR_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Could not save to localStorage mirror:', err);
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB is not available'));
    }

    if (cachedDB) {
      try {
        // Test if still usable
        if (cachedDB.objectStoreNames.contains(STORE_NAME)) {
          return resolve(cachedDB);
        }
      } catch {
        cachedDB = null;
      }
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('title', 'title', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        cachedDB = db;
        db.onversionchange = () => {
          db.close();
          cachedDB = null;
        };
        db.onclose = () => {
          cachedDB = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        cachedDB = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        console.warn('IndexedDB open blocked by another tab or connection.');
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Save or update a quiz in IndexedDB (with synced localStorage fallback and upserting by quizId)
 */
export async function saveQuizToIndexedDB(
  quizConfig: QuizConfig,
  existingId?: string,
  customTitle?: string,
  quizState?: QuizSessionState
): Promise<SavedQuizRecord> {
  const quizId = quizConfig.quizId;
  const mirror = getLocalStorageMirror();

  // Find existing record by existingId or matching quizConfig.quizId
  let existingRecord: SavedQuizRecord | undefined;
  if (existingId) {
    existingRecord = mirror.find((m) => m.id === existingId);
  }
  if (!existingRecord && quizId) {
    existingRecord = mirror.find((m) => m.quizConfig?.quizId === quizId);
  }

  const id = existingId || existingRecord?.id || `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const title = customTitle?.trim() || quizConfig.title?.trim() || existingRecord?.title || 'Min Tipspromenad';
  const now = Date.now();
  const createdAt = existingRecord?.createdAt || now;

  const barnCount = quizConfig.barnQuestions?.length || 0;
  const vuxenCount = quizConfig.vuxenQuestions?.length || 0;
  const hasLocations = [...(quizConfig.barnQuestions || []), ...(quizConfig.vuxenQuestions || [])].some(
    (q) => !!q.location
  );

  const record: SavedQuizRecord = {
    id,
    title,
    createdAt,
    updatedAt: now,
    barnCount,
    vuxenCount,
    hasLocations,
    quizConfig: {
      ...quizConfig,
      quizId: quizId || id,
      title,
    },
    quizState: quizState || existingRecord?.quizState,
  };

  // 1. Update mirror: remove any duplicate with same id or same quizConfig.quizId
  const filteredMirror = mirror.filter((m) => m.id !== id && (!quizId || m.quizConfig?.quizId !== quizId));
  const updatedMirror = [record, ...filteredMirror].sort((a, b) => b.updatedAt - a.updatedAt);
  saveLocalStorageMirror(updatedMirror);

  // 2. Persist to IndexedDB & remove old duplicates sharing quizId
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const allRecords: SavedQuizRecord[] = getAllReq.result || [];
        for (const r of allRecords) {
          if (r.id !== id && quizId && r.quizConfig?.quizId === quizId) {
            store.delete(r.id);
          }
        }
        store.put(record);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } catch (err) {
    console.warn('IndexedDB write failed, persisted to localStorage fallback instead:', err);
  }

  // Ensure all images are cached in IndexedDB for offline reliability
  cacheAllQuizImages(record.quizConfig).catch(() => {});

  return record;
}

/**
 * Get all saved quizzes from IndexedDB (with synced localStorage fallback and automatic deduplication)
 */
export async function getAllQuizzesFromIndexedDB(): Promise<SavedQuizRecord[]> {
  let idbRecords: SavedQuizRecord[] = [];
  let idbSuccess = false;

  try {
    const db = await openDB();
    idbRecords = await new Promise<SavedQuizRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        tx.oncomplete = () => resolve(records);
      };
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
    idbSuccess = true;
  } catch (err) {
    console.warn('IndexedDB read failed, trying localStorage mirror fallback:', err);
  }

  const mirror = getLocalStorageMirror();
  let rawRecords = idbSuccess && idbRecords.length > 0 ? idbRecords : mirror;

  if (rawRecords.length > 0) {
    // Deduplicate by quizId or id (keeping newest by updatedAt)
    rawRecords.sort((a, b) => b.updatedAt - a.updatedAt);
    const seenQuizIds = new Set<string>();
    const seenIds = new Set<string>();
    const uniqueRecords: SavedQuizRecord[] = [];

    for (const record of rawRecords) {
      const qId = record.quizConfig?.quizId;
      if (seenIds.has(record.id) || (qId && seenQuizIds.has(qId))) {
        continue;
      }
      seenIds.add(record.id);
      if (qId) {
        seenQuizIds.add(qId);
      }
      uniqueRecords.push(record);
    }

    // If IDB succeeded but had duplicates, clean them up in IDB
    if (idbSuccess && uniqueRecords.length < idbRecords.length) {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        for (const item of uniqueRecords) {
          store.put(item);
        }
      } catch (err) {
        console.warn('Failed to clean up duplicate records in IDB:', err);
      }
    }

    saveLocalStorageMirror(uniqueRecords);
    return uniqueRecords;
  }

  if (mirror.length > 0 && idbSuccess && idbRecords.length === 0) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of mirror) {
        store.put(item);
      }
    } catch (err) {
      console.warn('Failed background restore to IndexedDB:', err);
    }
  }

  return rawRecords;
}

/**
 * Get a single quiz by ID from IndexedDB
 */
export async function getQuizFromIndexedDB(id: string): Promise<SavedQuizRecord | null> {
  try {
    const db = await openDB();
    const result = await new Promise<SavedQuizRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result || null;
        tx.oncomplete = () => resolve(result);
      };
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
    if (result) return result;
  } catch (err) {
    console.warn('IndexedDB get error, checking mirror:', err);
  }

  const mirror = getLocalStorageMirror();
  return mirror.find((m) => m.id === id) || null;
}

export async function getQuizByQuizId(quizId: string): Promise<SavedQuizRecord | null> {
  const quizzes = await getAllQuizzesFromIndexedDB();
  return quizzes.find((record) => record.quizConfig.quizId === quizId) || null;
}

export async function saveQuizSessionToIndexedDB(
  quizConfig: QuizConfig,
  quizState: QuizSessionState
): Promise<SavedQuizRecord> {
  const existing = await getQuizByQuizId(quizConfig.quizId);
  return saveQuizToIndexedDB(quizConfig, existing?.id, quizConfig.title, quizState);
}

/**
 * Delete a quiz from IndexedDB by ID
 */
export async function deleteQuizFromIndexedDB(id: string): Promise<void> {
  // Update mirror first
  const mirror = getLocalStorageMirror().filter((m) => m.id !== id);
  saveLocalStorageMirror(mirror);

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } catch (err) {
    console.warn('IndexedDB delete failed, deleted from mirror:', err);
  }
}

/**
 * Clear all records from IndexedDB quizzes store
 */
export async function clearAllQuizzesFromIndexedDB(): Promise<void> {
  saveLocalStorageMirror([]);

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  } catch (err) {
    console.warn('IndexedDB clear failed:', err);
  }
}

/**
 * Export full IndexedDB as JSON string
 */
export async function exportIndexedDBToJSON(): Promise<string> {
  const quizzes = await getAllQuizzesFromIndexedDB();
  const exportData = {
    appName: 'FamilyQuiz',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    quizCount: quizzes.length,
    quizzes,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * Import quizzes from JSON backup into IndexedDB
 */
export async function importIndexedDBFromJSON(jsonString: string): Promise<number> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Ogiltigt JSON-format.');
  }

  const list: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.quizzes)
    ? parsed.quizzes
    : parsed?.quizConfig
    ? [parsed]
    : [];

  if (list.length === 0) {
    throw new Error('Inga giltiga quiz hittades i JSON-filen.');
  }

  let count = 0;

  for (const item of list) {
    if (!item.quizConfig && (item.barnQuestions || item.vuxenQuestions)) {
      // Direct QuizConfig structure
      const recordConfig: QuizConfig = {
        quizId: item.quizId || crypto.randomUUID(),
        title: item.title || 'Importerat Quiz',
        password: item.password || '',
        geotagUnlockDistance: item.geotagUnlockDistance || 20,
        requireSequentialAnswers: item.requireSequentialAnswers === true,
        barnQuestions: item.barnQuestions || [],
        vuxenQuestions: item.vuxenQuestions || [],
      };
      assertValidQuizConfig(recordConfig);
      await saveQuizToIndexedDB(recordConfig, item.id || undefined, recordConfig.title);
      count++;
    } else if (item.quizConfig) {
      // SavedQuizRecord structure
      assertValidQuizConfig(item.quizConfig);
      await saveQuizToIndexedDB(
        item.quizConfig,
        item.id || undefined,
        item.title || item.quizConfig?.title
      );
      count++;
    }
  }

  return count;
}

/**
 * Share IndexedDB JSON file using Web Share API or download fallback
 */
export async function shareIndexedDBJSON(): Promise<{ shared: boolean; method: 'native' | 'download' | 'clipboard' }> {
  const jsonText = await exportIndexedDBToJSON();
  const filename = `family_quiz_db_backup_${new Date().toISOString().slice(0, 10)}.json`;

  const blob = new Blob([jsonText], { type: 'application/json' });
  
  // Test File constructor support safely
  let file: File | null = null;
  try {
    file = new File([blob], filename, { type: 'application/json' });
  } catch {
    file = null;
  }

  // Try Web Share API with file support first (Mobile Safari iOS 15+, Chrome Android)
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: 'Family Quiz Backup',
        text: 'Säkerhetskopia av sparade tipspromenader',
        files: [file],
      });
      return { shared: true, method: 'native' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { shared: false, method: 'native' };
      }
      // Fall through
    }
  }

  // Fallback to text sharing if native share text is supported
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Family Quiz Backup',
        text: jsonText,
      });
      return { shared: true, method: 'native' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { shared: false, method: 'native' };
      }
    }
  }

  // Fallback to browser file download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { shared: true, method: 'download' };
  } catch {
    // Ultimate fallback: copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(jsonText);
      return { shared: true, method: 'clipboard' };
    }
    return { shared: false, method: 'clipboard' };
  }
}

/**
 * Download a single quiz record as an individual JSON file with its title and quizId in filename
 */
export function downloadSingleQuizAsJSON(record: { id?: string; title?: string; config?: QuizConfig; quizConfig?: QuizConfig; quizState?: any }): void {
  const config = record.quizConfig || record.config;
  if (!config) return;
  const quizId = config.quizId || record.id || crypto.randomUUID();
  const rawTitle = record.title || config.title || 'Quiz';
  const cleanTitle = rawTitle.trim().replace(/[^a-zA-Z0-9åäöÅÄÖ_-]/g, '_').substring(0, 35) || 'quiz';
  const filename = `${cleanTitle}_${quizId}.json`;

  const payload = {
    version: 1,
    type: 'family-quiz-config',
    exportedAt: new Date().toISOString(),
    quiz: config,
    quizConfig: config,
    quizState: record.quizState
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all saved quizzes as individual JSON files named after their title and QUIZID
 */
export async function exportIndividualQuizzesToFiles(): Promise<{ count: number }> {
  const quizzes = await getAllQuizzesFromIndexedDB();
  if (!quizzes || quizzes.length === 0) {
    return { count: 0 };
  }

  for (let i = 0; i < quizzes.length; i++) {
    downloadSingleQuizAsJSON(quizzes[i]);
    if (i < quizzes.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return { count: quizzes.length };
}

