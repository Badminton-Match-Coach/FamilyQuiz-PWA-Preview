import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Database, Files, Download, HardDrive } from 'lucide-react';
import { Language, t } from '../../i18n';

interface BackupChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportAll: () => void;
  onExportIndividual: () => void;
  lang: Language;
}

export const BackupChoiceModal: React.FC<BackupChoiceModalProps> = ({
  isOpen,
  onClose,
  onExportAll,
  onExportIndividual,
  lang,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl border border-slate-100 my-auto z-10"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-5 top-5 rounded-full bg-white/20 p-2.5 transition-colors hover:bg-white/30 text-white cursor-pointer touch-manipulation"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 shadow-inner">
              <HardDrive className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-xl font-black tracking-tight">
              {t(lang, 'backupChoiceTitle') || 'Spara säkerhetskopia'}
            </h3>
            <p className="text-xs text-emerald-100 font-medium mt-1">
              {t(lang, 'backupChoiceSubtitle') || 'Hur vill du spara dina quiz?'}
            </p>
          </div>

          {/* Options Body */}
          <div className="p-6 space-y-4">
            {/* Option 1: Full Database Backup */}
            <button
              type="button"
              onClick={() => {
                onExportAll();
                onClose();
              }}
              className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-50 hover:bg-emerald-50/60 border-2 border-slate-200/80 hover:border-emerald-500 transition-all group cursor-pointer shadow-xs active:scale-[0.99] space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-md shadow-emerald-200">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-slate-800 group-hover:text-emerald-900 transition-colors">
                      {t(lang, 'backupOptionAllTitle') || 'Säkerhetskopia (alla)'}
                    </h4>
                    <span className="inline-block text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md mt-0.5">
                      1 fil (.json)
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-100 group-hover:bg-emerald-600 text-emerald-700 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Download className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xs text-slate-500 group-hover:text-slate-600 leading-relaxed font-medium pl-13">
                {t(lang, 'backupOptionAllDesc') || 'Samlar alla dina sparade quiz och inställningar i en enda komplett databasfil (.json).'}
              </p>
            </button>

            {/* Option 2: Individual Quiz Files */}
            <button
              type="button"
              onClick={() => {
                onExportIndividual();
                onClose();
              }}
              className="w-full text-left p-4 sm:p-5 rounded-2xl bg-slate-50 hover:bg-indigo-50/60 border-2 border-slate-200/80 hover:border-indigo-500 transition-all group cursor-pointer shadow-xs active:scale-[0.99] space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-md shadow-indigo-200">
                    <Files className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-slate-800 group-hover:text-indigo-900 transition-colors">
                      {t(lang, 'backupOptionIndividualTitle') || 'Quizz var och ett med egna namn under QUIZID .json'}
                    </h4>
                    <span className="inline-block text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md mt-0.5">
                      Separata filer (&lt;QUIZID&gt;.json)
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-indigo-100 group-hover:bg-indigo-600 text-indigo-700 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Download className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xs text-slate-500 group-hover:text-slate-600 leading-relaxed font-medium pl-13">
                {t(lang, 'backupOptionIndividualDesc') || 'Exportera varje sparad tipspromenad som en enskild .json-fil döpt med dess Quiz-ID.'}
              </p>
            </button>

            {/* Cancel Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                {t(lang, 'cancelBtn') || 'Avbryt'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
