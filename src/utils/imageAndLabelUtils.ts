/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const compressImageFile = async (file: File, maxWidth = 1000, maxHeight = 1000, quality = 0.82): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new (window as any).Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Kunde inte läsa in bilden'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
    reader.readAsDataURL(file);
  });
};

export const getOptionLabel = (oIdx: number, totalCount?: number): string => {
  if (totalCount === 3) {
    return oIdx === 0 ? '1' : oIdx === 1 ? 'X' : oIdx === 2 ? '2' : String(oIdx + 1);
  }
  return String(oIdx + 1);
};
