/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuizConfig } from '../types';

const DB_NAME = 'FamilyQuizImageCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'images';

export interface CachedImageRecord {
  url: string;
  dataUrl: string;
  mimeType?: string;
  size?: number;
  cachedAt: number;
}

// In-memory cache for synchronous instant access during render
const memoryImageCache = new Map<string, string>();

let cachedDbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

function openImageCacheDB(): Promise<IDBDatabase> {
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB is not available'));
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          cachedDbPromise = null;
        };
        db.onclose = () => {
          cachedDbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        cachedDbPromise = null;
        reject(request.error || new Error('Failed to open ImageCache IndexedDB'));
      };
    } catch (err) {
      cachedDbPromise = null;
      reject(err);
    }
  });

  return cachedDbPromise;
}

/**
 * Convert a Blob to a Base64 data URL
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale and compress image to keep IndexedDB lean while preserving crisp quality
 */
async function compressImageToDataUrl(blob: Blob, maxDim = 1200): Promise<string> {
  if (typeof document === 'undefined') {
    return blobToDataURL(blob);
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        blobToDataURL(blob).then(resolve).catch(() => resolve(objectUrl));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      try {
        const webp = canvas.toDataURL('image/webp', 0.88);
        if (webp && webp.startsWith('data:image/webp')) {
          resolve(webp);
          return;
        }
      } catch {
        // fallback
      }

      try {
        const jpeg = canvas.toDataURL('image/jpeg', 0.88);
        if (jpeg && jpeg.startsWith('data:image/jpeg')) {
          resolve(jpeg);
          return;
        }
      } catch {
        // fallback
      }

      blobToDataURL(blob).then(resolve).catch(() => resolve(objectUrl));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      blobToDataURL(blob).then(resolve).catch(() => resolve(''));
    };

    img.src = objectUrl;
  });
}

/**
 * Fetch a remote image and return a compressed Data URL
 */
async function fetchAndConvertImage(url: string): Promise<string | null> {
  // 1. Try standard fetch
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      return await compressImageToDataUrl(blob);
    }
  } catch {
    // CORS or network error, proceed to fallback
  }

  // 2. Fallback via Image element and Canvas (handles cross-origin if allowed or same-origin)
  if (typeof document !== 'undefined') {
    try {
      const dataUrl = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/webp', 0.88));
          } catch {
            resolve(null);
          }
        };

        img.onerror = () => resolve(null);
        img.src = url;
      });

      if (dataUrl) return dataUrl;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Get an image from in-memory cache or IndexedDB (sync check first)
 */
export function getCachedImageSync(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return trimmed;
  return memoryImageCache.get(trimmed) || null;
}

/**
 * Retrieve cached image from IndexedDB
 */
export async function getImageFromIndexedDB(url: string | undefined | null): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) {
    memoryImageCache.set(trimmed, trimmed);
    return trimmed;
  }

  if (memoryImageCache.has(trimmed)) {
    return memoryImageCache.get(trimmed)!;
  }

  try {
    const db = await openImageCacheDB();
    const record = await new Promise<CachedImageRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(trimmed);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (record && record.dataUrl) {
      memoryImageCache.set(trimmed, record.dataUrl);
      return record.dataUrl;
    }
  } catch (err) {
    console.warn('Error reading from ImageCache IndexedDB:', err);
  }

  return null;
}

/**
 * Cache a single image into IndexedDB & memory cache
 */
export async function cacheImageInIndexedDB(url: string | undefined | null): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // If already a data URL, store directly
  if (trimmed.startsWith('data:')) {
    memoryImageCache.set(trimmed, trimmed);
    try {
      const db = await openImageCacheDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          url: trimmed.slice(0, 100), // Key can't be too huge, or use hash
          dataUrl: trimmed,
          cachedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // ignore
    }
    return trimmed;
  }

  // If already cached in memory or IDB, return it
  const existing = await getImageFromIndexedDB(trimmed);
  if (existing) {
    return existing;
  }

  // Fetch and convert
  const dataUrl = await fetchAndConvertImage(trimmed);
  if (!dataUrl) {
    return null;
  }

  // Save to memory cache
  memoryImageCache.set(trimmed, dataUrl);

  // Save to IndexedDB
  try {
    const db = await openImageCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: CachedImageRecord = {
        url: trimmed,
        dataUrl,
        cachedAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to write image to IndexedDB:', err);
  }

  return dataUrl;
}

/**
 * Scan all images in a QuizConfig (logo, question images, option images)
 * and download & cache them all in IndexedDB so they work 100% offline.
 */
export async function cacheAllQuizImages(quizConfig: QuizConfig): Promise<{ cachedCount: number; totalCount: number }> {
  if (!quizConfig) return { cachedCount: 0, totalCount: 0 };

  const urlsToCache = new Set<string>();

  if (quizConfig.logoUrl?.trim()) {
    urlsToCache.add(quizConfig.logoUrl.trim());
  }

  const allQuestions = [...(quizConfig.barnQuestions || []), ...(quizConfig.vuxenQuestions || [])];
  for (const q of allQuestions) {
    if (q.imageUrl?.trim()) {
      urlsToCache.add(q.imageUrl.trim());
    }
    if (Array.isArray(q.optionImages)) {
      for (const optImg of q.optionImages) {
        if (optImg && optImg.trim()) {
          urlsToCache.add(optImg.trim());
        }
      }
    }
  }

  const totalCount = urlsToCache.size;
  if (totalCount === 0) {
    return { cachedCount: 0, totalCount: 0 };
  }

  let cachedCount = 0;
  const promises = Array.from(urlsToCache).map(async (url) => {
    try {
      const result = await cacheImageInIndexedDB(url);
      if (result) cachedCount++;
    } catch {
      // continue caching others
    }
  });

  await Promise.allSettled(promises);
  return { cachedCount, totalCount };
}

/**
 * Preload all cached images into memory from IndexedDB for instantaneous offline rendering
 */
export async function preloadQuizImagesToMemory(quizConfig: QuizConfig): Promise<void> {
  if (!quizConfig) return;

  const urlsToCheck: string[] = [];
  if (quizConfig.logoUrl?.trim()) urlsToCheck.push(quizConfig.logoUrl.trim());

  const allQuestions = [...(quizConfig.barnQuestions || []), ...(quizConfig.vuxenQuestions || [])];
  for (const q of allQuestions) {
    if (q.imageUrl?.trim()) urlsToCheck.push(q.imageUrl.trim());
    if (Array.isArray(q.optionImages)) {
      for (const optImg of q.optionImages) {
        if (optImg && optImg.trim()) urlsToCheck.push(optImg.trim());
      }
    }
  }

  await Promise.allSettled(
    urlsToCheck.map(async (url) => {
      await getImageFromIndexedDB(url);
    })
  );
}
