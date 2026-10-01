/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings,
  Lock,
  Plus,
  HelpCircle,
  Sparkles,
  Database,
  X,
  Trash2
} from 'lucide-react';
import { Language, t } from '../../i18n';
import { QuizConfig, UserType, QuizMetadata, Location } from '../../types';
import { SavedQuizRecord } from '../../quizDb';
import { QuestionsEditorTab } from './QuestionsEditorTab';
import { AiGeneratorTab } from './AiGeneratorTab';
import { DatabaseAndLibraryTab } from './DatabaseAndLibraryTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { RouteGeoTagModal } from '../MapComponent';

export interface SettingsViewProps {
  lang: Language;
  quizConfig: QuizConfig;
  setQuizConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
  isConfigUnlocked: boolean;
  setIsConfigUnlocked: (unlocked: boolean) => void;
  isAdmin: boolean;
  setIsAdmin: (admin: boolean) => void;
  configMasterPasswordInput: string;
  setConfigMasterPasswordInput: (val: string) => void;
  setView: (v: 'setup' | 'quiz' | 'results' | 'config') => void;
  configTab: 'general' | 'questions' | 'ai' | 'db';
  setConfigTab: (tab: 'general' | 'questions' | 'ai' | 'db') => void;
  editingQuestionsCategory: UserType;
  setEditingQuestionsCategory: (c: UserType) => void;
  setShowCreateQuestionModal: (type: UserType | 'båda' | null) => void;
  showRouteGeoTagModal: boolean;
  setShowRouteGeoTagModal: (show: boolean) => void;
  setFullScreenEditingQuestionId: (id: string | null) => void;
  handleDuplicateQuestion?: (category: UserType, index: number) => void;
  handleDeleteQuestion?: (category: UserType, index: number) => void;
  handleMoveQuestion?: (category: UserType, index: number, direction: 'up' | 'down') => void;
  // AI Tab props
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  aiBarnCount: number;
  setAiBarnCount: (v: number) => void;
  aiVuxenCount: number;
  setAiVuxenCount: (v: number) => void;
  aiIncludeGeotags: boolean;
  setAiIncludeGeotags: (v: boolean) => void;
  aiUseImages: boolean;
  setAiUseImages: (v: boolean) => void;
  isGeneratingAi: boolean;
  handleGenerateQuizWithAI: () => Promise<void>;
  isBatchTranslating: boolean;
  batchTranslateProgress: { current: number; total: number; lang: string } | null;
  handleBatchTranslateQuiz: () => Promise<void>;
  pastedJsonInput: string;
  setPastedJsonInput: (v: string) => void;
  handleImportPastedJson: (json: string) => Promise<void>;
  showApiKeyInput: boolean;
  setShowApiKeyInput: (v: boolean | ((prev: boolean) => boolean)) => void;
  customApiKey: string;
  setCustomApiKey: (v: string) => void;
  handleSaveCustomApiKey: () => void;
  userLocation: { lat: number; lng: number } | null;
  // DB & Library Tab props
  savedQuizzes: SavedQuizRecord[];
  handleSaveCurrentQuizToDB: () => Promise<void>;
  isSavingToDb: boolean;
  handleShareExportDB: () => Promise<void>;
  handleImportBackupJSONFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleClearAllDB: () => Promise<void>;
  dbSearchQuery: string;
  setDbSearchQuery: (q: string) => void;
  dbFilterCategory: string;
  setDbFilterCategory: (c: string) => void;
  dbSortBy: 'date-desc' | 'date-asc' | 'name-asc';
  setDbSortBy: (s: 'date-desc' | 'date-asc' | 'name-asc') => void;
  handleLoadQuizFromDB: (item: SavedQuizRecord, closeModal?: boolean) => void;
  handleOverwriteQuizInDB: (id: string) => Promise<void>;
  handleDeleteQuizFromDB: (id: string) => Promise<void>;
  quizMetadataList: QuizMetadata[];
  librarySearchQuery: string;
  setLibrarySearchQuery: (q: string) => void;
  libraryFilterLanguage: string;
  setLibraryFilterLanguage: (l: string) => void;
  librarySortBy: 'name-asc' | 'date-desc' | 'count-desc';
  setLibrarySortBy: (s: 'name-asc' | 'date-desc' | 'count-desc') => void;
  isLoadingCatalog: boolean;
  catalogLoadError: string | null;
  handleLoadPresetQuiz: (meta: QuizMetadata) => void;
  configJsonInput: string;
  setConfigJsonInput: (v: string) => void;
  handleImportConfig: () => void;
  currentQuizId: string;
  catalogUrl?: string;
  onOpenUrlHelpModal?: () => void;
  // General Tab props
  showCreateNewQuizConfirm: boolean;
  setShowCreateNewQuizConfirm: (show: boolean) => void;
  handleCreateNewQuizConfirm: () => void;
  showResetConfirm: boolean;
  setShowResetConfirm: (show: boolean) => void;
  handleResetQuiz: () => void;
  showClearConfirm: boolean;
  setShowClearConfirm: (show: boolean) => void;
  handleClearAllData: () => void;
  showSettingsHelp: boolean;
  setShowSettingsHelp: (show: boolean) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveLogo: () => void;
  directLinkLockMode: boolean;
  setDirectLinkLockMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  directLinkLockOrderMode: boolean;
  setDirectLinkLockOrderMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  shareDirectQuizUrl: () => Promise<void>;
  copiedDirectUrlCode: boolean;
  setCopiedDirectUrlCode: (v: boolean) => void;
  directUrlLength: number;
  newQuizTitle: string;
  setNewQuizTitle: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  newGeotagDistance: number;
  setNewGeotagDistance: (v: number) => void;
  handleApplyBatchRouteLocations: (locs: { id: string; location: Location }[]) => void;
  walkId?: string;
}

