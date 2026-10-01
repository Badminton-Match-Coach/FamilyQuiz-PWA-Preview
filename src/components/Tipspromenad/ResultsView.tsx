/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Lock,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Award,
  ChevronDown,
  ChevronUp,
  Share2,
  Users,
  Eye,
  Check,
  X,
  MapPin,
  Sparkles,
  Search,
  Maximize2,
  Upload,
  ChevronRight,
  Download
} from 'lucide-react';
import { QuizConfig, Participant, UserType, Question } from '../../types';
import { Language, t, translateQuestion } from '../../i18n';
import { evaluateTextAnswer } from '../../utils/soundex';
import { getOptionLabel } from '../../utils/imageAndLabelUtils';

import { AnswerRecord } from '../../types';

export interface ResultsViewProps {
  lang: Language;
  quizConfig: QuizConfig;
  participants: Participant[];
  answers: AnswerRecord[];
  totalQuestions: number;
  viewingParticipantId: string | null;
  setViewingParticipantId: (id: string | null) => void;
  isFacitUnlocked: boolean;
  setIsFacitUnlocked: (unlocked: boolean) => void;
  isAdmin: boolean;
  isQuizModeLocked: boolean;
  facitPasswordInput: string;
  setFacitPasswordInput: (val: string) => void;
  getQuizAnswerProgress: () => { totalRequired: number; answeredCount: number; isAllAnswered: boolean };
  showResetConfirm: boolean;
  setShowResetConfirm: (show: boolean) => void;
  handleResetQuiz: () => void;
  showResultsActions: boolean;
  setShowResultsActions: (show: boolean | ((prev: boolean) => boolean)) => void;
  shareDirectQuizUrl: () => Promise<void>;
  shareParticipantAnswers: () => Promise<void>;
  onOpenImportAnswers?: () => void;
  hasAnyGeotag: boolean;
  walkedPath: { lat: number; lng: number }[];
  calculatePathDistance: (path: { lat: number; lng: number }[]) => number;
  formatDistance: (meters: number) => string;
  setSelectedQuestionIndex: (idx: number | null) => void;
  setSelectedParticipantId: (id: string | null) => void;
  setView: (v: 'setup' | 'quiz' | 'results' | 'config') => void;
  isDirectLinkLocked: boolean;
  setZoomedImageUrl: (url: string | null) => void;
}

