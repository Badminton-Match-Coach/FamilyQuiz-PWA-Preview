/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Downloads a remote quiz logo and converts it to a compressed, mobile-optimized 
 * data URL so it survives being saved in IndexedDB and works offline with minimal storage.
 * High-resolution images are automatically downscaled (max 320px) to save RAM and disk space.
 */
export async function cacheLogoAsDataUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return url;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:image/svg+xml')) return trimmed; // SVGs are already vector & compact

  try {
    const res = await fetch(trimmed, { mode: 'cors' });
    if (!res.ok) return trimmed;
    const blob = await res.blob();
    if (blob.size > 5 * 1024 * 1024) return trimmed;

    // Use Image and Canvas to downscale high-res logos to mobile-friendly max 320x320
    if (typeof document === 'undefined') return trimmed;

    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    
    return await new Promise<string>((resolve) => {
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_DIM = 320;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(trimmed);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const compressedDataUrl = canvas.toDataURL('image/webp', 0.85);
          if (compressedDataUrl && compressedDataUrl.startsWith('data:image/webp')) {
            resolve(compressedDataUrl);
            return;
          }
        } catch {
          // fallback to png
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(trimmed);
      };
      img.src = objectUrl;
    });
  } catch (err) {
    console.warn('Could not cache quiz logo locally, keeping remote URL:', err);
    return trimmed;
  }
}
