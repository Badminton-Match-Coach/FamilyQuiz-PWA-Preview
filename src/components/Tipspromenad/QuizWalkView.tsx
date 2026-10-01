/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Lock,
  Compass,
  Trophy,
  ArrowLeft,
  X,
  Maximize2,
  User,
  Users,
  Award,
  Clock,
  Navigation,
  Check,
  Locate,
  Globe
} from 'lucide-react';
import { QuizConfig, Participant, UserType, Question, Location } from '../../types';
import { Language, t, translateQuestion } from '../../i18n';
import { calculateDistanceMeters, formatDistance } from '../../utils/geoUtils';
import {
  ParticipantMap,
  TrailProgressBar,
  MiniStationMap,
  CompassDirectionBadge
} from '../MapComponent';
import { getQuestionAvailableLanguages } from '../../utils/quizLanguages';
import { getOptionLabel } from '../../utils/imageAndLabelUtils';
import { OfflineImage } from '../Common/OfflineImage';

import { AnswerRecord } from '../../types';

export interface QuizWalkViewProps {
  lang: Language;
  quizConfig: QuizConfig;
  participants: Participant[];
  answers: AnswerRecord[];
  selectedParticipantId: string | null;
  setSelectedParticipantId: (id: string | null) => void;
  selectedQuestionIndex: number | null;
  setSelectedQuestionIndex: (idx: number | null) => void;
  visibleQuestionIndexes: number[];
  userLocation: { lat: number; lng: number } | null;
  setView: (v: 'setup' | 'quiz' | 'results' | 'config') => void;
  pointsInputValue: number;
  setPointsInputValue: (val: number | ((prev: number) => number)) => void;
  submitPointsAnswer: (points: number) => void;
  textInputValue: string;
  setTextInputValue: (val: string | ((prev: string) => string)) => void;
  submitTextAnswer: (text: string) => void;
  submitAnswer: (optionIndex: number) => void;
  setZoomedImageUrl: (url: string | null) => void;
  isFacitUnlocked: boolean;
  isAdmin: boolean;
  locateUser: () => void;
  isLocating: boolean;
  walkedPath: { lat: number; lng: number }[];
  setWalkedPath: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }[]>>;
  STORAGE_KEY_WALKED_PATH: string;
  handleSelectQuestionIndex: (idx: number, isFollowUp?: boolean, participantId?: string) => void;
  getQuizAnswerProgress: () => { totalRequired: number; answeredCount: number; isAllAnswered: boolean };
  quizQuestionPool: Question[];
  visibleQuestionCount: number;
}

