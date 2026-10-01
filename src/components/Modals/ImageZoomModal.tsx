/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { Language, t } from '../../i18n';
import { OfflineImage } from '../Common/OfflineImage';

export interface ImageZoomModalProps {
  imageUrl: string | null;
  onClose: () => void;
  lang?: Language;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ imageUrl, onClose, lang = 'sv' }) => {
  return (
    <AnimatePresence>
      {imageUrl && (
        <div 
          className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute -top-12 right-0 p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors backdrop-blur-sm shadow-lg cursor-pointer"
              title={t(lang as Language, 'closeImageTitle')}
            >
              <X className="w-6 h-6" />
            </button>
            <OfflineImage
              src={imageUrl}
              alt={t(lang as Language, 'imageZoomedAlt')}
              className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl object-contain border border-white/20"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
