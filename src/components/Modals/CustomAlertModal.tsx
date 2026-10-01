/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Language } from '../../i18n';

export interface CustomAlertModalProps {
  isOpen: boolean;
  message: string;
  title?: string;
  type?: 'info' | 'success' | 'error';
  onClose: () => void;
  lang?: Language;
}

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  isOpen,
  message,
  title,
  type = 'info',
  onClose,
  lang = 'sv',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden max-w-md w-full p-6 text-center space-y-5 my-auto"
      >
        <div className="flex justify-end -mb-3 -mt-2">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer touch-manipulation"
            aria-label="Stäng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center space-y-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
            type === 'success' 
              ? 'bg-emerald-500 text-white' 
              : type === 'error' 
              ? 'bg-rose-500 text-white' 
              : 'bg-indigo-600 text-white'
          }`}>
            {type === 'success' ? (
              <CheckCircle2 className="w-7 h-7" />
            ) : type === 'error' ? (
              <AlertCircle className="w-7 h-7" />
            ) : (
              <Info className="w-7 h-7" />
            )}
          </div>

          <h3 className="text-xl font-black text-slate-900">
            {title || (type === 'success' ? (lang === 'sv' ? 'Klart!' : 'Success!') : type === 'error' ? (lang === 'sv' ? 'Observera' : 'Notice') : (lang === 'sv' ? 'Meddelande' : 'Notice'))}
          </h3>

          <p className="text-sm font-medium text-slate-600 leading-relaxed px-2">
            {message}
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-all cursor-pointer touch-manipulation"
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
};