export const QuizWalkView = React.memo<QuizWalkViewProps>(({
  lang,
  quizConfig,
  participants,
  answers,
  selectedParticipantId,
  setSelectedParticipantId,
  selectedQuestionIndex,
  setSelectedQuestionIndex,
  visibleQuestionIndexes,
  userLocation,
  setView,

  pointsInputValue,
  setPointsInputValue,
  submitPointsAnswer,
  textInputValue,
  setTextInputValue,
  submitTextAnswer,
  submitAnswer,
  setZoomedImageUrl,

  isFacitUnlocked,
  isAdmin,
  locateUser,
  isLocating,
  walkedPath,
  setWalkedPath,
  STORAGE_KEY_WALKED_PATH,
  handleSelectQuestionIndex,
  getQuizAnswerProgress,
  quizQuestionPool,
  visibleQuestionCount
}) => {
  const [showQuestionMiniMap, setShowQuestionMiniMap] = useState(true);

  return (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-4 flex-1 max-w-5xl mx-auto w-full"
            >
              {selectedQuestionIndex === null ? (
                /* Unified Overview View: Map + Unified Question Selection */
                (() => {
                  const hasAnyGeotag = visibleQuestionIndexes.some(index =>
                    !!quizConfig.barnQuestions[index]?.location || !!quizConfig.vuxenQuestions[index]?.location
                  );

                  return (
                    <div className="space-y-6">
                      {/* Top Bar with Participants & Results action */}
                      <div className="bg-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-5 backdrop-blur-md border border-white/20 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="w-10 h-10 bg-yellow-400 text-indigo-900 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 shadow">
                            🗺️
                          </div>
                          <div>
                            <h2 className="font-black text-lg sm:text-xl leading-tight">{t(lang, 'selectQuestionAndStation')}</h2>
                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-100/80">
                              <span>{t(lang, 'participantsTab')}:</span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {participants.map(p => (
                                  <span key={p.id} className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-black">
                                    {p.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                          {hasAnyGeotag && (
                            <button 
                              onClick={locateUser}
                              disabled={isLocating}
                              className="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold uppercase border border-white/20 flex items-center gap-2 active:scale-95 transition-all"
                            >
                              <Locate className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                              <span>{isLocating ? t(lang, 'gpsSearch') : userLocation ? t(lang, 'gpsActive') : t(lang, 'turnOnGPS')}</span>
                            </button>
                          )}

                          <button 
                            onClick={() => setView('results')}
                            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black rounded-xl text-xs uppercase shadow-md active:scale-95 transition-all"
                          >
                            {t(lang, 'seeResultsBtn')}
                          </button>
                        </div>
                      </div>

                      {/* Trail Progress Bar */}
                      {visibleQuestionCount > 0 && (
                        <TrailProgressBar
                          questions={visibleQuestionIndexes.map((idx) => {
                            const question = quizQuestionPool?.[idx]
                              || quizConfig.barnQuestions[idx]
                              || quizConfig.vuxenQuestions[idx];
                            const location = question?.location;
                            const answeredBy = participants.filter(p => answers.some(a => a.participantId === p.id && a.questionIndex === idx));
                            const isFullyAnswered = participants.length > 0 && answeredBy.length === participants.length;
                            return {
                              index: visibleQuestionIndexes.indexOf(idx),
                              isAnswered: isFullyAnswered,
                              hasLocation: !!location,
                            };
                          })}
                          activeIndex={visibleQuestionIndexes.indexOf(selectedQuestionIndex ?? -1)}
                          onSelectQuestion={(displayIndex) => handleSelectQuestionIndex(visibleQuestionIndexes[displayIndex])}
                          lang={lang}
                        />
                      )}

                      {/* Interactive Map */}
                      {hasAnyGeotag && (
                        <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-6 shadow-2xl border border-indigo-200/50 space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-indigo-600 font-black text-xs uppercase tracking-widest flex items-center gap-1.5">
                              <Compass className="w-4 h-4" />
                              <span>{t(lang, 'mapAllStations')}</span>
                            </span>
                            <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
                              {t(lang, 'clickButtonOnMapOrList')}
                            </span>
                          </div>

                          <ParticipantMap 
                            questions={visibleQuestionIndexes.map((idx) => {
                              const rawQ = quizQuestionPool?.[idx]
                                || quizConfig.barnQuestions[idx]
                                || quizConfig.vuxenQuestions[idx]
                                || { id: `q-${idx}`, text: `${t(lang, 'question')} ${idx + 1}`, options: [], correctAnswers: [0] };
                              const location = rawQ.location;
                              const trans = translateQuestion(rawQ.id, rawQ.text, rawQ.options || [], lang);
                              const q = { ...rawQ, text: trans.text, options: trans.options };
                              const qWithLoc = { ...q, location: q.location || location };

                              const answeredBy = participants.filter(p => answers.some(a => a.participantId === p.id && a.questionIndex === idx));
                              const isFullyAnswered = participants.length > 0 && answeredBy.length === participants.length;

                              return {
                                q: qWithLoc,
                                index: visibleQuestionIndexes.indexOf(idx),
                                isAnswered: isFullyAnswered,
                              };
                            })}
                            userType={participants[0]?.type || 'barn'}
                            userLocation={userLocation}
                            unlockDistance={quizConfig.geotagUnlockDistance || 20}
                            onSelectQuestion={(displayIndex) => handleSelectQuestionIndex(visibleQuestionIndexes[displayIndex])}
                            lang={lang}
                            walkedPath={walkedPath}
                            isLiveTracking={hasAnyGeotag && !isFacitUnlocked && walkedPath.length > 0}
                            onClearWalkedPath={() => {
                              setWalkedPath([]);
                              localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
                            }}
                          />
                        </div>
                      )}

                      {/* Unified Single Question Selection List / Grid */}
                      <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-7 shadow-2xl border border-indigo-200/50 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                          <div>
                            <h3 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
                              <MapPin className="w-6 h-6 text-indigo-600" />
                              <span>{t(lang, 'questionListTitle')} ({visibleQuestionCount})</span>
                            </h3>
                          </div>

                          {/* Legend */}
                          <div className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" /> {t(lang, 'fullyAnsweredByAll')}
                            </span>
                            {hasAnyGeotag && (
                              <span className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                                <span className="w-2 h-2 rounded-full bg-slate-400" /> {t(lang, 'lockedBtn')}
                              </span>
                            )}
                          </div>
                        </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {visibleQuestionIndexes.map((idx) => {
                        const rawQ = quizQuestionPool?.[idx]
                          || quizConfig.barnQuestions[idx]
                          || quizConfig.vuxenQuestions[idx];
                        const location = rawQ?.location;
                        const trans = rawQ ? translateQuestion(rawQ.id, rawQ.text, rawQ.options || [], lang, rawQ.originalLanguage) : null;
                        const sampleQ = rawQ && trans ? { ...rawQ, text: trans.text, options: trans.options } : null;
                        
                        const answeredBy = participants.filter(p => answers.some(a => a.participantId === p.id && a.questionIndex === idx));
                        const isFullyAnswered = participants.length > 0 && answeredBy.length === participants.length;
                        const isPartiallyAnswered = answeredBy.length > 0 && answeredBy.length < participants.length;

                        let dist: number | null = null;
                        if (location && userLocation) {
                          dist = calculateDistanceMeters(userLocation.lat, userLocation.lng, location.lat, location.lng);
                        }

                        const unlockDistance = Math.max(5, quizConfig.geotagUnlockDistance || 20);
                        const isUnlocked = isFullyAnswered || !location || (dist !== null && dist <= unlockDistance);

                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectQuestionIndex(idx)}
                            className={`p-4 rounded-2xl border-2 font-bold transition-all text-left flex flex-col justify-between gap-3 relative group active:scale-98 ${
                              isFullyAnswered 
                                ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 shadow-sm' 
                                : isUnlocked
                                  ? isPartiallyAnswered
                                    ? 'bg-amber-50/90 border-amber-400 text-amber-950 shadow-sm hover:border-amber-500'
                                    : 'bg-white border-slate-200 hover:border-indigo-400 text-slate-800 shadow-sm hover:shadow-md'
                                  : 'bg-slate-100/80 border-slate-200/90 text-slate-400 opacity-65 hover:opacity-90'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 w-full">
                              <div className="flex items-center gap-2">
                                <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                                  isFullyAnswered
                                    ? 'bg-emerald-600 text-white'
                                    : isUnlocked
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-slate-300 text-slate-600'
                                }`}>
                                  {visibleQuestionIndexes.indexOf(idx) + 1}
                                </span>
                                <div>
                                  <span className="font-black text-sm block leading-tight text-slate-800">
                                    {t(lang, 'question')} {visibleQuestionIndexes.indexOf(idx) + 1}
                                  </span>
                                  {sampleQ?.text && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-slate-500 line-clamp-1 font-normal flex-1">
                                        {sampleQ.text}
                                      </span>
                                      {isFacitUnlocked && (
                                        <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1 shrink-0">
                                          {sampleQ?.type === 'points' 
                                            ? `🎯 ${t(lang, 'pointQuestion')}` 
                                            : sampleQ?.type === 'text'
                                            ? `🔤 ${sampleQ.correctTextAnswer || ''}`
                                            : `${t(lang, 'correctAnswer')}: ${(sampleQ?.correctAnswers || []).map(ans => getOptionLabel(ans, sampleQ?.options?.length)).join(', ')}`}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Status Badge */}
                              {isFullyAnswered ? (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-800 shrink-0">
                                  ✓ {t(lang, 'fullyAnsweredByAll')}
                                </span>
                              ) : isPartiallyAnswered ? (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-800 shrink-0">
                                  {t(lang, 'partiallyAnswered')}
                                </span>
                              ) : isUnlocked ? (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 shrink-0">
                                  {t(lang, 'answerBtn')}
                                </span>
                              ) : (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 shrink-0 flex items-center gap-1">
                                  {t(lang, 'lockedBtn')}
                                </span>
                              )}
                            </div>

                            {/* Distance / Location info */}
                            <div className="pt-2 border-t border-slate-100/80 flex flex-wrap items-center justify-between text-xs font-semibold gap-2">
                              {location ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <CompassDirectionBadge 
                                    userLocation={userLocation}
                                    targetLocation={location}
                                    unlockDistance={unlockDistance}
                                    lang={lang}
                                    compact
                                  />
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-normal truncate">
                                  {t(lang, 'notGeotagged')}
                                </span>
                              )}

                              {/* Participant response dots */}
                              <div className="flex flex-wrap items-center gap-1 justify-end ml-auto">
                                {participants.map(p => {
                                  const answered = answers.some(a => a.participantId === p.id && a.questionIndex === idx);
                                  return (
                                    <span 
                                      key={p.id}
                                      title={`${p.name}: ${answered ? t(lang, 'answeredStatus') : t(lang, 'notAnsweredStatus')}`}
                                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                        answered ? 'bg-emerald-500' : 'bg-slate-300'
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
                /* Question View: Quick Question Navbar + Question Form */
                <div className="space-y-4">
                  {/* Top Bar for fast navigation between questions */}
                  <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-md border border-white/20 text-white flex items-center justify-between gap-3 overflow-x-auto">
                    <button
                      onClick={() => {
                        setSelectedQuestionIndex(null);
                        setSelectedParticipantId(null);
                      }}
                      className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shrink-0 transition-all"
                    >
                      {t(lang, 'allQuestionsAndMap')}
                    </button>

                    <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                      {visibleQuestionIndexes.map((idx) => {
                            const question = quizQuestionPool?.[idx]
                              || quizConfig.barnQuestions[idx]
                              || quizConfig.vuxenQuestions[idx];
                        const location = question?.location;
                        const answeredBy = participants.filter(p => answers.some(a => a.participantId === p.id && a.questionIndex === idx));
                        const isFullyAnswered = participants.length > 0 && answeredBy.length === participants.length;

                        let dist: number | null = null;
                        if (location && userLocation) {
                          dist = calculateDistanceMeters(userLocation.lat, userLocation.lng, location.lat, location.lng);
                        }

                        const unlockDistance = Math.max(5, quizConfig.geotagUnlockDistance || 20);
                        const isUnlocked = isFullyAnswered || !location || (dist !== null && dist <= unlockDistance);
                        const isSelected = selectedQuestionIndex === idx;

                        return (
                          <button
                            key={idx}
                            onClick={() => handleSelectQuestionIndex(idx)}
                            className={`w-8 h-8 rounded-xl font-black text-xs shrink-0 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-yellow-400 text-indigo-950 scale-110 shadow-md ring-2 ring-yellow-200'
                                : isFullyAnswered
                                  ? 'bg-emerald-500 text-white'
                                  : isUnlocked
                                    ? 'bg-white/20 text-white hover:bg-white/30'
                                    : 'bg-black/30 text-white/40'
                            }`}
                          >
                            {visibleQuestionIndexes.indexOf(idx) + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {!selectedParticipantId && participants.length > 1 ? (() => {
                    const applicableParticipants = participants.filter(p => {
                      const participantQuestions = p.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                      return !!participantQuestions[selectedQuestionIndex];
                    });
                    const isQuestionAnsweredByAll = applicableParticipants.length > 0 && applicableParticipants.every(p => {
                      return answers.some(a => a.participantId === p.id && a.questionIndex === selectedQuestionIndex);
                    });
                    const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
                    const shouldShowStationFacit = (!hasQuizPassword || isFacitUnlocked || isAdmin) && isQuestionAnsweredByAll;

                    const renderStationQuestionBlock = (category: UserType) => {
                      const questionsList = category === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                      const rawStationQ = questionsList[selectedQuestionIndex];
                      if (!rawStationQ) return null;

                      const categoryParts = applicableParticipants.filter(p => p.type === category);
                      if (categoryParts.length === 0) return null;

                      const isBarn = category === 'barn';
                      const trans = translateQuestion(rawStationQ.id, rawStationQ.text, rawStationQ.options || [], lang, rawStationQ.originalLanguage ?? lang);
                      const stationQ: Question = {
                        ...rawStationQ,
                        text: trans.text,
                        options: trans.options
                      };

                      return (
                        <div key={category} className="mt-4 p-4 sm:p-5 bg-slate-50 border-2 border-indigo-100 rounded-2xl sm:rounded-3xl space-y-4 text-left">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider text-white ${
                              isBarn ? 'bg-amber-400' : 'bg-pink-400'
                            }`}>
                              {isBarn ? t(lang, 'kidQuestionLabel') : t(lang, 'adultQuestionLabel')}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {categoryParts.length} {isBarn ? (categoryParts.length === 1 ? t(lang, 'kid') : t(lang, 'kids') || 'barn') : (categoryParts.length === 1 ? t(lang, 'adult') : t(lang, 'adults') || 'vuxna')}
                            </span>
                          </div>

                          <div>
                            <h4 className="text-base sm:text-lg font-black text-slate-800 leading-snug">
                              {stationQ.text}
                            </h4>
                            {stationQ.imageUrl && (
                              <div className="mt-3">
                                <div 
                                  className="relative group rounded-2xl overflow-hidden border-2 border-slate-200 shadow-sm bg-slate-100 max-h-48 sm:max-h-60 flex items-center justify-center cursor-pointer"
                                  onClick={() => setZoomedImageUrl(stationQ.imageUrl || null)}
                                  title={t(lang, 'previewImage')}
                                >
                                  <OfflineImage
                                    src={stationQ.imageUrl}
                                    alt={stationQ.text}
                                    className="max-h-48 sm:max-h-60 w-full object-contain group-hover:scale-[1.01] transition-transform"
                                  />
                                  <div className="absolute bottom-2 right-2 bg-black/65 hover:bg-black/85 text-white text-xs font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5 backdrop-blur-xs transition-colors">
                                    <Maximize2 className="w-3.5 h-3.5" />
                                    <span>{t(lang, 'previewImage')}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Correct Answer Display */}
                          {stationQ.type === 'points' ? (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-950 font-bold">
                              <span className="flex items-center gap-2">
                                <span>🎯</span>
                                <span>{t(lang, 'pointQuestion')}</span>
                              </span>
                              {stationQ.maxPoints && (
                                <span className="bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-lg text-[10px] font-black">
                                  Max: {stationQ.maxPoints} p
                                </span>
                              )}
                            </div>
                          ) : stationQ.type === 'text' ? (
                            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-emerald-800">✅ {t(lang, 'correctAnswer')}:</span>
                              <span className="font-black text-emerald-950 text-sm">{stationQ.correctTextAnswer || '—'}</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {stationQ.options.map((opt, optIdx) => {
                                const isCorrect = (stationQ.correctAnswers || []).includes(optIdx);
                                return (
                                  <div
                                    key={optIdx}
                                    className={`p-3 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2.5 ${
                                      isCorrect
                                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-md font-black ring-2 ring-emerald-300'
                                        : 'bg-white border-slate-200/80 text-slate-500 opacity-60'
                                    }`}
                                  >
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 ${
                                      isCorrect ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {getOptionLabel(optIdx, stationQ.options.length)}
                                    </span>
                                    <span className="flex-1 min-w-0 break-words leading-tight">{opt}</span>
                                    {isCorrect && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Participant responses for this question */}
                          <div className="pt-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                              {t(lang, 'participantAnswersTitle')}
                            </p>
                            <div className="space-y-2">
                              {categoryParts.map(p => {
                                const pAns = answers.find(a => a.participantId === p.id && a.questionIndex === selectedQuestionIndex);
                                return (
                                  <div
                                    key={p.id}
                                    className={`p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                                      pAns?.isCorrect 
                                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                                        : stationQ.type === 'points' 
                                          ? 'bg-amber-50/70 border-amber-200 text-amber-950' 
                                          : 'bg-rose-50/70 border-rose-200 text-rose-950'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0 ${
                                        p.type === 'barn' ? 'bg-amber-400' : 'bg-pink-400'
                                      }`}>
                                        {p.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="font-bold truncate">{p.name}</span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {stationQ.type === 'points' ? (
                                        <span className="font-black text-amber-900 bg-amber-200/80 px-2.5 py-1 rounded-lg text-xs">
                                          {pAns?.pointsScored ?? 0} p
                                        </span>
                                      ) : stationQ.type === 'text' ? (
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-slate-700 italic truncate max-w-[120px] sm:max-w-[180px]">
                                            "{pAns?.textAnswer || '—'}"
                                          </span>
                                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                            pAns?.isCorrect ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                                          }`}>
                                            {pAns?.isCorrect ? `✅ ${t(lang, 'correctBadge')}` : `❌ ${t(lang, 'incorrectBadge')}`}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold truncate max-w-[140px] sm:max-w-[200px]">
                                            {typeof pAns?.answerIndex === 'number'
                                              ? `${getOptionLabel(pAns.answerIndex, stationQ.options.length)}: ${stationQ.options[pAns.answerIndex] || ''}`
                                              : '—'}
                                          </span>
                                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                            pAns?.isCorrect ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                                          }`}>
                                            {pAns?.isCorrect ? `✅ ${t(lang, 'correctBadge')}` : `❌ ${t(lang, 'incorrectBadge')}`}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-6 flex-1 shadow-2xl flex flex-col border border-indigo-200/50">
                        <div className="mb-4 sm:mb-6">
                          <span className="text-indigo-500 font-black text-lg sm:text-xl uppercase tracking-tighter">{t(lang, 'selectParticipantToAnswer')}</span>
                          <h3 className="text-2xl sm:text-4xl font-black mt-2 leading-tight text-slate-800">{t(lang, 'whoWillAnswer', { num: (selectedQuestionIndex + 1).toString() })}</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          {applicableParticipants.map(p => {
                            const answer = answers.find(a => a.participantId === p.id && a.questionIndex === selectedQuestionIndex);
                            const hasAnswered = !!answer;
                            return (
                              <button
                                key={p.id}
                                onClick={() => setSelectedParticipantId(p.id)}
                                className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-4 transition-all flex items-center gap-4 relative text-left ${
                                  hasAnswered 
                                    ? shouldShowStationFacit
                                      ? answer.isCorrect || typeof answer.pointsScored === 'number'
                                        ? 'bg-emerald-50/70 border-emerald-400 hover:border-emerald-500'
                                        : 'bg-rose-50/70 border-rose-400 hover:border-rose-500'
                                      : 'bg-indigo-50 border-indigo-500' 
                                    : 'bg-slate-50 border-slate-100 hover:border-indigo-300'
                                }`}
                              >
                                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-white text-lg sm:text-xl shrink-0 ${
                                  p.type === 'barn' ? 'bg-amber-400' : 'bg-pink-400'
                                }`}>
                                  {p.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-black text-lg sm:text-xl text-slate-800 truncate">{p.name}</p>
                                  <span className="text-[10px] font-black uppercase text-slate-400">{p.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')}</span>
                                </div>
                                {hasAnswered && (
                                  <div className={`absolute top-2 right-2 sm:top-4 sm:right-4 text-[8px] sm:text-[10px] font-black px-2 py-0.5 sm:py-1 rounded-lg uppercase flex items-center gap-1 ${
                                    shouldShowStationFacit
                                      ? answer.isCorrect
                                        ? 'bg-emerald-600 text-white'
                                        : typeof answer.pointsScored === 'number'
                                          ? 'bg-amber-600 text-white'
                                          : 'bg-rose-600 text-white'
                                      : 'bg-indigo-600 text-white'
                                  }`}>
                                    {shouldShowStationFacit ? (
                                      answer.isCorrect ? (
                                        <>
                                          <Check className="w-3 h-3 stroke-[3]" />
                                          <span>{t(lang, 'correctBadge')}</span>
                                        </>
                                      ) : typeof answer.pointsScored === 'number' ? (
                                        <span>{answer.pointsScored} p</span>
                                      ) : (
                                        <span>{t(lang, 'incorrectBadge')}</span>
                                      )
                                    ) : (
                                      t(lang, 'answeredBadge')
                                    )}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Station Facit and Participant Answers (Revealed when all answered and no quiz password) */}
                        {shouldShowStationFacit && (
                          <div className="mt-6 pt-4 border-t border-slate-200">
                            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-400/80 rounded-2xl sm:rounded-3xl flex flex-wrap items-center justify-between gap-3 shadow-xs text-left">
                              <div className="flex items-center gap-2.5">
                                <span className="text-xl">🎉</span>
                                <p className="text-xs sm:text-sm font-black text-emerald-950">
                                  {t(lang, 'stationAllAnsweredHeading')}
                                </p>
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 px-3 py-1 rounded-xl">
                                {t(lang, 'correctAnswer')}
                              </span>
                            </div>

                            {/* Render Questions for Kid / Adult */}
                            {renderStationQuestionBlock('barn')}
                            {renderStationQuestionBlock('vuxen')}
                          </div>
                        )}

                        <button 
                          onClick={() => setSelectedQuestionIndex(null)}
                          className="mt-6 sm:mt-auto text-slate-400 font-bold hover:text-slate-600 transition-colors pt-6 text-sm text-center"
                        >
                          {t(lang, 'allQuestionsAndMap')}
                        </button>
                      </div>
                    );
                  })() : (
                    <motion.div 
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="bg-white rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-6 flex-1 shadow-2xl flex flex-col border border-indigo-200/50 relative overflow-hidden"
                    >
                      {/* Big Decorative Number */}
                      <div className="absolute top-0 right-0 -mt-6 -mr-6 sm:-mt-10 sm:-mr-10 opacity-[0.03] pointer-events-none">
                        <span className="text-[10rem] sm:text-[20rem] font-black">{selectedQuestionIndex + 1}</span>
                      </div>

                      {(() => {
                        const activePartId = selectedParticipantId || (participants.length === 1 ? participants[0]?.id : null);
                        const currentParticipant = participants.find(p => p.id === activePartId);
                        const isBarn = currentParticipant?.type === 'barn';
                        const primaryQuestions = isBarn ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                        const rawQ: Question = primaryQuestions[selectedQuestionIndex] || {
                          id: '',
                          text: t(lang, 'noQuestionFound'),
                          type: 'options',
                          options: [t(lang, 'defaultOption1'), t(lang, 'defaultOptionX'), t(lang, 'defaultOption2')],
                          correctAnswers: [],
                          originalLanguage: lang,
                        };
                        const trans = translateQuestion(rawQ.id, rawQ.text, rawQ.options || [], lang, rawQ.originalLanguage ?? lang);
                        const baseQ: Question = { ...rawQ, text: trans.text, options: trans.options };
                        const loc = primaryQuestions[selectedQuestionIndex]?.location;
                        const activeQ: Question = { 
                          ...baseQ, 
                          imageUrl: baseQ.imageUrl ?? rawQ.imageUrl,
                          optionImages: baseQ.optionImages ?? rawQ.optionImages,
                          location: baseQ.location ?? loc 
                        };

                        const isQuestionAnsweredByAll = participants.length > 0 && participants.every(p => {
                          const pQuestions = p.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                          if (!pQuestions[selectedQuestionIndex]) return true;
                          return answers.some(a => a.participantId === p.id && a.questionIndex === selectedQuestionIndex);
                        });
                        const hasQuizPassword = Boolean(quizConfig.password && quizConfig.password.trim() !== '');
                        const { isAllAnswered } = getQuizAnswerProgress();
                        const isAutoFacitRevealed = !hasQuizPassword && isQuestionAnsweredByAll;
                        const shouldShowFacit = isFacitUnlocked || isAdmin || isAutoFacitRevealed;

                        const participantAnswer = answers.find(a => a.participantId === activePartId && a.questionIndex === selectedQuestionIndex);
                        const isParticipantAnswered = !!participantAnswer;
                        
                        return (
                          <>
                            <div className="mb-4 sm:mb-6 relative">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <span className={`px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white ${
                                  isBarn ? 'bg-amber-400' : 'bg-pink-400'
                                }`}>
                                  {currentParticipant?.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')} - {currentParticipant?.name}
                                </span>
                                <span className="text-indigo-500 font-black text-xs sm:text-sm uppercase tracking-widest opacity-40">{t(lang, 'question')} {selectedQuestionIndex + 1}</span>

                                {(() => {
                                  const qLangs = getQuestionAvailableLanguages(rawQ);
                                  return (
                                    <div className="flex items-center gap-1 ml-auto shrink-0 bg-slate-100/90 border border-slate-200 px-2 py-0.5 rounded-full" title={t(lang, 'availableLanguagesLabel')}>
                                      <Globe className="w-3 h-3 text-indigo-500 shrink-0" />
                                      {qLangs.map(l => (
                                        <span
                                          key={l.code}
                                          className={`text-xs px-1 rounded transition-all ${
                                            l.code === lang ? 'bg-indigo-600 text-white font-black scale-110' : 'opacity-80 hover:opacity-100'
                                          }`}
                                          title={`${l.name} (${l.code === (rawQ.originalLanguage || 'sv') ? t(lang, 'questionOriginalLang') : t(lang, 'translationsAvailable')})`}
                                        >
                                          {l.flag}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                              <h3 className="text-2xl sm:text-4xl font-black leading-tight text-slate-800">
                                {activeQ.text}
                              </h3>

                              {/* Question Image if present */}
                              {activeQ.imageUrl && (
                                <div className="mt-3 sm:mt-4">
                                  <div 
                                    className="relative group rounded-2xl overflow-hidden border-2 border-slate-200 shadow-md bg-slate-100 max-h-72 sm:max-h-96 flex items-center justify-center cursor-pointer"
                                    onClick={() => setZoomedImageUrl(activeQ.imageUrl || null)}
                                    title={t(lang, 'previewImage')}
                                  >
                                    <OfflineImage
                                      src={activeQ.imageUrl}
                                      alt={activeQ.text}
                                      className="max-h-72 sm:max-h-96 w-full object-contain group-hover:scale-[1.01] transition-transform"
                                    />
                                    <div className="absolute bottom-2 right-2 bg-black/65 hover:bg-black/85 text-white text-xs font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5 backdrop-blur-xs transition-colors">
                                      <Maximize2 className="w-3.5 h-3.5" />
                                      <span>{t(lang, 'previewImage')}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Auto Facit Banner if all participants answered & password is blank */}
                              {isAutoFacitRevealed ? (
                                <div className="mt-4 p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">🎉</span>
                                    <span className="text-xs sm:text-sm font-black text-emerald-900">{t(lang, 'allParticipantsAnsweredBanner')}</span>
                                  </div>
                                  <span className="text-[10px] font-black uppercase bg-emerald-200 text-emerald-900 px-2.5 py-1 rounded-lg">
                                    {t(lang, 'correctAnswer')}
                                  </span>
                                </div>
                              ) : isParticipantAnswered ? (
                                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between gap-2 shadow-xs">
                                  <div className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                                    <span className="text-xs font-bold text-indigo-950">{t(lang, 'questionAlreadyAnswered')}</span>
                                  </div>
                                  <span className="text-[10px] font-black uppercase bg-indigo-200 text-indigo-900 px-2.5 py-0.5 rounded-lg">
                                    {t(lang, 'answerAlreadySubmitted')}
                                  </span>
                                </div>
                              ) : null}

                              {activeQ.location && (
                                <div className="mt-4 space-y-3">
                                  {(() => {
                                    const isTreasure = !!activeQ.hideLocationOnMap || !!activeQ.location?.hideOnMap;
                                    return (
                                      <div className={`p-3.5 border-2 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm ${
                                        isTreasure 
                                          ? 'bg-amber-50/90 border-amber-200/90 text-amber-950' 
                                          : 'bg-indigo-50/90 border-indigo-200/80 text-indigo-950'
                                      }`}>
                                        <div className="flex items-center gap-3">
                                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                                            isTreasure ? 'bg-amber-600 text-white text-lg' : 'bg-indigo-600 text-white'
                                          }`}>
                                            {isTreasure ? '🕵️‍♂️' : <MapPin className="w-5 h-5" />}
                                          </div>
                                          <div>
                                            <p className={`text-[10px] font-black uppercase tracking-widest ${
                                              isTreasure ? 'text-amber-700' : 'text-indigo-600'
                                            }`}>
                                              {isTreasure ? t(lang, 'treasureHuntQuestionViewTitle') : t(lang, 'geotaggedStations')}
                                            </p>
                                            <div className="pt-0.5">
                                              {isTreasure ? (
                                                <span className="text-xs font-bold text-amber-900">
                                                  {t(lang, 'treasureHuntQuestionViewDesc')}
                                                </span>
                                              ) : (
                                                <CompassDirectionBadge 
                                                  userLocation={userLocation}
                                                  targetLocation={activeQ.location}
                                                  unlockDistance={quizConfig.geotagUnlockDistance || 20}
                                                  lang={lang}
                                                />
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => setShowQuestionMiniMap(prev => !prev)}
                                            className="text-xs font-black bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                                          >
                                            <Compass className={`w-3.5 h-3.5 ${isTreasure ? 'text-amber-600' : 'text-indigo-600'}`} />
                                            <span>{showQuestionMiniMap ? t(lang, 'hideMiniMap') : t(lang, 'showMiniMap')}</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedQuestionIndex(null);
                                              setSelectedParticipantId(null);
                                            }}
                                            className={`text-xs font-black text-white px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all ${
                                              isTreasure ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
                                            }`}
                                          >
                                            <Map className="w-3.5 h-3.5" />
                                            <span>{t(lang, 'allQuestionsAndMap')}</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {showQuestionMiniMap && (
                                    <MiniStationMap
                                      userLocation={userLocation}
                                      targetLocation={activeQ.location}
                                      unlockDistance={quizConfig.geotagUnlockDistance || 20}
                                      stationNumber={selectedQuestionIndex + 1}
                                      isAnswered={participants.length > 0 && participants.every(p => answers.some(a => a.participantId === p.id && a.questionIndex === selectedQuestionIndex))}
                                      questionType={activeQ.type}
                                      lang={lang}
                                      walkedPath={walkedPath}
                                      onExpand={() => {
                                        setSelectedQuestionIndex(null);
                                        setSelectedParticipantId(null);
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>

                            {activeQ.type === 'points' ? (
                              <div className="bg-indigo-50/80 border-4 border-indigo-200 rounded-[2rem] p-6 sm:p-8 space-y-6 text-center shadow-lg">
                                <div className="space-y-1">
                                  <div className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
                                    <Trophy className="w-4 h-4" />
                                    <span>{t(lang, 'pointQuestion')}</span>
                                  </div>
                                  <p className="text-xs sm:text-sm text-slate-600 font-semibold pt-2">
                                    {t(lang, 'answeringAs', { name: currentParticipant?.name || '' })}
                                  </p>
                                  {activeQ.maxPoints && (
                                    <p className="text-xs text-indigo-700 font-bold">
                                      {t(lang, 'maxPoints')}: {activeQ.maxPoints} p
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center justify-center gap-3 sm:gap-6">
                                  <button
                                    type="button"
                                    disabled={isParticipantAnswered}
                                    onClick={() => setPointsInputValue(prev => Math.max(0, prev - 1))}
                                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl border-4 transition-all ${
                                      isParticipantAnswered
                                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                                        : 'bg-white border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 shadow-md active:scale-90'
                                    }`}
                                  >
                                    -
                                  </button>

                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      max={activeQ.maxPoints ?? undefined}
                                      disabled={isParticipantAnswered}
                                      value={isParticipantAnswered ? (participantAnswer?.pointsScored ?? 0) : pointsInputValue}
                                      onChange={(e) => {
                                        if (isParticipantAnswered) return;
                                        const val = parseInt(e.target.value, 10);
                                        if (!isNaN(val)) {
                                          setPointsInputValue(Math.max(0, activeQ.maxPoints ? Math.min(activeQ.maxPoints, val) : val));
                                        } else {
                                          setPointsInputValue(0);
                                        }
                                      }}
                                      className={`w-28 sm:w-36 h-16 sm:h-20 border-4 rounded-3xl text-center text-3xl sm:text-5xl font-black shadow-inner outline-none ${
                                        isParticipantAnswered
                                          ? 'bg-slate-100 border-slate-300 text-slate-600 cursor-not-allowed'
                                          : 'bg-white border-indigo-500 text-indigo-950'
                                      }`}
                                    />
                                    <span className="block text-[11px] font-black uppercase tracking-widest text-indigo-500 mt-1">{t(lang, 'points')}</span>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={isParticipantAnswered}
                                    onClick={() => setPointsInputValue(prev => activeQ.maxPoints ? Math.min(activeQ.maxPoints, prev + 1) : prev + 1)}
                                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl transition-all ${
                                      isParticipantAnswered
                                        ? 'bg-slate-300 text-slate-400 cursor-not-allowed opacity-50'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 active:scale-90'
                                    }`}
                                  >
                                    +
                                  </button>
                                </div>

                                {!isParticipantAnswered && (
                                  <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                                    {[1, 5, 10].map(step => (
                                      <button
                                        key={step}
                                        type="button"
                                        onClick={() => setPointsInputValue(prev => activeQ.maxPoints ? Math.min(activeQ.maxPoints, prev + step) : prev + step)}
                                        className="px-3.5 py-1.5 bg-white border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black shadow-sm active:scale-95 transition-all"
                                      >
                                        +{step} p
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setPointsInputValue(0)}
                                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl text-xs font-black active:scale-95 transition-all"
                                    >
                                      {t(lang, 'resetPoints')}
                                    </button>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  disabled={isParticipantAnswered}
                                  onClick={() => submitPointsAnswer(pointsInputValue)}
                                  className={`w-full py-4 sm:py-5 rounded-2xl font-black text-base sm:text-lg uppercase transition-all flex items-center justify-center gap-2 ${
                                    isParticipantAnswered
                                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed shadow-none'
                                      : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-200 active:scale-95'
                                  }`}
                                >
                                  <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                                  <span>
                                    {isParticipantAnswered
                                      ? `${t(lang, 'answerAlreadySubmitted')} (${participantAnswer?.pointsScored ?? 0} p)`
                                      : t(lang, 'savePointsBtn', { points: pointsInputValue.toString() })}
                                  </span>
                                </button>
                              </div>
                            ) : activeQ.type === 'text' ? (
                              <div className="bg-sky-50/80 border-4 border-sky-200 rounded-[2rem] p-6 sm:p-8 space-y-6 text-center shadow-lg">
                                <div className="space-y-1">
                                  <div className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
                                    <span>🔤</span>
                                    <span>{t(lang, 'textQuestionType')}</span>
                                  </div>
                                  <p className="text-xs text-sky-700 font-medium">
                                    {t(lang, 'soundexOfflineNote')}
                                  </p>
                                </div>

                                <div className="space-y-3 max-w-md mx-auto">
                                  <input
                                    type="text"
                                    disabled={isParticipantAnswered}
                                    value={isParticipantAnswered ? (participantAnswer?.textAnswer || '') : textInputValue}
                                    onChange={(e) => {
                                      if (!isParticipantAnswered) setTextInputValue(e.target.value);
                                    }}
                                    onKeyDown={(e) => {
                                      if (!isParticipantAnswered && e.key === 'Enter' && textInputValue.trim()) {
                                        submitTextAnswer(textInputValue);
                                      }
                                    }}
                                    placeholder={t(lang, 'textAnswerPlaceholder')}
                                    className={`w-full p-4 sm:p-5 border-4 rounded-2xl text-center text-lg sm:text-xl font-black shadow-inner outline-none transition-all placeholder:text-slate-300 placeholder:font-bold ${
                                      isParticipantAnswered
                                        ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed'
                                        : 'bg-white border-sky-400 focus:border-sky-600 text-slate-800'
                                    }`}
                                    autoFocus={!isParticipantAnswered}
                                  />

                                  {shouldShowFacit && activeQ.correctTextAnswer && (
                                    <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                                      <span>✅ {t(lang, 'correctAnswer')}:</span>
                                      <span className="font-black underline">{activeQ.correctTextAnswer}</span>
                                    </div>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={isParticipantAnswered || !textInputValue.trim()}
                                  onClick={() => submitTextAnswer(textInputValue)}
                                  className={`w-full py-4 sm:py-5 rounded-2xl font-black text-base sm:text-lg uppercase transition-all flex items-center justify-center gap-2 ${
                                    isParticipantAnswered
                                      ? 'bg-slate-300 text-slate-600 cursor-not-allowed shadow-none'
                                      : 'bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-xl shadow-sky-200 active:scale-95'
                                  }`}
                                >
                                  <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                                  <span>
                                    {isParticipantAnswered ? t(lang, 'answerAlreadySubmitted') : t(lang, 'submitTextAnswerBtn')}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 flex-1">
                                {activeQ.options.map((opt, idx) => {
                                  const colors = ['border-rose-500 bg-rose-50 text-rose-600 hover:bg-rose-100', 'border-amber-500 bg-amber-50 text-amber-600 hover:bg-amber-100', 'border-emerald-500 bg-emerald-50 text-emerald-600 hover:bg-emerald-100', 'border-sky-500 bg-sky-50 text-sky-600 hover:bg-sky-100'];
                                  const color = colors[idx % colors.length];
                                  const isCurrentAnswer = participantAnswer?.answerIndex === idx;
                                  const isCorrectAnswer = (activeQ?.correctAnswers || []).includes(idx);
                                  const optImg = activeQ.optionImages?.[idx] || rawQ.optionImages?.[idx];

                                  return (
                                    <button
                                      key={idx}
                                      disabled={isParticipantAnswered}
                                      onClick={() => !isParticipantAnswered && submitAnswer(idx)}
                                      className={`p-3.5 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border-4 flex flex-col sm:flex-row items-center justify-between text-left text-base sm:text-lg font-black transition-all gap-3 ${
                                        isParticipantAnswered
                                          ? isCurrentAnswer
                                            ? 'ring-4 ring-indigo-600 ring-offset-4 bg-indigo-100/90 border-indigo-500 text-indigo-950 cursor-default shadow-md'
                                            : shouldShowFacit && isCorrectAnswer
                                              ? 'ring-4 ring-emerald-500 ring-offset-4 bg-emerald-100 border-emerald-600 text-emerald-700 cursor-default shadow-md'
                                              : 'bg-slate-100/80 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed shadow-none'
                                          : `active:scale-95 shadow-[0_4px_0_0_rgba(0,0,0,0.1)] sm:shadow-[0_6px_0_0_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-y-1 ${color}`
                                      } ${
                                        !isParticipantAnswered && isCurrentAnswer ? 'ring-4 ring-indigo-600 ring-offset-4' : ''
                                      } ${
                                        !isParticipantAnswered && shouldShowFacit && isCorrectAnswer 
                                          ? 'ring-4 ring-emerald-500 ring-offset-4 bg-emerald-100 border-emerald-600 text-emerald-700' 
                                          : ''
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 w-full min-w-0">
                                        {optImg && (
                                          <div 
                                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-white/90 shadow-xs shrink-0 bg-black/5 relative group cursor-pointer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setZoomedImageUrl(optImg);
                                            }}
                                            title={t(lang, 'previewImage')}
                                          >
                                            <OfflineImage 
                                              src={optImg} 
                                              alt={`Alternativ ${idx + 1}`} 
                                              className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                            />
                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                              <Maximize2 className="w-3.5 h-3.5" />
                                            </div>
                                          </div>
                                        )}
                                        <span className="flex-1 min-w-0 break-words leading-tight">{opt}</span>
                                      </div>
                                      {isParticipantAnswered ? (
                                        shouldShowFacit ? (
                                          isCorrectAnswer ? (
                                            <div className="bg-emerald-600 text-white p-1.5 rounded-xl self-end sm:self-center shrink-0 shadow-sm flex items-center gap-1">
                                              <Check className="w-4 h-4 stroke-[3]" />
                                            </div>
                                          ) : isCurrentAnswer ? (
                                            <div className="bg-rose-600 text-white p-1.5 rounded-xl self-end sm:self-center shrink-0 shadow-sm flex items-center gap-1">
                                              <X className="w-4 h-4 stroke-[3]" />
                                            </div>
                                          ) : null
                                        ) : isCurrentAnswer ? (
                                          <div className="bg-indigo-600 text-white px-2 py-1 rounded-xl text-[10px] font-black uppercase self-end sm:self-center shrink-0 shadow-sm flex items-center gap-1">
                                            <Check className="w-3 h-3 stroke-[3]" />
                                            <span>{t(lang, 'answerAlreadySubmitted')}</span>
                                          </div>
                                        ) : null
                                      ) : shouldShowFacit && isCorrectAnswer ? (
                                        <div className="bg-emerald-600 text-white p-1.5 rounded-xl self-end sm:self-center shrink-0 shadow-sm">
                                          <Check className="w-5 h-5 stroke-[3]" />
                                        </div>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      
                      {participants.length > 1 && (
                        <button 
                          onClick={() => setSelectedParticipantId(null)}
                          className="mt-6 sm:mt-8 text-slate-400 font-bold hover:text-slate-600 transition-colors text-sm"
                        >
                          {t(lang, 'changePerson')}
                        </button>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
  );
});
