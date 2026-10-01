/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  FileDown,
  Upload,
  Sparkles,
  Database,
  ArrowRight,
  HelpCircle,
  FileSpreadsheet,
  Globe,
  ChevronDown,
  ChevronUp,
  X,
  Share2,
  CheckCircle2,
  Download,
  Save,
  Trash2,
  MapPin,
  HardDrive,
  Check
} from 'lucide-react';
import { Language, t } from '../../i18n';
import { SavedQuizRecord, QuizMetadata, QuizConfig } from '../../types';

export interface GlobalImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  configTab: 'library' | 'questions' | 'db' | 'general' | 'ai';
  setConfigTab: (tab: 'library' | 'questions' | 'db' | 'general' | 'ai') => void;
  savedQuizzes: SavedQuizRecord[];
  dbSearchQuery: string;
  setDbSearchQuery: (q: string) => void;
  dbFilterCategory: string;
  setDbFilterCategory: (c: string) => void;
  dbSortBy: 'date-desc' | 'date-asc' | 'name-asc';
  setDbSortBy: (s: 'date-desc' | 'date-asc' | 'name-asc') => void;
  quizMetadataList: QuizMetadata[];
  librarySearchQuery: string;
  setLibrarySearchQuery: (q: string) => void;
  libraryFilterLanguage: string;
  setLibraryFilterLanguage: (l: string) => void;
  librarySortBy: 'name-asc' | 'date-desc' | 'count-desc';
  setLibrarySortBy: (s: 'name-asc' | 'date-desc' | 'count-desc') => void;
  isLoadingCatalog: boolean;
  catalogLoadError: string | null;
  handleLoadQuizFromDB: (item: SavedQuizRecord, closeModal?: boolean) => void;
  handleDeleteQuizFromDB: (recordId: string) => void;
  handleLoadPresetQuiz: (meta: QuizMetadata) => void;
  configJsonInput: string;
  setConfigJsonInput: (value: string) => void;
  handleImportConfig: () => void;
  quizConfig?: QuizConfig;
  handleSaveCurrentQuizToDB?: () => Promise<void>;
  isSavingToDb?: boolean;
}

