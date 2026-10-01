/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Edit2,
  Trash2,
  Check,
  Plus,
  Compass,
  MapPin,
  Map,
  HelpCircle,
  Sparkles,
  Award,
  Globe,
  Share2,
  Upload,
  ChevronDown,
  Download
} from 'lucide-react';
import { QuizConfig, Participant, UserType } from '../../types';
import { Language, t } from '../../i18n';
import { isReservedParticipantName } from '../../utils/answerSharing';
import { calculateDistanceMeters, formatDistance, calculateWalkingTimeMinutes } from '../../utils/geoUtils';

export interface SetupViewProps {
  lang: Language;
  quizConfig: QuizConfig;
  participants: Participant[];
  totalQuestions: number;
  getQuizAvailableLanguages: () => { code: Language; name: string; flag: string }[];
  addParticipant: (name: string, type: UserType) => void;
  setParticipantToDelete: (p: Participant | null) => void;
  updateParticipantName: (id: string, name: string) => void;
  validateAndFinalizeParticipantName: (id: string) => void;
  shareDirectQuizUrl: () => Promise<void>;
  shareParticipantAnswers: () => Promise<void>;
  onOpenImportAnswers?: () => void;
  setShowHowItWorks: (show: boolean) => void;
  isDirectLinkLocked: boolean;
  setView: (v: 'setup' | 'quiz' | 'results' | 'config') => void;
}

