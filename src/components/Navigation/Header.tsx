/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Users,
  MapPin,
  Trophy,
  Settings,
  FolderOpen,
  ChevronDown,
  Download,
  Lock
} from 'lucide-react';
import { Language, SUPPORTED_LANGUAGES, t } from '../../i18n';
import { QuizConfig } from '../../types';
import { defaultQuiz } from '../../data/defaultQuiz';
import { OfflineImage } from '../Common/OfflineImage';

export interface HeaderProps {
  lang: Language;
  quizConfig: QuizConfig;
  view: 'setup' | 'quiz' | 'results' | 'config';
  setView: (v: 'setup' | 'quiz' | 'results' | 'config') => void;
  handleQuizIconClick: () => void;
  isLanguageMenuOpen: boolean;
  setIsLanguageMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  languageMenuButtonRef: React.RefObject<HTMLButtonElement>;
  selectedLanguage: { code: Language; name: string; flag: string };
  deferredInstallPrompt: any;
  handleInstallPwa: () => void;
  isQuizModeLocked: boolean;
  isFacitUnlocked: boolean;
  isAdmin: boolean;
  getQuizAnswerProgress: () => { totalRequired: number; answeredCount: number; isAllAnswered: boolean };
  setShowConfigInput: (show: boolean) => void;
  setConfigTab: (tab: 'general' | 'questions' | 'ai' | 'db' | 'library') => void;
}

export const Header = React.memo<HeaderProps>(({
  lang,
  quizConfig,
  view,
  setView,
  handleQuizIconClick,
  isLanguageMenuOpen,
  setIsLanguageMenuOpen,
  languageMenuButtonRef,
  selectedLanguage,
  deferredInstallPrompt,
  handleInstallPwa,
  isQuizModeLocked,
  isFacitUnlocked,
  isAdmin,
  getQuizAnswerProgress,
  setShowConfigInput,
  setConfigTab
}) => {
  const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
  const { isAllAnswered } = getQuizAnswerProgress();
  const canShowMenus = !isQuizModeLocked || isFacitUnlocked || isAdmin || (!hasQuizPassword && isAllAnswered);

  return (
    <header className="flex flex-col gap-3 mb-3 sm:mb-5 bg-white/10 p-3 sm:p-4 rounded-[1.5rem] sm:rounded-[2rem] backdrop-blur-md border border-white/20 shadow-xl">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={handleQuizIconClick}
              className={
                quizConfig.logoUrl
                  ? "h-11 sm:h-12 w-auto max-w-[9.5rem] shrink-0 bg-transparent flex items-center justify-center cursor-default"
                  : "w-11 h-11 sm:w-12 sm:h-12 shrink-0 bg-transparent flex items-center justify-center cursor-default"
              }
              aria-label="Quiz"
            >
              {quizConfig.logoUrl ? (
                <>
                  <OfflineImage
                    src={quizConfig.logoUrl}
                    alt={`${quizConfig.title} logo`}
                    className="h-full w-auto max-w-full object-contain"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      const fallback = target.nextElementSibling as HTMLImageElement | null;
                      target.style.display = 'none';
                      if (fallback) {
                        fallback.style.display = 'block';
                      }
                    }}
                  />
                  <img
                    src={`${import.meta.env.BASE_URL}icon.png`}
                    alt="FamilyQuiz fallback icon"
                    referrerPolicy="no-referrer"
                    className="hidden h-full w-full object-cover"
                  />
                </>
              ) : (
                <>
                  <img
                    src={`${import.meta.env.BASE_URL}icon.png`}
                    alt="FamilyQuiz Icon"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      const fallback = target.nextElementSibling as HTMLImageElement | null;
                      target.style.display = 'none';
                      if (fallback) {
                        fallback.style.display = 'block';
                      }
                    }}
                  />
                  <img
                    src={`${import.meta.env.BASE_URL}icon.png`}
                    alt="FamilyQuiz fallback icon"
                    referrerPolicy="no-referrer"
                    className="hidden h-full w-full object-cover"
                  />
                </>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-black text-white leading-snug tracking-tight break-words [overflow-wrap:anywhere]">
                {quizConfig.title === defaultQuiz.title ? t(lang, 'defaultQuizTitle').toUpperCase() : quizConfig.title.toUpperCase()}
              </h1>
            </div>
          </div>

          {/* Language & PWA Controls */}
          <div className="flex items-center gap-2 shrink-0 ml-auto relative z-[1200]">
            <div className="relative z-[1300]" data-language-menu-root>
              <button
                ref={languageMenuButtonRef}
                type="button"
                onClick={() => setIsLanguageMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-white hover:bg-white/15 transition-all shadow-md relative z-[1400]"
                title={selectedLanguage.name}
                aria-label={`Selected language: ${selectedLanguage.name}`}
              >
                <span className="text-lg leading-none">{selectedLanguage.flag}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.22em]">{selectedLanguage.code}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isLanguageMenuOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {/* PWA Install Button when install prompt is available */}
            {deferredInstallPrompt && (
              <button
                onClick={handleInstallPwa}
                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95 animate-bounce"
                title={t(lang, 'pwaInstallBtn')}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t(lang, 'pwaInstallBtn')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Top View Selector Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-black/20 p-1.5 rounded-2xl border border-white/10 w-full overflow-visible">
          <button
            onClick={() => setView('setup')}
            className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              view === 'setup' 
                ? 'bg-white text-indigo-950 shadow-md scale-[1.02]' 
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t(lang, 'participantsTab')}</span>
          </button>

          <button
            onClick={() => setView('quiz')}
            className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              view === 'quiz' 
                ? 'bg-white text-indigo-950 shadow-md scale-[1.02]' 
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{t(lang, 'walkQuizTab')}</span>
          </button>

          <button
            onClick={() => setView('results')}
            className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
              view === 'results' 
                ? 'bg-white text-indigo-950 shadow-md scale-[1.02]' 
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>{t(lang, 'resultsTab')}</span>
          </button>

          {canShowMenus && (
            <button
              onClick={() => setView('config')}
              className={`flex-1 px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                view === 'config' 
                  ? 'bg-white text-indigo-950 shadow-md scale-[1.02]' 
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t(lang, 'edit')}</span>
            </button>
          )}

          {canShowMenus && (
            <button 
              onClick={() => {
                setShowConfigInput(true);
                setConfigTab('library');
              }}
              className="flex-1 px-3 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
              title={t(lang, 'libraryTitle')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t(lang, 'libraryTab')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
});