export const GlobalImportModal: React.FC<GlobalImportModalProps> = ({
  isOpen,
  onClose,
  lang,
  configTab,
  setConfigTab,
  savedQuizzes,
  dbSearchQuery,
  setDbSearchQuery,
  dbFilterCategory,
  setDbFilterCategory,
  dbSortBy,
  setDbSortBy,
  quizMetadataList,
  librarySearchQuery,
  setLibrarySearchQuery,
  libraryFilterLanguage,
  setLibraryFilterLanguage,
  librarySortBy,
  setLibrarySortBy,
  isLoadingCatalog,
  catalogLoadError,
  handleLoadQuizFromDB,
  handleDeleteQuizFromDB,
  handleLoadPresetQuiz,
  configJsonInput,
  setConfigJsonInput,
  handleImportConfig,
  quizConfig,
  handleSaveCurrentQuizToDB,
  isSavingToDb
}) => {
  const [showAllSavedQuizzes, setShowAllSavedQuizzes] = useState(false);
  const latestSavedQuiz = savedQuizzes.length > 0 ? savedQuizzes[0] : null;

  const currentTotalQuestions = (quizConfig?.barnQuestions?.length || 0) + (quizConfig?.vuxenQuestions?.length || 0);
  const currentGpsCount = useMemo(() => {
    if (!quizConfig) return 0;
    const all = [...(quizConfig.barnQuestions || []), ...(quizConfig.vuxenQuestions || [])];
    return all.filter(q => q.location && (q.location.lat !== 0 || q.location.lng !== 0)).length;
  }, [quizConfig]);

  const isCurrentQuiz = (item: { id?: string; title?: string; filename?: string }) => {
    if (!quizConfig) return false;
    const curTitle = (quizConfig.title || '').trim().toLowerCase();
    const curId = (quizConfig.quizId || '').trim().toLowerCase();
    const itemTitle = (item.title || '').trim().toLowerCase();
    const itemId = (item.id || '').trim().toLowerCase();
    const itemFilename = (item.filename || '').trim().toLowerCase();

    if (curId && itemId && (curId === itemId || curId.includes(itemId) || itemId.includes(curId))) return true;
    if (curTitle && itemTitle) {
      if (curTitle === itemTitle) return true;
      // Remove parenthesis content for fuzzy match (e.g. "Introductory Quiz (English)" vs "Introductory Quiz")
      const cleanCurTitle = curTitle.replace(/\s*\([^)]*\)/g, '').trim();
      const cleanItemTitle = itemTitle.replace(/\s*\([^)]*\)/g, '').trim();
      if (cleanCurTitle && cleanItemTitle && (cleanCurTitle === cleanItemTitle || cleanCurTitle.includes(cleanItemTitle) || cleanItemTitle.includes(cleanCurTitle))) {
        return true;
      }
    }
    if (itemFilename && curId && (itemFilename.includes(curId) || curId.includes(itemFilename.replace('.json', '')))) return true;
    return false;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-base sm:text-lg">
                {t(lang, 'importQuizModalTitle')}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {t(lang, 'importQuizModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Active Quiz in Memory Card */}
          {quizConfig && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-700">
                    {t(lang, 'currentQuizInMemoryHeading') || 'Aktivt quiz i minnet'}
                  </h4>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  {t(lang, 'activeInMemoryBadge') || 'Aktivt i minnet'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white to-indigo-50/40 border-2 border-emerald-500/80 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-black text-slate-900 text-base leading-snug">
                        {quizConfig.title || 'Namnlöst quiz'}
                      </h5>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                        <Check className="w-3 h-3" />
                        {t(lang, 'activeInMemoryBadge') || 'Aktivt i minnet'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {t(lang, 'currentQuizInMemoryDesc') || 'Detta quiz är för närvarande laddat i arbetsminnet.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <span className="text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full">
                      🧒 {quizConfig.barnQuestions?.length || 0} barn
                    </span>
                    <span className="text-[10px] font-black bg-pink-50 text-pink-800 border border-pink-200 px-2.5 py-1 rounded-full">
                      🧔 {quizConfig.vuxenQuestions?.length || 0} vuxna
                    </span>
                    <span className="text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full">
                      📋 {currentTotalQuestions} totalt
                    </span>
                    {currentGpsCount > 0 && (
                      <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-0.5">
                        <MapPin className="w-3 h-3 inline" /> {currentGpsCount} GPS
                      </span>
                    )}
                  </div>
                </div>

                {handleSaveCurrentQuizToDB && (
                  <div className="flex items-center justify-end pt-2 border-t border-slate-200/60">
                    <button
                      onClick={handleSaveCurrentQuizToDB}
                      disabled={isSavingToDb}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5 text-indigo-200" />
                      <span>{t(lang, 'saveCurrentToDbBtn')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick presets section */}
          {quizMetadataList.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                {t(lang, 'presetQuizzes')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quizMetadataList.map(meta => {
                  const isCurrent = isCurrentQuiz(meta);
                  return (
                    <button
                      key={meta.id}
                      onClick={() => {
                        handleLoadPresetQuiz(meta);
                        onClose();
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all group flex flex-col justify-between gap-3 cursor-pointer ${
                        isCurrent
                          ? 'bg-emerald-50/50 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                          : 'bg-white border-slate-200 hover:border-indigo-500/60 hover:bg-indigo-50/40 shadow-2xs hover:shadow-md'
                      }`}
                    >
                      <div>
                        <div className="font-black text-sm text-slate-800 group-hover:text-indigo-600 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={isCurrent ? 'text-slate-900 font-black' : ''}>{meta.title}</span>
                            {isCurrent && (
                              <span className="inline-flex items-center gap-1 bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                {t(lang, 'activeInMemoryBadge') || 'Aktivt i minnet'}
                              </span>
                            )}
                          </div>
                          <span className="text-xs shrink-0">{meta.language === 'en' ? '🇬🇧' : '🇸🇪'}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium line-clamp-2 mt-1">
                          {meta.description}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100/60">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400">
                          <span>{meta.barnCount || 0} barn</span>
                          <span>•</span>
                          <span>{meta.vuxenCount || 0} vuxna</span>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                          isCurrent
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors'
                        }`}>
                          {isCurrent ? <Check className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                          <span>{isCurrent ? (t(lang, 'reloadedQuizBtn') || 'Ladda om') : (t(lang, 'loadQuizBtn') || 'Ladda')}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Saved Quizzes in Local DB */}
          {savedQuizzes.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  <span>{t(lang, 'savedQuizzes')} ({savedQuizzes.length})</span>
                </h4>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {savedQuizzes.map(quiz => {
                  const isCurrent = isCurrentQuiz(quiz);
                  return (
                    <div
                      key={quiz.id}
                      className={`p-3 rounded-2xl flex items-center justify-between gap-3 transition-colors ${
                        isCurrent
                          ? 'bg-emerald-50/50 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/20'
                          : 'bg-slate-50 border border-slate-200/80 hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className={`font-black text-xs truncate ${isCurrent ? 'text-slate-900 font-black' : 'text-slate-800'}`}>
                            {quiz.title}
                          </h5>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              {t(lang, 'activeInMemoryBadge') || 'Aktivt i minnet'}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {new Date(quiz.updatedAt).toLocaleDateString()} • {quiz.barnCount} barn / {quiz.vuxenCount} vuxen
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            handleLoadQuizFromDB(quiz, true);
                            onClose();
                          }}
                          className={`px-3 py-1.5 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-2xs cursor-pointer ${
                            isCurrent
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-indigo-600 hover:bg-indigo-700'
                          }`}
                        >
                          {isCurrent ? <Check className="w-3 h-3 text-white" /> : <Download className="w-3 h-3" />}
                          <span>{isCurrent ? (t(lang, 'reloadedQuizBtn') || 'Ladda om') : (t(lang, 'loadQuizBtn') || 'Ladda')}</span>
                        </button>
                        <button
                          onClick={() => handleDeleteQuizFromDB(quiz.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl cursor-pointer"
                          title={t(lang, 'deleteQuizBtn')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paste JSON Config */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{t(lang, 'pasteJsonDirectly')}</span>
            </h4>
            <textarea
              value={configJsonInput}
              onChange={e => setConfigJsonInput(e.target.value)}
              placeholder="Klistra in quiz JSON här..."
              rows={4}
              className="w-full p-3 rounded-2xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  handleImportConfig();
                  onClose();
                }}
                disabled={!configJsonInput.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{t(lang, 'importConfigBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