export const SettingsView = React.memo<SettingsViewProps>(({
  lang,
  quizConfig,
  setQuizConfig,
  isConfigUnlocked,
  setIsConfigUnlocked,
  isAdmin,
  setIsAdmin,
  configMasterPasswordInput,
  setConfigMasterPasswordInput,
  setView,
  configTab,
  setConfigTab,
  editingQuestionsCategory,
  setEditingQuestionsCategory,
  setShowCreateQuestionModal,
  showRouteGeoTagModal,
  setShowRouteGeoTagModal,
  setFullScreenEditingQuestionId,
  handleDuplicateQuestion,
  handleDeleteQuestion,
  handleMoveQuestion,
  aiPrompt,
  setAiPrompt,
  aiBarnCount,
  setAiBarnCount,
  aiVuxenCount,
  setAiVuxenCount,
  aiIncludeGeotags,
  setAiIncludeGeotags,
  aiUseImages,
  setAiUseImages,
  isGeneratingAi,
  handleGenerateQuizWithAI,
  isBatchTranslating,
  batchTranslateProgress,
  handleBatchTranslateQuiz,
  pastedJsonInput,
  setPastedJsonInput,
  handleImportPastedJson,
  showApiKeyInput,
  setShowApiKeyInput,
  customApiKey,
  setCustomApiKey,
  handleSaveCustomApiKey,
  userLocation,
  savedQuizzes,
  handleSaveCurrentQuizToDB,
  isSavingToDb,
  handleShareExportDB,
  handleImportBackupJSONFile,
  handleClearAllDB,
  dbSearchQuery,
  setDbSearchQuery,
  dbFilterCategory,
  setDbFilterCategory,
  dbSortBy,
  setDbSortBy,
  handleLoadQuizFromDB,
  handleOverwriteQuizInDB,
  handleDeleteQuizFromDB,
  quizMetadataList,
  librarySearchQuery,
  setLibrarySearchQuery,
  libraryFilterLanguage,
  setLibraryFilterLanguage,
  librarySortBy,
  setLibrarySortBy,
  isLoadingCatalog,
  catalogLoadError,
  handleLoadPresetQuiz,
  configJsonInput,
  setConfigJsonInput,
  handleImportConfig,
  currentQuizId,
  catalogUrl,
  onOpenUrlHelpModal,
  showCreateNewQuizConfirm,
  setShowCreateNewQuizConfirm,
  handleCreateNewQuizConfirm,
  showResetConfirm,
  setShowResetConfirm,
  handleResetQuiz,
  showClearConfirm,
  setShowClearConfirm,
  handleClearAllData,
  showSettingsHelp,
  setShowSettingsHelp,
  handleLogoUpload,
  handleRemoveLogo,
  directLinkLockMode,
  setDirectLinkLockMode,
  directLinkLockOrderMode,
  setDirectLinkLockOrderMode,
  shareDirectQuizUrl,
  copiedDirectUrlCode,
  setCopiedDirectUrlCode,
  directUrlLength,
  newQuizTitle,
  setNewQuizTitle,
  newPassword,
  setNewPassword,
  newGeotagDistance,
  setNewGeotagDistance,
  handleApplyBatchRouteLocations,
  walkId
}) => {
  return (
    <motion.div
      key="config"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {!isConfigUnlocked && (quizConfig.password || 'Password') ? (
        <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-8 border border-slate-200/80 shadow-xl text-center space-y-6 max-w-md mx-auto">
          <div className="w-16 h-16 bg-slate-900 text-white rounded-3xl mx-auto flex items-center justify-center shadow-lg">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-800">{t(lang, 'settingsProtectedTitle')}</h2>
            <p className="text-sm text-slate-500 font-medium">{t(lang, 'settingsProtectedDesc')}</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              placeholder={t(lang, 'passwordPlaceholder')}
              value={configMasterPasswordInput}
              onChange={(e) => setConfigMasterPasswordInput(e.target.value)}
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center font-black tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (configMasterPasswordInput === 'Password') {
                    setIsConfigUnlocked(true);
                    setIsAdmin(true);
                    setConfigTab('general');
                  } else {
                    alert(t(lang, 'wrongPasswordAlert'));
                  }
                }
              }}
            />
            <button
              onClick={() => {
                if (configMasterPasswordInput === 'Password') {
                  setIsConfigUnlocked(true);
                  setIsAdmin(true);
                  setConfigTab('general');
                } else {
                  alert(t(lang, 'wrongPasswordAlert'));
                }
              }}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors"
            >
              {t(lang, 'unlockSettingsBtn')}
            </button>
            <button
              onClick={() => setView('setup')}
              className="w-full py-2 text-slate-400 text-sm hover:underline"
            >
              {t(lang, 'cancelBtn')}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-5 sm:p-8 border border-indigo-200/50 shadow-2xl space-y-6">
          {/* Top Bar / Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-md">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">{t(lang, 'settingsTitle')}</h2>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{quizConfig.title || 'Tipspromenad'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCreateNewQuizConfirm(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase flex items-center gap-1.5 shadow-sm transition-all active:scale-95 shrink-0"
                  title={t(lang, 'createNewQuizBtn')}
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">{t(lang, 'createNewQuizBtn')}</span>
                </button>
              )}
              <button
                onClick={() => setShowSettingsHelp(true)}
                className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-100 transition-colors active:scale-95 shadow-sm border border-indigo-200/50"
                title={t(lang, 'settingsHelpTitle')}
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setView('setup');
                  setConfigMasterPasswordInput('');
                }}
                className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors font-black text-lg active:scale-95"
                title={t(lang, 'closeSettingsBtn')}
              >
                ×
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60">
            <button
              onClick={() => setConfigTab('general')}
              className={'py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ' + (
                configTab === 'general'
                  ? 'bg-white text-indigo-600 shadow-md border border-indigo-100'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <Settings className="w-4 h-4" />
              <span>{t(lang, 'generalTab')}</span>
            </button>

            <button
              onClick={() => setConfigTab('questions')}
              className={'py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ' + (
                configTab === 'questions'
                  ? 'bg-white text-indigo-600 shadow-md border border-indigo-100'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <HelpCircle className="w-4 h-4" />
              <span>{t(lang, 'questionsTab')}</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setConfigTab('ai')}
                className={'py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ' + (
                  configTab === 'ai'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                <Sparkles className="w-4 h-4" />
                <span>{t(lang, 'aiTab')}</span>
              </button>
            )}

            <button
              onClick={() => setConfigTab('db')}
              className={'py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ' + (
                configTab === 'db'
                  ? 'bg-white text-indigo-600 shadow-md border border-indigo-100'
                  : 'text-slate-500 hover:text-slate-800'
              )}
            >
              <Database className="w-4 h-4" />
              <span>{t(lang, 'dbTab')}</span>
            </button>
          </div>

          {/* Sub Tab Contents */}
          {configTab === 'questions' && (
            <QuestionsEditorTab
              quizConfig={quizConfig}
              setQuizConfig={setQuizConfig}
              editingQuestionsCategory={editingQuestionsCategory}
              setEditingQuestionsCategory={setEditingQuestionsCategory}
              setShowCreateQuestionModal={setShowCreateQuestionModal}
              setShowRouteGeoTagModal={setShowRouteGeoTagModal}
              setFullScreenEditingQuestionId={setFullScreenEditingQuestionId}
              handleDuplicateQuestion={handleDuplicateQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleMoveQuestion={handleMoveQuestion}
              isAdmin={isAdmin}
              lang={lang}
              isBatchTranslating={isBatchTranslating}
              handleBatchTranslateQuiz={handleBatchTranslateQuiz}
            />
          )}

          {configTab === 'ai' && (
            <AiGeneratorTab
              lang={lang}
              quizConfig={quizConfig}
              setQuizConfig={setQuizConfig}
              aiPrompt={aiPrompt}
              setAiPrompt={setAiPrompt}
              aiBarnCount={aiBarnCount}
              setAiBarnCount={setAiBarnCount}
              aiVuxenCount={aiVuxenCount}
              setAiVuxenCount={setAiVuxenCount}
              aiIncludeGeotags={aiIncludeGeotags}
              setAiIncludeGeotags={setAiIncludeGeotags}
              aiUseImages={aiUseImages}
              setAiUseImages={setAiUseImages}
              isGeneratingAi={isGeneratingAi}
              handleGenerateQuizWithAI={handleGenerateQuizWithAI}
              isBatchTranslating={isBatchTranslating}
              batchTranslateProgress={batchTranslateProgress}
              handleBatchTranslateQuiz={handleBatchTranslateQuiz}
              pastedJsonInput={pastedJsonInput}
              setPastedJsonInput={setPastedJsonInput}
              handleImportPastedJson={handleImportPastedJson}
              showApiKeyInput={showApiKeyInput}
              setShowApiKeyInput={setShowApiKeyInput}
              customApiKey={customApiKey}
              setCustomApiKey={setCustomApiKey}
              handleSaveCustomApiKey={handleSaveCustomApiKey}
              userLocation={userLocation}
            />
          )}

          {configTab === 'db' && (
            <DatabaseAndLibraryTab
              lang={lang}
              quizConfig={quizConfig}
              savedQuizzes={savedQuizzes}
              handleSaveCurrentQuizToDB={handleSaveCurrentQuizToDB}
              isSavingToDb={isSavingToDb}
              handleShareExportDB={handleShareExportDB}
              handleImportBackupJSONFile={handleImportBackupJSONFile}
              handleClearAllDB={handleClearAllDB}
              dbSearchQuery={dbSearchQuery}
              setDbSearchQuery={setDbSearchQuery}
              dbFilterCategory={dbFilterCategory}
              setDbFilterCategory={setDbFilterCategory}
              dbSortBy={dbSortBy}
              setDbSortBy={setDbSortBy}
              handleLoadQuizFromDB={handleLoadQuizFromDB}
              handleOverwriteQuizInDB={handleOverwriteQuizInDB}
              handleDeleteQuizFromDB={handleDeleteQuizFromDB}
              quizMetadataList={quizMetadataList}
              librarySearchQuery={librarySearchQuery}
              setLibrarySearchQuery={setLibrarySearchQuery}
              libraryFilterLanguage={libraryFilterLanguage}
              setLibraryFilterLanguage={setLibraryFilterLanguage}
              librarySortBy={librarySortBy}
              setLibrarySortBy={setLibrarySortBy}
              isLoadingCatalog={isLoadingCatalog}
              catalogLoadError={catalogLoadError}
              handleLoadPresetQuiz={handleLoadPresetQuiz}
              configJsonInput={configJsonInput}
              setConfigJsonInput={setConfigJsonInput}
              handleImportConfig={handleImportConfig}
              currentQuizId={currentQuizId}
              catalogUrl={catalogUrl}
              onOpenUrlHelpModal={onOpenUrlHelpModal}
            />
          )}

          {configTab === 'general' && (
            <GeneralSettingsTab
              lang={lang}
              quizConfig={quizConfig}
              setQuizConfig={setQuizConfig}
              isAdmin={isAdmin}
              setShowCreateNewQuizConfirm={setShowCreateNewQuizConfirm}
              showCreateNewQuizConfirm={showCreateNewQuizConfirm}
              handleCreateNewQuizConfirm={handleCreateNewQuizConfirm}
              showResetConfirm={showResetConfirm}
              setShowResetConfirm={setShowResetConfirm}
              handleResetQuiz={handleResetQuiz}
              showClearConfirm={showClearConfirm}
              setShowClearConfirm={setShowClearConfirm}
              handleClearAllData={handleClearAllData}
              showSettingsHelp={showSettingsHelp}
              setShowSettingsHelp={setShowSettingsHelp}
              handleLogoUpload={handleLogoUpload}
              handleRemoveLogo={handleRemoveLogo}
              directLinkLockMode={directLinkLockMode}
              setDirectLinkLockMode={setDirectLinkLockMode}
              directLinkLockOrderMode={directLinkLockOrderMode}
              setDirectLinkLockOrderMode={setDirectLinkLockOrderMode}
              shareDirectQuizUrl={shareDirectQuizUrl}
              copiedDirectUrlCode={copiedDirectUrlCode}
              setCopiedDirectUrlCode={setCopiedDirectUrlCode}
              directUrlLength={directUrlLength}
              newQuizTitle={newQuizTitle}
              setNewQuizTitle={setNewQuizTitle}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              newGeotagDistance={newGeotagDistance}
              setNewGeotagDistance={setNewGeotagDistance}
              walkId={walkId}
            />
          )}
        </div>
      )}

      {/* Route GeoTag Modal */}
      {showRouteGeoTagModal && (
        <RouteGeoTagModal
          isOpen={showRouteGeoTagModal}
          onClose={() => setShowRouteGeoTagModal(false)}
          barnQuestions={quizConfig.barnQuestions}
          vuxenQuestions={quizConfig.vuxenQuestions}
          userLocation={userLocation}
          onApplyGeoTags={handleApplyBatchRouteLocations}
          lang={lang}
        />
      )}

      {/* Create New Quiz Confirmation Modal */}
      <AnimatePresence>
        {showCreateNewQuizConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateNewQuizConfirm(false)}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-white shadow-2xl"
            >
              <div className="bg-emerald-600 p-7 text-white sm:p-8">
                <button
                  type="button"
                  onClick={() => setShowCreateNewQuizConfirm(false)}
                  className="absolute right-6 top-6 rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-black">{t(lang, 'createNewQuizBtn')}</h2>
              </div>
              <div className="space-y-5 p-7 sm:p-8">
                <p className="text-sm font-medium leading-relaxed text-slate-500">
                  {lang === 'sv' 
                    ? 'Är du säker på att du vill skapa ett nytt quiz? Detta kommer att helt rensa nuvarande frågor, svar och deltagare.' 
                    : 'Are you sure you want to create a new quiz? This will completely clear all current questions, answers, and participants.'}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateNewQuizConfirm(false)}
                    className="flex-1 rounded-2xl bg-slate-100 py-3.5 text-xs font-black uppercase text-slate-600 hover:bg-slate-200"
                  >
                    {t(lang, 'cancelBtn') || 'Avbryt'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleCreateNewQuizConfirm();
                      setShowCreateNewQuizConfirm(false);
                    }}
                    className="flex-1 rounded-2xl bg-emerald-600 py-3.5 text-xs font-black uppercase text-white hover:bg-emerald-700 shadow-md shadow-emerald-100 animate-none"
                  >
                    {t(lang, 'confirm') || 'Ja, skapa'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear All Data Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-white shadow-2xl"
            >
              <div className="bg-rose-600 p-7 text-white sm:p-8">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="absolute right-6 top-6 rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                  <Trash2 className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-black">{t(lang, 'clearAllDataBtn')}</h2>
              </div>
              <div className="space-y-5 p-7 sm:p-8">
                <p className="text-sm font-medium leading-relaxed text-slate-500">
                  {lang === 'sv'
                    ? 'Är du säker på att du vill rensa alla svar och deltagare? Denna åtgärd kan inte ångras.'
                    : 'Are you sure you want to clear all answers and participants? This action cannot be undone.'}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 rounded-2xl bg-slate-100 py-3.5 text-xs font-black uppercase text-slate-600 hover:bg-slate-200"
                  >
                    {t(lang, 'cancelBtn') || 'Avbryt'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleClearAllData();
                      setShowClearConfirm(false);
                    }}
                    className="flex-1 rounded-2xl bg-rose-600 py-3.5 text-xs font-black uppercase text-white hover:bg-rose-700 shadow-md shadow-rose-100 animate-none"
                  >
                    {t(lang, 'confirm') || 'Ja, rensa'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