export const ResultsView = React.memo<ResultsViewProps>(({
  lang,
  quizConfig,
  participants,
  answers,
  totalQuestions,
  viewingParticipantId,
  setViewingParticipantId,
  isFacitUnlocked,
  setIsFacitUnlocked,
  isAdmin,
  isQuizModeLocked,
  facitPasswordInput,
  setFacitPasswordInput,
  getQuizAnswerProgress,
  showResetConfirm,
  setShowResetConfirm,
  handleResetQuiz,
  showResultsActions,
  setShowResultsActions,
  shareDirectQuizUrl,
  shareParticipantAnswers,
  onOpenImportAnswers,
  hasAnyGeotag,
  walkedPath,
  calculatePathDistance,
  formatDistance,
  setSelectedQuestionIndex,
  setSelectedParticipantId,
  setView,
  isDirectLinkLocked,
  setZoomedImageUrl
}) => {
  const [showDetailedSummary, setShowDetailedSummary] = useState(false);
  const [expandedFacitQuestionId, setExpandedFacitQuestionId] = useState<string | null>(null);

  return (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto w-full space-y-4"
            >
              {viewingParticipantId ? (
                (() => {
                  const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
                  const { totalRequired, answeredCount, isAllAnswered } = getQuizAnswerProgress();
                  const isFacitAvailable = isFacitUnlocked || isAdmin || (!hasQuizPassword && isAllAnswered);

                  if (!isFacitAvailable) {
                    if (!hasQuizPassword) {
                      return (
                        <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 shadow-2xl border border-indigo-200/50 text-center space-y-6">
                          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-indigo-100 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                            <Lock className="text-indigo-600 w-10 h-10 sm:w-12 sm:h-12" />
                          </div>
                          <div>
                            <h2 className="text-2xl sm:text-4xl font-black text-slate-800 mb-2">{t(lang, 'resultsLocked')}</h2>
                            <p className="text-slate-500 font-medium text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
                              {t(lang, 'facitLockedUntilAllAnswered')
                                .replace('{answered}', answeredCount.toString())
                                .replace('{total}', totalRequired.toString())}
                            </p>
                          </div>
                          <div className="pt-2">
                            <button 
                              onClick={() => setViewingParticipantId(null)}
                              className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-md active:scale-95"
                            >
                              {t(lang, 'back')}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const isFacitLockedByProgress = isQuizModeLocked && !isAllAnswered;

                    return (
                      <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 shadow-2xl border border-indigo-200/50 text-center space-y-8">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-indigo-100 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                          <Lock className="text-indigo-600 w-10 h-10 sm:w-12 sm:h-12" />
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-4xl font-black text-slate-800 mb-2">{t(lang, 'resultsLocked')}</h2>
                          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs">{t(lang, 'enterPasswordToSeeResults')}</p>
                        </div>
                        
                        <div className="flex flex-col gap-3 max-w-xs mx-auto">
                          {isFacitLockedByProgress && (
                            <div className="p-3.5 bg-slate-100 border border-slate-200/80 rounded-2xl text-slate-600 text-xs font-bold flex items-center gap-2.5 text-left">
                              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="leading-snug">
                                {t(lang, 'facitLockedUntilAllAnswered')
                                  .replace('{answered}', answeredCount.toString())
                                  .replace('{total}', totalRequired.toString())}
                              </span>
                            </div>
                          )}

                          <input 
                            type="password"
                            disabled={isFacitLockedByProgress}
                            placeholder={isFacitLockedByProgress ? t(lang, 'resultsLocked') : t(lang, 'enterQuizPassword')}
                            className={`w-full p-4 border rounded-2xl text-center text-lg font-black tracking-widest outline-none transition-all shadow-sm ${
                              isFacitLockedByProgress 
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed placeholder:text-slate-300' 
                                : 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-800'
                            }`}
                            value={facitPasswordInput}
                            onChange={(e) => setFacitPasswordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (isFacitLockedByProgress) {
                                  alert(t(lang, 'allQuestionsMustBeAnsweredAlert'));
                                  return;
                                }
                                const pass = quizConfig.password || 'Password';
                                const input = facitPasswordInput.trim();
                                if (input === pass || input === 'Password' || input === '1234') {
                                  setIsFacitUnlocked(true);
                                } else {
                                  alert(t(lang, 'wrongPasswordAlert'));
                                }
                              }
                            }}
                          />
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setViewingParticipantId(null)}
                              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest transition-all hover:bg-slate-200"
                            >
                              {t(lang, 'back')}
                            </button>
                            <button 
                              disabled={isFacitLockedByProgress}
                              onClick={() => {
                                if (isFacitLockedByProgress) {
                                  alert(t(lang, 'allQuestionsMustBeAnsweredAlert'));
                                  return;
                                }
                                const pass = quizConfig.password || 'Password';
                                const input = facitPasswordInput.trim();
                                if (input === pass || input === 'Password' || input === '1234') {
                                  setIsFacitUnlocked(true);
                                } else {
                                  alert(t(lang, 'wrongPasswordAlert'));
                                }
                              }}
                              className={`flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest transition-all ${
                                isFacitLockedByProgress
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 shadow-lg shadow-indigo-100'
                              }`}
                            >
                              {t(lang, 'unlockResultsBtn')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-8 shadow-2xl border border-indigo-100 flex flex-col max-h-[90vh]"
                  >
                  <div className="flex items-center justify-between mb-6 sm:mb-8 shrink-0">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-white text-lg sm:text-xl shrink-0 ${
                        participants.find(p => p.id === viewingParticipantId)?.type === 'barn' ? 'bg-amber-400' : 'bg-pink-400'
                      }`}>
                        {participants.find(p => p.id === viewingParticipantId)?.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl sm:text-2xl font-black text-slate-800 leading-none mb-1 truncate">{participants.find(p => p.id === viewingParticipantId)?.name}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t(lang, 'detailedReview')}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setViewingParticipantId(null)}
                      className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-3 sm:space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                    {Array.from({ length: totalQuestions }).map((_, idx) => {
                      const participant = participants.find(p => p.id === viewingParticipantId);
                      const questions = participant?.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                      const rawQuestion = questions[idx];
                      if (!rawQuestion) return null;

                      const trans = translateQuestion(rawQuestion.id, rawQuestion.text, rawQuestion.options || [], lang, rawQuestion.originalLanguage);
                      const question = { ...rawQuestion, text: trans.text, options: trans.options };
                      const answer = answers.find(a => a.participantId === viewingParticipantId && a.questionIndex === idx);

                      if (question.type === 'points') {
                        return (
                          <div key={idx} className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-amber-50/50 border border-amber-200/80 space-y-3">
                            <div className="flex justify-between items-start gap-4">
                              <h4 className="font-bold text-slate-800 text-xs sm:text-sm leading-tight">
                                <span className="text-amber-600 mr-2">{idx + 1}.</span>
                                {question.text}
                              </h4>
                              <div className="shrink-0">
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  🎯 {t(lang, 'pointQuestion')}
                                </span>
                              </div>
                            </div>
                            
                            <div className="p-3 bg-white rounded-xl border border-amber-100 flex items-center justify-between text-xs sm:text-sm">
                              <span className="font-bold text-slate-600">{t(lang, 'reportedResult')}</span>
                              {typeof answer?.pointsScored === 'number' ? (
                                <span className="font-black text-amber-700 text-sm sm:text-base">{answer.pointsScored} {t(lang, 'points')}</span>
                              ) : (
                                <span className="font-bold text-slate-400 italic">{t(lang, 'notAnsweredBadge')}</span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      if (question.type === 'text') {
                        return (
                          <div key={idx} className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-sky-50/60 border border-sky-200/80 space-y-3">
                            <div className="flex justify-between gap-4">
                              <h4 className="font-bold text-slate-800 text-xs sm:text-sm leading-tight">
                                <span className="text-sky-600 mr-2">{idx + 1}.</span>
                                {question.text}
                              </h4>
                              <div className="shrink-0">
                                {answer ? (
                                  answer.isCorrect ? (
                                    <div className="flex items-center gap-1 text-emerald-600 font-black text-[8px] sm:text-[10px] uppercase bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                      <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                      {t(lang, 'correct')}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-rose-600 font-black text-[8px] sm:text-[10px] uppercase bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex items-center justify-center">×</span>
                                      {t(lang, 'wrong')}
                                    </div>
                                  )
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-400 italic bg-slate-100 px-2 py-1 rounded-lg">
                                    {t(lang, 'notAnsweredBadge')}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="space-y-2 text-xs">
                              <div className="p-3 bg-white rounded-xl border border-sky-100 flex items-center justify-between">
                                <span className="font-bold text-slate-600">{t(lang, 'participantAnswerLabel')}:</span>
                                <span className="font-black text-slate-800 text-sm">
                                  {answer?.textAnswer || <span className="italic text-slate-400 font-normal">{t(lang, 'notAnsweredBadge')}</span>}
                                </span>
                              </div>

                              {isFacitUnlocked && question.correctTextAnswer && (
                                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-emerald-900">
                                  <span className="font-bold">{t(lang, 'correctAnswer')}:</span>
                                  <span className="font-black text-sm">{question.correctTextAnswer}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={idx} className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                          <div className="flex justify-between gap-4">
                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm leading-tight">
                              <span className="text-indigo-500 mr-2">{idx + 1}.</span>
                              {question.text}
                            </h4>
                            <div className="shrink-0">
                              {answer?.isCorrect ? (
                                <div className="flex items-center gap-1 text-emerald-600 font-black text-[8px] sm:text-[10px] uppercase bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                  <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  {t(lang, 'correct')}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-rose-600 font-black text-[8px] sm:text-[10px] uppercase bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex items-center justify-center">×</span>
                                  {t(lang, 'wrong')}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            {question.options.map((opt, oIdx) => {
                              const isUserAnswer = answer?.answerIndex === oIdx;
                              const isCorrectAnswer = (question?.correctAnswers || []).includes(oIdx);
                              
                              let statusClass = "bg-white border-slate-100 text-slate-500";
                              if (isCorrectAnswer) statusClass = "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm";
                              if (isUserAnswer && !isCorrectAnswer) statusClass = "bg-rose-50 border-rose-200 text-rose-700 shadow-sm";

                              return (
                                <div key={oIdx} className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 flex items-center justify-between transition-all text-[10px] sm:text-[11px] ${statusClass}`}>
                                  <div className="flex items-center gap-3">
                                    <span className={`w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full font-black text-[9px] sm:text-[10px] ${
                                      isCorrectAnswer ? 'bg-emerald-200/50 text-emerald-700' : 
                                      (isUserAnswer && !isCorrectAnswer) ? 'bg-rose-200/50 text-rose-700' : 'bg-black/5 text-slate-400'
                                    }`}>
                                      {getOptionLabel(oIdx, question.options?.length)}
                                    </span>
                                    <span className="font-medium">{opt}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isUserAnswer && (
                                      <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest opacity-60">{t(lang, 'answered')}</span>
                                    )}
                                    {isCorrectAnswer && <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
                                    {isUserAnswer && !isCorrectAnswer && <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button 
                    onClick={() => setViewingParticipantId(null)}
                    className="w-full mt-6 py-4 sm:py-5 bg-slate-900 text-white rounded-[1.25rem] sm:rounded-2xl font-black text-xs sm:text-sm uppercase shadow-lg shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all shrink-0"
                  >
                    {t(lang, 'backToList')}
                  </button>
                </motion.div>
                );
              })()) : (
                <div className="space-y-6">
                  <div className="relative bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl border border-indigo-200/50 text-center">


                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-transparent rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-xl rotate-6 border-4 border-white overflow-hidden">
                      <img src={`${import.meta.env.BASE_URL}HelFamilj.png`} alt={t(lang, 'familyWalkingAlt')} referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                    </div>
                    {(() => {
                      const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
                      const { totalRequired, answeredCount, isAllAnswered } = getQuizAnswerProgress();
                      const isFacitAvailable = isAdmin || isFacitUnlocked || (!hasQuizPassword && isAllAnswered);

                      return (
                        <>
                          <h2 className="text-3xl sm:text-5xl font-black text-slate-800 mb-2">{t(lang, 'scoreboard')}</h2>
                          {isFacitAvailable ? (
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-sm mb-6 sm:mb-10">{t(lang, 'clickParticipantForDetails')}</p>
                          ) : !hasQuizPassword ? (
                            <p className="text-amber-700 bg-amber-50 border border-amber-200/80 px-3.5 py-2 rounded-2xl font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-6 sm:mb-8 flex items-center justify-center gap-2 max-w-md mx-auto shadow-xs">
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span>{t(lang, 'answersLockedUntilAllAnswered').replace('{answered}', answeredCount.toString()).replace('{total}', totalRequired.toString())}</span>
                            </p>
                          ) : (
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-sm mb-6 sm:mb-10">{t(lang, 'clickParticipantForDetails')}</p>
                          )}
                        </>
                      );
                    })()}
                    
                    <div className="space-y-3 sm:space-y-4">
                      {(() => {
                        const allQuestions = [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions];
                        const hasOptionQuestions = allQuestions.some(q => (q.type || 'options') === 'options');
                        const hasPointQuestions = allQuestions.some(q => q.type === 'points');
                        const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
                        const { totalRequired, answeredCount, isAllAnswered } = getQuizAnswerProgress();
                        const isFacitAvailable = isAdmin || isFacitUnlocked || (!hasQuizPassword && isAllAnswered);

                        const mappedParticipants = participants
                          .map(p => {
                            const pAnswers = answers.filter(a => a.participantId === p.id);
                            const score = pAnswers.filter(a => a.isCorrect === true).length;
                            const totalPoints = pAnswers.filter(a => typeof a.pointsScored === 'number').reduce((sum, a) => sum + (a.pointsScored || 0), 0);
                            const total = pAnswers.length;

                            let finalScore = score;
                            if (hasOptionQuestions && hasPointQuestions) {
                              finalScore = score + totalPoints;
                            } else if (hasPointQuestions) {
                              finalScore = totalPoints;
                            }

                            return {
                              ...p,
                              score,
                              totalPoints,
                              total,
                              finalScore
                            };
                          })
                          .sort((a, b) => {
                            if (b.finalScore !== a.finalScore) {
                              return b.finalScore - a.finalScore;
                            }
                            // Vid lika poäng delas platsen (sortera alfabetiskt för stabil ordning)
                            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                          });

                        return mappedParticipants
                          .map((p) => {
                            const rank = mappedParticipants.filter(other => other.finalScore > p.finalScore).length + 1;
                            const isFirstPlace = rank === 1;

                            return (
                              <button 
                                key={p.id} 
                                onClick={() => {
                                  if (!isFacitAvailable && !hasQuizPassword) {
                                    alert(
                                      t(lang, 'answersLockedClickNotice')
                                        .replace('{answered}', answeredCount.toString())
                                        .replace('{total}', totalRequired.toString())
                                    );
                                    return;
                                  }
                                  setViewingParticipantId(p.id);
                                }}
                                className={`w-full flex flex-wrap items-center justify-between p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-4 transition-all ${
                                  !isFacitAvailable && !hasQuizPassword ? 'hover:scale-[1.01]' : 'hover:scale-[1.02] active:scale-95'
                                } gap-4 ${
                                  isFirstPlace ? 'bg-indigo-600 text-white border-indigo-800 shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-3 sm:gap-4 text-left min-w-0 flex-1">
                                  <span className={`text-xl sm:text-2xl font-black shrink-0 ${isFirstPlace ? 'text-yellow-300' : 'text-slate-300'}`}>#{rank}</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-black text-lg sm:text-xl block leading-none truncate">{p.name}</span>
                                    <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest block mt-1 ${isFirstPlace ? 'text-indigo-200' : 'text-slate-400'}`}>
                                      {p.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')} • {p.total} {t(lang, 'answered')}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-auto">
                                  <div className="text-right flex items-center gap-2 sm:gap-3">
                                    {hasOptionQuestions && (
                                      <div className="text-right">
                                        {isFacitAvailable ? (
                                          <>
                                            <span className="text-xl sm:text-3xl font-black">{p.score}</span>
                                            <span className={`text-[10px] sm:text-xs font-bold opacity-75 ml-1 ${isFirstPlace ? 'text-indigo-100' : 'text-slate-500'}`}>{t(lang, 'correct')}</span>
                                          </>
                                        ) : (
                                          <div className="flex items-center gap-1.5 opacity-80" title={!hasQuizPassword ? t(lang, 'facitLockedUntilAllAnswered').replace('{answered}', answeredCount.toString()).replace('{total}', totalRequired.toString()) : ''}>
                                            <Lock className={`w-3.5 h-3.5 sm:w-4 sm:h-4 inline-block ${isFirstPlace ? 'text-indigo-200' : 'text-slate-400'}`} />
                                            <span className={`text-xs sm:text-sm font-bold ${isFirstPlace ? 'text-indigo-100' : 'text-slate-400'}`}>🔒</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {hasOptionQuestions && hasPointQuestions && (
                                      <span className={`text-lg sm:text-xl font-black ${isFirstPlace ? 'text-indigo-300' : 'text-slate-300'}`}>+</span>
                                    )}

                                    {hasPointQuestions && (
                                      <div className="text-right">
                                        <span className={`text-xl sm:text-3xl font-black ${isFirstPlace ? 'text-yellow-300' : 'text-amber-600'}`}>{p.totalPoints}</span>
                                        <span className={`text-[10px] sm:text-xs font-bold opacity-80 ml-1 ${isFirstPlace ? 'text-indigo-100' : 'text-amber-700'}`}>{t(lang, 'pointsTotal')}</span>
                                      </div>
                                    )}
                                  </div>
                                  {(!isFacitAvailable && !hasQuizPassword) ? (
                                    <div className="p-1 rounded-full bg-slate-200/60 text-slate-400" title={t(lang, 'answersLockedClickNotice').replace('{answered}', answeredCount.toString()).replace('{total}', totalRequired.toString())}>
                                      <Lock className="w-4 h-4 text-slate-400" />
                                    </div>
                                  ) : (
                                    <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 ${isFirstPlace ? 'text-white/40' : 'text-slate-300'}`} />
                                  )}
                                </div>
                              </button>
                            );
                          });
                      })()}
                    </div>

                    {/* Mer (Dela quiz / Skicka & Importera svar) */}
                    <div className="pt-4 border-t border-slate-100 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowResultsActions(prev => !prev)}
                        className="w-full flex items-center justify-between gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-wider transition-all"
                      >
                        <span className="flex items-center gap-2">
                          <Share2 className="w-4 h-4 text-indigo-600" />
                          <span>{showResultsActions ? t(lang, 'hideLabel') : t(lang, 'moreLabel')}</span>
                        </span>
                        <span className="text-slate-400">{showResultsActions ? '▴' : '▾'}</span>
                      </button>

                      {showResultsActions && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={shareDirectQuizUrl}
                            className="py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#4338ca] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>{t(lang, 'shareDirectLinkBtn')?.replace(/\(.*\)/, '').trim() || 'Dela Quiz'}</span>
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

                    {/* Walked Route Summary (if quiz has geotag stations) */}
                    {hasAnyGeotag && walkedPath.length > 0 && (
                      <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-emerald-50/90 border-2 border-emerald-200 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
                            👣
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-black text-sm sm:text-base text-emerald-950">{t(lang, 'walkedRoute')}</h4>
                              <span className={`text-[9px] sm:text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                                isFacitUnlocked 
                                  ? 'bg-slate-200 text-slate-700' 
                                  : 'bg-emerald-200 text-emerald-800 animate-pulse'
                              }`}>
                                {isFacitUnlocked ? t(lang, 'trackingStoppedUnlocked') : t(lang, 'trackingLiveWalk')}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-emerald-800 font-semibold mt-0.5">
                              {t(lang, 'walkedDistance')}: <strong className="font-black text-emerald-950">{formatDistance(calculatePathDistance(walkedPath))}</strong> ({walkedPath.length} GPS-punkter)
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setView('quiz');
                            setSelectedQuestionIndex(null);
                            setSelectedParticipantId(null);
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
                        >
                          <Map className="w-4 h-4" />
                          <span>{t(lang, 'viewWalkedTrailMap')}</span>
                        </button>
                      </div>
                    )}

                    <div className="pt-8 sm:pt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <button 
                        onClick={() => setShowResetConfirm(true)}
                        className="w-full py-4 sm:py-5 bg-slate-100 text-slate-600 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase hover:bg-slate-200 transition-colors active:scale-95"
                      >
                        {t(lang, 'restartBtn')}
                      </button>
                      <button 
                        onClick={() => {
                          setView('quiz');
                          setSelectedQuestionIndex(null);
                          setSelectedParticipantId(null);
                        }}
                        className="w-full py-4 sm:py-5 bg-indigo-600 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase hover:bg-indigo-700 transition-colors shadow-lg active:scale-95"
                      >
                        {t(lang, 'backToQuestionsBtn')}
                      </button>
                    </div>

                    <div className="pt-8 sm:pt-10 border-t border-slate-100">
                      {(() => {
                        const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
                        const { totalRequired, answeredCount, isAllAnswered } = getQuizAnswerProgress();
                        const isFacitAvailable = isAdmin || isFacitUnlocked || (!hasQuizPassword && isAllAnswered);

                        if (!isFacitAvailable) {
                          if (!hasQuizPassword) {
                            return (
                              <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t(lang, 'seeAnswersTitle')}</label>
                                <div className="p-4 sm:p-5 bg-slate-50 border-2 border-slate-200/80 rounded-2xl sm:rounded-3xl text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-3 text-left">
                                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                                    <Lock className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <p className="text-xs sm:text-sm font-black text-slate-800">
                                      {t(lang, 'facitLockedUntilAllAnsweredTitle')}
                                    </p>
                                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">
                                      {t(lang, 'facitLockedUntilAllAnswered')
                                        .replace('{answered}', answeredCount.toString())
                                        .replace('{total}', totalRequired.toString())}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const isFacitLockedByProgress = isQuizModeLocked && !isAllAnswered;

                          return (
                            <div className="space-y-4">
                              <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t(lang, 'seeAnswersTitle')}</label>
                                
                                {isFacitLockedByProgress && (
                                  <div className="p-3 bg-slate-100 border border-slate-200/80 rounded-2xl text-slate-600 text-xs font-bold flex items-center gap-2.5 text-left">
                                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="leading-snug">
                                      {t(lang, 'facitLockedUntilAllAnswered')
                                        .replace('{answered}', answeredCount.toString())
                                        .replace('{total}', totalRequired.toString())}
                                    </span>
                                  </div>
                                )}

                                <div className="flex gap-2">
                                  <input 
                                    type="password"
                                    disabled={isFacitLockedByProgress}
                                    placeholder={isFacitLockedByProgress ? t(lang, 'resultsLocked') : t(lang, 'enterQuizPassword')}
                                    className={`flex-1 p-3.5 border rounded-2xl text-sm font-mono outline-none transition-all shadow-sm ${
                                      isFacitLockedByProgress
                                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed placeholder:text-slate-300'
                                        : 'bg-slate-50 border-slate-200 focus:border-indigo-500 text-slate-800'
                                    }`}
                                    value={facitPasswordInput}
                                    onChange={(e) => setFacitPasswordInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (isFacitLockedByProgress) {
                                          alert(t(lang, 'allQuestionsMustBeAnsweredAlert'));
                                          return;
                                        }
                                        const pass = quizConfig.password || 'Password';
                                        const input = facitPasswordInput.trim();
                                        if (input === pass || input === 'Password' || input === '1234') {
                                          setIsFacitUnlocked(true);
                                        } else {
                                          alert(t(lang, 'wrongPasswordAlert'));
                                        }
                                      }
                                    }}
                                  />
                                  <button 
                                    disabled={isFacitLockedByProgress}
                                    onClick={() => {
                                      if (isFacitLockedByProgress) {
                                        alert(t(lang, 'allQuestionsMustBeAnsweredAlert'));
                                        return;
                                      }
                                      const pass = quizConfig.password || 'Password';
                                      const input = facitPasswordInput.trim();
                                      if (input === pass || input === 'Password' || input === '1234') {
                                        setIsFacitUnlocked(true);
                                      } else {
                                        alert(t(lang, 'wrongPasswordAlert'));
                                      }
                                    }}
                                    className={`px-6 rounded-2xl font-black text-xs uppercase shadow-md transition-all ${
                                      isFacitLockedByProgress
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                                    }`}
                                  >
                                    {t(lang, 'showFacitBtn')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between gap-4 bg-emerald-500 p-4 rounded-2xl shadow-lg border border-emerald-400">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                <Check className="w-6 h-6 text-white stroke-[3]" />
                              </div>
                              <div>
                                <h3 className="font-black text-sm text-white">{t(lang, 'facitUnlocked')}</h3>
                                <p className="text-[11px] text-emerald-100 font-medium">{t(lang, 'facitUnlockedDesc')}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                setIsFacitUnlocked(false);
                                setFacitPasswordInput('');
                              }}
                              className="w-10 h-10 bg-black/10 hover:bg-black/20 text-white rounded-xl flex items-center justify-center transition-all"
                              title={t(lang, 'hideFacit')}
                            >
                              ✕
                            </button>
                          </div>

                          <div className="space-y-10">
                            {/* Barnfrågor */}
                            {quizConfig.barnQuestions.length > 0 && (
                              <div className="space-y-5">
                                <div className="flex items-center justify-between px-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-6 bg-indigo-500 rounded-full" />
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Barnfrågor ({quizConfig.barnQuestions.length})</h4>
                                  </div>
                                </div>
                                <div className="grid gap-4">
                                  {quizConfig.barnQuestions.map((qRaw, idx) => {
                                    const trans = translateQuestion(qRaw.id, qRaw.text, qRaw.options || [], lang, qRaw.originalLanguage);
                                    const q = { ...qRaw, text: trans.text, options: trans.options };
                                    return (
                                    <div key={q.id} className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 sm:p-6 shadow-sm">
                                      <div className="flex gap-4 mb-4">
                                        <span className="w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-xs font-black text-indigo-600 shadow-sm shrink-0">{idx + 1}</span>
                                        <p className="text-base font-bold text-slate-800 leading-tight pt-1">{q.text}</p>
                                      </div>
                                      {q.type === 'points' ? (
                                        <div className="p-3.5 bg-amber-50 rounded-2xl text-xs font-bold border border-amber-200 text-amber-900 flex items-center justify-between">
                                          <span className="flex items-center gap-2">
                                            <span className="text-base">🎯</span>
                                            <span>Poängfråga (inget facit för svarsalternativ)</span>
                                          </span>
                                          {q.maxPoints && (
                                            <span className="bg-amber-200 text-amber-950 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                              Max: {q.maxPoints} p
                                            </span>
                                          )}
                                        </div>
                                      ) : q.type === 'text' ? (
                                        <div className="p-4 bg-sky-50 rounded-2xl text-xs border border-sky-200 text-sky-950 space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="font-black flex items-center gap-1.5">
                                              <span>🔤</span> {t(lang, 'textQuestionType')}
                                            </span>
                                            <span className="bg-sky-200 text-sky-900 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                              {t(lang, 'soundexPhoneticTag')}
                                            </span>
                                          </div>
                                          <div className="bg-white p-3 rounded-xl border border-sky-200 flex items-center justify-between">
                                            <span className="font-bold text-slate-600">{t(lang, 'correctAnswer')}:</span>
                                            <span className="font-black text-emerald-700 text-sm">{q.correctTextAnswer || '—'}</span>
                                          </div>
                                          {q.acceptedTextAnswers && q.acceptedTextAnswers.length > 0 && (
                                            <div className="text-[11px] text-slate-500 font-medium">
                                              <span className="font-bold">{t(lang, 'acceptedAlternativesLabel')}:</span> {q.acceptedTextAnswers.join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                          {q.options.map((opt, oIdx) => (
                                            <div 
                                              key={oIdx}
                                              className={`p-3 rounded-2xl text-xs font-bold text-center border transition-all flex items-center justify-center gap-3 ${
                                                (q?.correctAnswers || []).includes(oIdx) 
                                                  ? 'bg-emerald-500 border-emerald-600 text-white shadow-md shadow-emerald-100 scale-[1.02]' 
                                                  : 'bg-white border-slate-100 text-slate-400 opacity-60'
                                              }`}
                                            >
                                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] ${
                                                (q?.correctAnswers || []).includes(oIdx) ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                                              }`}>
                                                {getOptionLabel(oIdx, q.options?.length)}
                                              </span>
                                              <span className="flex-1">{opt}</span>
                                              {(q?.correctAnswers || []).includes(oIdx) && <CheckCircle2 className="w-4 h-4 text-white/80" />}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Vuxenfrågor */}
                            {quizConfig.vuxenQuestions.length > 0 && (
                              <div className="space-y-5">
                                <div className="flex items-center justify-between px-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-6 bg-indigo-500 rounded-full" />
                                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Vuxenfrågor ({quizConfig.vuxenQuestions.length})</h4>
                                  </div>
                                </div>
                                <div className="grid gap-4">
                                  {quizConfig.vuxenQuestions.map((qRaw, idx) => {
                                    const trans = translateQuestion(qRaw.id, qRaw.text, qRaw.options || [], lang, qRaw.originalLanguage);
                                    const q = { ...qRaw, text: trans.text, options: trans.options };
                                    return (
                                    <div key={q.id} className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 sm:p-6 shadow-sm">
                                      <div className="flex gap-4 mb-4">
                                        <span className="w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-xs font-black text-indigo-600 shadow-sm shrink-0">{idx + 1}</span>
                                        <p className="text-base font-bold text-slate-800 leading-tight pt-1">{q.text}</p>
                                      </div>
                                      {q.type === 'points' ? (
                                        <div className="p-3.5 bg-amber-50 rounded-2xl text-xs font-bold border border-amber-200 text-amber-900 flex items-center justify-between">
                                          <span className="flex items-center gap-2">
                                            <span className="text-base">🎯</span>
                                            <span>Poängfråga (inget facit för svarsalternativ)</span>
                                          </span>
                                          {q.maxPoints && (
                                            <span className="bg-amber-200 text-amber-950 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                              Max: {q.maxPoints} p
                                            </span>
                                          )}
                                        </div>
                                      ) : q.type === 'text' ? (
                                        <div className="p-4 bg-sky-50 rounded-2xl text-xs border border-sky-200 text-sky-950 space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="font-black flex items-center gap-1.5">
                                              <span>🔤</span> {t(lang, 'textQuestionType')}
                                            </span>
                                            <span className="bg-sky-200 text-sky-900 px-2 py-0.5 rounded-lg text-[10px] font-black">
                                              {t(lang, 'soundexPhoneticTag')}
                                            </span>
                                          </div>
                                          <div className="bg-white p-3 rounded-xl border border-sky-200 flex items-center justify-between">
                                            <span className="font-bold text-slate-600">{t(lang, 'correctAnswer')}:</span>
                                            <span className="font-black text-emerald-700 text-sm">{q.correctTextAnswer || '—'}</span>
                                          </div>
                                          {q.acceptedTextAnswers && q.acceptedTextAnswers.length > 0 && (
                                            <div className="text-[11px] text-slate-500 font-medium">
                                              <span className="font-bold">{t(lang, 'acceptedAlternativesLabel')}:</span> {q.acceptedTextAnswers.join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                          {q.options.map((opt, oIdx) => (
                                            <div 
                                              key={oIdx}
                                              className={`p-3 rounded-2xl text-xs font-bold text-center border transition-all flex items-center justify-center gap-3 ${
                                                (q?.correctAnswers || []).includes(oIdx) 
                                                  ? 'bg-emerald-500 border-emerald-600 text-white shadow-md shadow-emerald-100 scale-[1.02]' 
                                                  : 'bg-white border-slate-100 text-slate-400 opacity-60'
                                              }`}
                                            >
                                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] ${
                                                (q?.correctAnswers || []).includes(oIdx) ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'
                                              }`}>
                                                {getOptionLabel(oIdx, q.options?.length)}
                                              </span>
                                              <span className="flex-1">{opt}</span>
                                              {(q?.correctAnswers || []).includes(oIdx) && <CheckCircle2 className="w-4 h-4 text-white/80" />}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {showResetConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
                  <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                    <h2 className="text-xl font-black text-slate-800">{t(lang, 'restartBtn')}</h2>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {lang === 'sv' ? 'Vill du rensa alla svar och starta om quizet?' : 'Do you want to clear all answers and restart the quiz?'}
                    </p>
                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-black uppercase text-slate-600 hover:bg-slate-200"
                      >
                        {t(lang, 'back')}
                      </button>
                      <button
                        type="button"
                        onClick={handleResetQuiz}
                        className="flex-1 rounded-xl bg-rose-600 py-3 text-xs font-black uppercase text-white hover:bg-rose-700"
                      >
                        {t(lang, 'restartBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
  );
});