export const SetupView = React.memo<SetupViewProps>(({
  lang,
  quizConfig,
  participants,
  totalQuestions,
  getQuizAvailableLanguages,
  addParticipant,
  setParticipantToDelete,
  updateParticipantName,
  validateAndFinalizeParticipantName,
  shareDirectQuizUrl,
  shareParticipantAnswers,
  onOpenImportAnswers,
  setShowHowItWorks,
  isDirectLinkLocked,
  setView
}) => {
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [showParticipantActions, setShowParticipantActions] = useState(false);

  return (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1"
            >
              <div className="md:col-span-5 flex flex-col gap-4">
                <h2 className="text-indigo-100 text-xs font-bold uppercase tracking-widest px-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{t(lang, 'participantsTab')} ({participants.length})</span>
                </h2>
                <div className="bg-white rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4 flex-1 border border-indigo-200/50">
                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                    {participants.map(p => {
                      const isNameReserved = !p.name || !p.name.trim() || isReservedParticipantName(p.name);
                      return (
                        <div key={p.id} className={`p-4 rounded-2xl border-2 flex items-center justify-between group transition-all ${
                          isNameReserved ? 'bg-amber-50/90 border-amber-300' : 'bg-indigo-50/80 border-indigo-100'
                        }`}>
                          <div 
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            onClick={() => setEditingParticipantId(p.id)}
                          >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white shrink-0 ${
                              p.type === 'barn' ? 'bg-amber-400' : 'bg-pink-400'
                            }`}>
                              {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              {editingParticipantId === p.id ? (
                                <input 
                                  autoFocus
                                  className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1 text-sm font-black text-slate-800 outline-none focus:border-indigo-500"
                                  value={p.name}
                                  onChange={(e) => updateParticipantName(p.id, e.target.value)}
                                  onBlur={() => validateAndFinalizeParticipantName(p.id)}
                                  onKeyDown={(e) => e.key === 'Enter' && validateAndFinalizeParticipantName(p.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder={t(lang, 'writeNameHere') || 'Ange ditt namn'}
                                />
                              ) : (
                                <div>
                                  <p 
                                    className="font-black text-slate-800 leading-tight cursor-pointer hover:text-indigo-600 transition-colors truncate min-h-[1.2em]"
                                    title={t(lang, 'clickToEditName')}
                                  >
                                    {p.name}
                                  </p>
                                  {isNameReserved && (
                                    <p className="text-[10px] text-amber-700 font-bold leading-tight mt-0.5 flex items-center gap-1">
                                      <span>✏️ {lang === 'sv' ? 'Tryck här för att ange ditt namn' : 'Tap here to enter your name'}</span>
                                    </p>
                                  )}
                                </div>
                              )}
                              <span 
                                className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase inline-block mt-0.5 cursor-pointer transition-opacity hover:opacity-70 ${
                                  p.type === 'barn' ? 'bg-amber-100 text-amber-700' : 'bg-pink-100 text-pink-700'
                                }`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {p.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setParticipantToDelete(p);
                            }}
                            className="opacity-60 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 p-2"
                            title={t(lang, 'deleteParticipant')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500">{t(lang, 'addNewParticipant')}</p>
                    <input 
                      type="text" 
                      placeholder={t(lang, 'writeNameHere')}
                      className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-bold text-sm text-slate-800"
                      id="name-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const el = e.currentTarget;
                          addParticipant(el.value, 'vuxen');
                          el.value = '';
                          el.focus();
                        }
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => {
                          const el = document.getElementById('name-input') as HTMLInputElement;
                          if (el) {
                            addParticipant(el.value, 'barn');
                            el.value = '';
                            el.focus();
                          }
                        }}
                        className="py-3.5 bg-amber-400 hover:bg-amber-300 text-indigo-950 rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#d97706] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> {t(lang, 'kid')}
                      </button>
                      <button 
                        onClick={() => {
                          const el = document.getElementById('name-input') as HTMLInputElement;
                          if (el) {
                            addParticipant(el.value, 'vuxen');
                            el.value = '';
                            el.focus();
                          }
                        }}
                        className="py-3.5 bg-pink-400 hover:bg-pink-300 text-indigo-950 rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#db2777] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> {t(lang, 'adult')}
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowParticipantActions(prev => !prev)}
                        className="w-full flex items-center justify-between gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2.5 font-black text-[10px] uppercase tracking-wider transition-all"
                      >
                        <span className="flex items-center gap-2">
                          <Share2 className="w-4 h-4 text-indigo-600" />
                          <ChevronDown className={`w-4 h-4 transition-transform ${showParticipantActions ? 'rotate-180' : ''}`} />
                          <span>{showParticipantActions ? t(lang, 'hideLabel') : t(lang, 'moreLabel')}</span>
                        </span>
                        <span className="text-slate-400">{showParticipantActions ? '▴' : '▾'}</span>
                      </button>

                      {showParticipantActions && (
                        <div className="mt-2 grid grid-cols-1 gap-2">
                          <button
                            type="button"
                            onClick={shareDirectQuizUrl}
                            className="py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#4338ca] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>{lang === 'sv' ? 'Bjud in fler deltagare' : (t(lang, 'shareDirectLinkBtn')?.replace(/\(.*\)/, '').trim() || 'Invite participants')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={shareParticipantAnswers}
                            className="py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#047857] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>{t(lang, 'submitOurAnswersBtn')}</span>
                          </button>
                          {onOpenImportAnswers && (
                            <button
                              type="button"
                              onClick={onOpenImportAnswers}
                              className="py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#1d4ed8] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              <span>{t(lang, 'importAnswersBtn') || 'Läs in svar'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-7 flex flex-col justify-between p-4 sm:p-6 bg-white/10 backdrop-blur-md rounded-[2rem] border border-white/20 text-white space-y-4">
                <div className="space-y-3">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-transparent text-indigo-950 rounded-[1.5rem] flex items-center justify-center rotate-3 shadow-xl overflow-hidden border border-white/30">
                    <img src={`${import.meta.env.BASE_URL}HelFamilj.png`} alt={t(lang, 'familyWalkingAlt')} referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-4xl font-black leading-tight drop-shadow-md">
                      {t(lang, 'readyForWalk')}
                    </h2>
                    <p className="text-indigo-100 font-medium text-sm sm:text-base mt-2 opacity-90">
                      {t(lang, 'readyWalkDesc')}
                    </p>
                  </div>
                </div>

                <div className="bg-black/20 p-4 sm:p-5 rounded-2xl border border-white/10 space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-white/10">
                    <span className="text-indigo-200">{t(lang, 'totalQuestionsLabel')}</span>
                    <span className="font-black text-sm">{totalQuestions}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/10">
                    <span className="text-indigo-200">{t(lang, 'kidsQuestionsLabel')}</span>
                    <span className="font-bold text-amber-300">{quizConfig.barnQuestions.length}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/10">
                    <span className="text-indigo-200">{t(lang, 'adultsQuestionsLabel')}</span>
                    <span className="font-bold text-pink-300">{quizConfig.vuxenQuestions.length}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-indigo-200">{t(lang, 'geotaggedStations')}</span>
                    <span className="font-bold text-emerald-300">
                      {Array.from({ length: totalQuestions }).filter((_, idx) => quizConfig.barnQuestions[idx]?.location || quizConfig.vuxenQuestions[idx]?.location).length}
                    </span>
                  </div>

                  {(() => {
                    const quizLangsSummary = getQuizAvailableLanguages(quizConfig);
                    return (
                      <div className="pt-2.5 border-t border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-indigo-200 flex items-center gap-1.5 font-bold text-xs">
                            <Globe className="w-3.5 h-3.5 text-yellow-300" />
                            <span>{t(lang, 'quizLanguagesTitle')}</span>
                          </span>
                          <span className="text-[10px] font-black uppercase text-indigo-300 bg-white/10 px-2 py-0.5 rounded-full">
                            {quizLangsSummary.allLanguages.length} {t(lang, 'availableLanguagesLabel')?.toLowerCase()}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {quizLangsSummary.allLanguages.map(l => {
                            const isSelected = l.code === lang;
                            const qCount = quizLangsSummary.questionLanguageCounts[l.code] || 0;
                            return (
                              <span
                                key={l.code}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black transition-all shadow-sm ${
                                  isSelected
                                    ? 'bg-yellow-400 text-indigo-950 ring-2 ring-yellow-200 scale-105'
                                    : 'bg-white/15 text-white border border-white/20 hover:bg-white/25'
                                }`}
                                title={`${l.name} (${qCount}/${totalQuestions} ${t(lang, 'questionsShort') || 'frågor'})`}
                              >
                                <span className="text-sm leading-none">{l.flag}</span>
                                <span>{l.name}</span>
                                {isSelected && (
                                  <span className="text-[9px] font-black uppercase bg-indigo-950 text-yellow-300 px-1.5 py-0.5 rounded-md ml-0.5">
                                    Aktiv
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => setView('quiz')}
                    className="w-full py-5 bg-yellow-400 text-indigo-950 rounded-2xl font-black text-lg uppercase shadow-[0_6px_0_0_#b45309] hover:bg-yellow-300 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
                  >
                    <span>{t(lang, 'startQuizBtn')}</span>
                  </button>
                  <button 
                    onClick={() => setShowHowItWorks(true)}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm uppercase border border-white/20 transition-all flex items-center justify-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4" />
                    <span>{t(lang, 'howItWorksBtn')}</span>
                  </button>
                </div>
              </div>
            </motion.div>
  );
});
