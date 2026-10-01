/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getCachedImageSync, getImageFromIndexedDB, cacheImageInIndexedDB } from '../../utils/offlineImageCache';

export interface OfflineImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
  autoCache?: boolean;
}

/**
 * Hook to retrieve an offline-ready URL from IndexedDB or memory cache
 */
export function useOfflineImageUrl(src: string | undefined | null): string | undefined {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() => {
    if (!src) return undefined;
    const cached = getCachedImageSync(src);
    return cached || src;
  });

  useEffect(() => {
    if (!src) {
      setResolvedUrl(undefined);
      return;
    }

    let isMounted = true;
    const cachedSync = getCachedImageSync(src);
    if (cachedSync) {
      setResolvedUrl(cachedSync);
      return;
    }

    setResolvedUrl(src);

    // Asynchronously fetch from IndexedDB or cache it in background
    getImageFromIndexedDB(src).then((cached) => {
      if (isMounted && cached) {
        setResolvedUrl(cached);
      } else if (isMounted && !cached && src.startsWith('http')) {
        // Try caching in background if not already cached
        cacheImageInIndexedDB(src).then((newCached) => {
          if (isMounted && newCached) {
            setResolvedUrl(newCached);
          }
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [src]);

  return resolvedUrl;
}

/**
 * Offline-resilient image component.
 * Automatically loads from IndexedDB if offline or network fails.
 */
export const OfflineImage: React.FC<OfflineImageProps> = ({
  src,
  alt = '',
  className = '',
  fallbackSrc,
  autoCache = true,
  onError,
  ...rest
}) => {
  const offlineSrc = useOfflineImageUrl(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src, offlineSrc]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // If regular URL failed, try IndexedDB retrieval once more
    if (src && !offlineSrc?.startsWith('data:')) {
      getImageFromIndexedDB(src).then((cached) => {
        if (cached) {
          (e.currentTarget as HTMLImageElement).src = cached;
          return;
        }
        setHasError(true);
        if (onError) onError(e);
      });
    } else {
      setHasError(true);
      if (onError) onError(e);
    }
  };

  if (!src && !fallbackSrc) return null;

  const currentSrc = (hasError && fallbackSrc) ? fallbackSrc : (offlineSrc || src || fallbackSrc);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={handleError}
      {...rest}
    />
  );
};
