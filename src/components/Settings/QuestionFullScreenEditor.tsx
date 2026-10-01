/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Trash2,
  MapPin,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Check,
  CheckSquare,
  Search,
  Maximize2,
  Globe,
  HelpCircle,
  Locate,
  ChevronLeft,
  ChevronRight,
  Upload,
  Trophy
} from 'lucide-react';
import { Question, QuizConfig, UserType, Location, QuestionType } from '../../types';
import { Language, SUPPORTED_LANGUAGES, t, translateQuestion } from '../../i18n';
import { AdminMapPicker } from '../MapComponent';
import { evaluateTextAnswer, soundex, detectLinguisticLanguage } from '../../utils/soundex';
import { findLocationCoordinatesWithGemini } from '../../geminiClient';
import { compressImageFile, getOptionLabel } from '../../utils/imageAndLabelUtils';
import { registerQuestionTranslation } from '../../translationCache';
import { OfflineImage } from '../Common/OfflineImage';
import { cacheImageInIndexedDB } from '../../utils/offlineImageCache';

export interface QuestionFullScreenEditorProps {
  questionId: string | null;
  onClose: () => void;
  editingQuestionsCategory: UserType;
  setEditingQuestionsCategory: (c: UserType) => void;
  quizConfig: QuizConfig;
  setQuizConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
  updateQuestion: (category: UserType, id: string, updates: Partial<Question>) => void;
  updateQuestionAcrossAllLanguages?: (category: UserType, index: number, updater: (q: Question) => Question) => void;
  toggleQuestionCategory?: (targetCategory: UserType, qId: string, currentChecked: boolean) => void;
  handleGeotagQuestion: (category: UserType, questionId: string, loc: Location | undefined) => void;
  handleAiGeotagSingleQuestion: (category: UserType, questionId: string, placeOrText?: string) => Promise<void>;
  isAiGeotagging: boolean;
  userLocation: { lat: number; lng: number } | null;
  isAdmin?: boolean;
  lang: Language;
  setZoomedImageUrl: (url: string | null) => void;
}

export const QuestionFullScreenEditor: React.FC<QuestionFullScreenEditorProps> = ({
  questionId,
  onClose,
  editingQuestionsCategory,
  setEditingQuestionsCategory,
  quizConfig,
  setQuizConfig,
  updateQuestion,
  updateQuestionAcrossAllLanguages,
  toggleQuestionCategory,
  handleGeotagQuestion,
  handleAiGeotagSingleQuestion,
  isAiGeotagging,
  userLocation,
  isAdmin = true,
  lang,
  setZoomedImageUrl
}) => {
  const [isSearchingPlace, setIsSearchingPlace] = useState<Record<string, boolean>>({});
  const [isAiGeotaggingSingle, setIsAiGeotaggingSingle] = useState<Record<string, boolean>>({});
  const [searchPlaceQuery, setSearchPlaceQuery] = useState<Record<string, string>>({});

  const toggleQuestionTargetGroup = (qId: string, group: UserType, checked: boolean) => {
    setQuizConfig(prev => {
      const isBarn = group === 'barn';
      const source = isBarn ? prev.barnQuestions : prev.vuxenQuestions;
      const target = isBarn ? prev.vuxenQuestions : prev.barnQuestions;
      const q = source.find(item => item.id === qId) || target.find(item => item.id === qId);
      if (!q) return prev;

      if (checked) {
        if (isBarn) {
          if (!prev.barnQuestions.some(item => item.id === qId)) {
            return { ...prev, barnQuestions: [...prev.barnQuestions, { ...q }] };
          }
        } else {
          if (!prev.vuxenQuestions.some(item => item.id === qId)) {
            return { ...prev, vuxenQuestions: [...prev.vuxenQuestions, { ...q }] };
          }
        }
      } else {
        if (isBarn && prev.barnQuestions.some(item => item.id === qId) && prev.vuxenQuestions.length > 0) {
          return { ...prev, barnQuestions: prev.barnQuestions.filter(item => item.id !== qId) };
        } else if (!isBarn && prev.vuxenQuestions.some(item => item.id === qId) && prev.barnQuestions.length > 0) {
          return { ...prev, vuxenQuestions: prev.vuxenQuestions.filter(item => item.id !== qId) };
        }
      }
      return prev;
    });
  };

  const handleSearchAndGeotagPlace = async (category: UserType, qId: string, placeQuery: string) => {
    if (!placeQuery.trim()) return;
    setIsSearchingPlace(prev => ({ ...prev, [qId]: true }));
    try {
      const coords = await findLocationCoordinatesWithGemini(placeQuery);
      if (coords) {
        handleGeotagQuestion(category, qId, {
          lat: coords.lat,
          lng: coords.lng,
          name: coords.name || placeQuery
        });
      } else {
        alert(t(lang, 'locationSearchNotFound'));
      }
    } catch (err) {
      console.error(err);
      alert(t(lang, 'locationSearchError'));
    } finally {
      setIsSearchingPlace(prev => ({ ...prev, [qId]: false }));
    }
  };

  const allTagged = [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions]
    .map(q => q.location)
    .filter((loc): loc is Location => !!loc);
  const lastTaggedLocation = allTagged.length > 0 ? allTagged[allTagged.length - 1] : null;

  const [editingQuestionLang, setEditingQuestionLang] = useState<Language>(lang);
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [showQuestionMore, setShowQuestionMore] = useState(false);

  const [editorTestWord, setEditorTestWord] = useState('');

  return (
    <AnimatePresence>
      {questionId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-0 sm:p-6"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="w-full h-full sm:h-auto sm:max-h-[90vh] bg-slate-50 flex flex-col sm:rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden max-w-5xl mx-auto"
              >
                {(() => {
                  const questions = editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                  const rawQ = quizConfig.barnQuestions.find(item => item.id === questionId) || quizConfig.vuxenQuestions.find(item => item.id === questionId);
                  if (!rawQ) return null;
                  const qIdx = questions.indexOf(rawQ) >= 0 ? questions.indexOf(rawQ) : 0;

                  const isOriginalLang = editingQuestionLang === (rawQ.originalLanguage || 'sv');
                  const currentLangOption = SUPPORTED_LANGUAGES.find(l => l.code === editingQuestionLang) || SUPPORTED_LANGUAGES[0];

                  let displayText = '';
                  let displayOptions: string[] = [];

                  if (isOriginalLang) {
                    displayText = rawQ.text;
                    displayOptions = rawQ.options || [];
                  } else if (rawQ.translations?.[editingQuestionLang]) {
                    displayText = rawQ.translations[editingQuestionLang].text;
                    displayOptions = rawQ.translations[editingQuestionLang].options || rawQ.options || [];
                  } else {
                    const trans = translateQuestion(rawQ.id, rawQ.text, rawQ.options || [], editingQuestionLang, rawQ.originalLanguage);
                    displayText = trans.text;
                    displayOptions = trans.options || rawQ.options || [];
                  }

                  const q = { ...rawQ, text: displayText, options: displayOptions };
                  const isBarnChecked = quizConfig.barnQuestions.some(item => item.id === q.id);
                  const isVuxenChecked = quizConfig.vuxenQuestions.some(item => item.id === q.id);

                  const goToNextLang = () => {
                    const currentIdx = SUPPORTED_LANGUAGES.findIndex(l => l.code === editingQuestionLang);
                    const nextIdx = (currentIdx + 1) % SUPPORTED_LANGUAGES.length;
                    setSlideDirection(1);
                    setEditingQuestionLang(SUPPORTED_LANGUAGES[nextIdx].code);
                  };

                  const goToPrevLang = () => {
                    const currentIdx = SUPPORTED_LANGUAGES.findIndex(l => l.code === editingQuestionLang);
                    const prevIdx = (currentIdx - 1 + SUPPORTED_LANGUAGES.length) % SUPPORTED_LANGUAGES.length;
                    setSlideDirection(-1);
                    setEditingQuestionLang(SUPPORTED_LANGUAGES[prevIdx].code);
                  };

                  const handleTouchStart = (e: React.TouchEvent) => {
                    touchStartX.current = e.touches[0].clientX;
                    touchStartY.current = e.touches[0].clientY;
                  };

                  const handleTouchEnd = (e: React.TouchEvent) => {
                    if (touchStartX.current === null || touchStartY.current === null) return;
                    const diffX = e.changedTouches[0].clientX - touchStartX.current;
                    const diffY = e.changedTouches[0].clientY - touchStartY.current;

                    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
                      if (diffX < 0) {
                        goToNextLang();
                      } else {
                        goToPrevLang();
                      }
                    }
                    touchStartX.current = null;
                    touchStartY.current = null;
                  };

                  const handleTextChange = (newText: string) => {
                    if (!isAdmin) return;
                    if (isOriginalLang) {
                      updateQuestion(editingQuestionsCategory, rawQ.id, { text: newText });
                    } else {
                      const updatedTrans = {
                        text: newText,
                        options: displayOptions
                      };
                      updateQuestion(editingQuestionsCategory, rawQ.id, {
                        translations: {
                          ...(rawQ.translations || {}),
                          [editingQuestionLang]: updatedTrans
                        }
                      });
                      registerQuestionTranslation(
                        rawQ.id,
                        rawQ.originalLanguage || 'sv',
                        rawQ.text,
                        editingQuestionLang,
                        updatedTrans
                      );
                    }
                  };

                  const handleOptionChange = (oIdx: number, newOptVal: string) => {
                    if (!isAdmin) return;
                    if (isOriginalLang) {
                      const newOpts = [...q.options];
                      newOpts[oIdx] = newOptVal;
                      updateQuestion(editingQuestionsCategory, rawQ.id, { options: newOpts });
                    } else {
                      const newOpts = [...q.options];
                      newOpts[oIdx] = newOptVal;
                      const updatedTrans = {
                        text: displayText,
                        options: newOpts
                      };
                      updateQuestion(editingQuestionsCategory, rawQ.id, {
                        translations: {
                          ...(rawQ.translations || {}),
                          [editingQuestionLang]: updatedTrans
                        }
                      });
                      registerQuestionTranslation(
                        rawQ.id,
                        rawQ.originalLanguage || 'sv',
                        rawQ.text,
                        editingQuestionLang,
                        updatedTrans
                      );
                    }
                  };

                  const handleAddOption = () => {
                    if (!isAdmin) return;
                    const newOptVal = `${t(editingQuestionLang, 'optionPlaceholder', { num: (q.options.length + 1).toString() })}`;
                    const newOpts = [...q.options, newOptVal];
                    if (isOriginalLang) {
                      updateQuestion(editingQuestionsCategory, rawQ.id, { options: newOpts });
                    } else {
                      const updatedTrans = { text: displayText, options: newOpts };
                      updateQuestion(editingQuestionsCategory, rawQ.id, {
                        translations: {
                          ...(rawQ.translations || {}),
                          [editingQuestionLang]: updatedTrans
                        }
                      });
                      registerQuestionTranslation(
                        rawQ.id,
                        rawQ.originalLanguage || 'sv',
                        rawQ.text,
                        editingQuestionLang,
                        updatedTrans
                      );
                    }
                  };

                  const handleRemoveOption = (oIdx: number) => {
                    if (!isAdmin || q.options.length <= 1) return;
                    const newOpts = q.options.filter((_, idx) => idx !== oIdx);
                    if (isOriginalLang) {
                      let newCorrect = (q?.correctAnswers || [])
                        .filter(idx => idx !== oIdx)
                        .map(idx => idx > oIdx ? idx - 1 : idx);
                      if (newCorrect.length === 0) newCorrect = [0];

                      updateQuestion(editingQuestionsCategory, rawQ.id, { 
                        options: newOpts,
                        correctAnswers: newCorrect
                      });
                    } else {
                      const updatedTrans = { text: displayText, options: newOpts };
                      updateQuestion(editingQuestionsCategory, rawQ.id, {
                        translations: {
                          ...(rawQ.translations || {}),
                          [editingQuestionLang]: updatedTrans
                        }
                      });
                      registerQuestionTranslation(
                        rawQ.id,
                        rawQ.originalLanguage || 'sv',
                        rawQ.text,
                        editingQuestionLang,
                        updatedTrans
                      );
                    }
                  };

                  return (
                    <>
                      {/* Editor Header */}
                      <header className="p-4 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0 gap-4 border-b border-slate-800">
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black text-indigo-300 shrink-0">
                            {qIdx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="text-base sm:text-xl font-black uppercase tracking-tight truncate">{t(lang, 'editQuestionTitle')}</h2>
                              <span className="text-xl shrink-0">{currentLangOption.flag}</span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest truncate">
                              {quizConfig.title} • {t(lang, 'categorySubheading', { category: editingQuestionsCategory === 'barn' ? t(lang, 'kid') : t(lang, 'adult') })}
                            </p>
                          </div>
                        </div>

                        {/* Language Switcher Bar */}
                        <div className="flex items-center justify-between md:justify-end gap-2 min-w-0 flex-1 md:flex-none md:max-w-[55%] ml-auto">
                          <div className="flex items-center min-w-0 w-full bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 shadow-inner gap-1">
                            <button
                              type="button"
                              onClick={goToPrevLang}
                              title="Föregående språk (svep höger)"
                              className="w-8 h-8 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-90 shrink-0"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar scroll-smooth snap-x">
                              {SUPPORTED_LANGUAGES.map((l) => {
                                const isSelected = editingQuestionLang === l.code;
                                const isOrig = l.code === (rawQ.originalLanguage || 'sv');
                                return (
                                  <button
                                    key={l.code}
                                    type="button"
                                    onClick={() => {
                                      const currentIdx = SUPPORTED_LANGUAGES.findIndex(item => item.code === editingQuestionLang);
                                      const newIdx = SUPPORTED_LANGUAGES.findIndex(item => item.code === l.code);
                                      setSlideDirection(newIdx > currentIdx ? 1 : -1);
                                      setEditingQuestionLang(l.code);
                                    }}
                                    className={`px-2.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 shrink-0 ${
                                      isSelected
                                        ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-400/50 scale-105'
                                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                    }`}
                                  >
                                    <span className="text-base leading-none">{l.flag}</span>
                                    <span className="uppercase text-[10px] tracking-wider">{l.code}</span>
                                    {isOrig && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title={t(lang, 'originalLangTag')} />}
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              onClick={goToNextLang}
                              title="Nästa språk (svep vänster)"
                              className="w-8 h-8 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-90 shrink-0"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>

                          <button 
                            onClick={() => onClose()}
                            className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition-all active:scale-90 text-white shrink-0"
                          >
                            <X className="w-6 h-6 stroke-[3]" />
                          </button>
                        </div>
                      </header>

                      {/* Editor Content */}
                      <div 
                        className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 custom-scrollbar touch-pan-y"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                      >
                        {/* Language Banner & Swipe Indicator */}
                        <div className="bg-gradient-to-r from-indigo-50 to-slate-50 border border-indigo-100/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl leading-none">{currentLangOption.flag}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-slate-900">{currentLangOption.name}</span>
                              {isOriginalLang ? (
                                <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300/80 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                  ⭐ {t(lang, 'originalLangTag')}
                                </span>
                              ) : (
                                <span className="text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-200 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                  🌐 {t(lang, 'translationTag')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-[11px] text-indigo-600 font-bold bg-indigo-100/60 px-3 py-1 rounded-xl flex items-center gap-1.5">
                            <span>{t(lang, 'swipeLanguageHint')}</span>
                          </div>
                        </div>

                        {/* Animated Container for Question Text and Options */}
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={editingQuestionLang}
                            initial={{ opacity: 0, x: slideDirection * 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -slideDirection * 30 }}
                            transition={{ duration: 0.18 }}
                            className="space-y-6"
                          >
                            {/* Question Text */}
                            <div className="space-y-2.5">
                              <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                                {t(lang, 'questionTextLabel')} ({currentLangOption.code.toUpperCase()})
                              </label>
                              <textarea 
                                className={`w-full p-4 sm:p-6 border-2 rounded-3xl text-base sm:text-xl outline-none font-bold transition-all ${
                                  isAdmin 
                                    ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-xs' 
                                    : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                }`}
                                value={q.text}
                                rows={3}
                                placeholder={t(lang, 'writeQuestionPlaceholder')}
                                readOnly={!isAdmin}
                                onChange={(e) => handleTextChange(e.target.value)}
                              />
                            </div>

                            {/* Question Image Section */}
                            <div className="p-4 sm:p-5 bg-indigo-50/60 border border-indigo-100 rounded-3xl space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>{t(lang, 'questionImageLabel')}</span>
                                </label>
                                {rawQ.imageUrl && isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => updateQuestion(editingQuestionsCategory, q.id, { imageUrl: undefined })}
                                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>{t(lang, 'removeImageBtn')}</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                <input
                                  type="url"
                                  disabled={!isAdmin}
                                  value={rawQ.imageUrl || ''}
                                  placeholder={t(lang, 'imageUrlPlaceholder')}
                                  onChange={(e) => {
                                    const val = e.target.value.trim() || undefined;
                                    updateQuestion(editingQuestionsCategory, q.id, { imageUrl: val });
                                    if (val && val.startsWith('http')) {
                                      cacheImageInIndexedDB(val);
                                    }
                                  }}
                                  className="flex-1 p-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs font-semibold text-slate-800 outline-none shadow-2xs"
                                />
                                {isAdmin && (
                                  <label className="cursor-pointer px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shrink-0 transition-all shadow-sm active:scale-95">
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>{t(lang, 'uploadImageBtn')}</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          try {
                                            const dataUrl = await compressImageFile(file);
                                            updateQuestion(editingQuestionsCategory, q.id, { imageUrl: dataUrl });
                                          } catch (err) {
                                            alert('Kunde inte läsa in bilden.');
                                          }
                                        }
                                      }}
                                    />
                                  </label>
                                )}
                              </div>

                              {rawQ.imageUrl && (
                                <div className="pt-2 flex items-center gap-3">
                                  <div 
                                    className="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-indigo-200 shadow-sm cursor-pointer bg-slate-100 shrink-0"
                                    onClick={() => setZoomedImageUrl(rawQ.imageUrl || null)}
                                    title={t(lang, 'previewImage')}
                                  >
                                    <OfflineImage 
                                      src={rawQ.imageUrl} 
                                      alt="Preview" 
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                    />
                                    <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                      <Maximize2 className="w-4 h-4" />
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-600 space-y-0.5">
                                    <p className="font-bold text-slate-800">{t(lang, 'questionImageLabel')}</p>
                                    <p className="text-[11px] text-slate-500">{t(lang, 'previewImage')}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Question Type Switcher */}
                            <div className="space-y-3">
                              <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{t(lang, 'questionTypeLabel')}</label>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <button 
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() => {
                                    if ((q.type || 'options') !== 'options') {
                                      updateQuestion(editingQuestionsCategory, q.id, { 
                                        type: 'options',
                                        options: q.options && q.options.length > 0 ? q.options : [t(lang, 'defaultOption1'), t(lang, 'defaultOptionX'), t(lang, 'defaultOption2')],
                                        correctAnswers: q.correctAnswers && q.correctAnswers.length > 0 ? q.correctAnswers : [0]
                                      });
                                    }
                                  }}
                                  className={`p-3.5 sm:p-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${
                                    (q.type || 'options') === 'options'
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <CheckSquare className="w-4 h-4" />
                                  <span>{t(lang, 'optionsQuestionType')}</span>
                                </button>

                                <button 
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() => {
                                    if (q.type !== 'text') {
                                      updateQuestion(editingQuestionsCategory, q.id, { 
                                        type: 'text',
                                        correctTextAnswer: q.correctTextAnswer || (q.options && q.options.length > 0 ? q.options[0] : 'Rätt svar'),
                                        acceptedTextAnswers: q.acceptedTextAnswers || []
                                      });
                                    }
                                  }}
                                  className={`p-3.5 sm:p-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${
                                    q.type === 'text'
                                      ? 'bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-sky-200'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="text-sm">🔤</span>
                                  <span>{t(lang, 'textQuestionType')}</span>
                                </button>

                                <button 
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() => {
                                    if (q.type !== 'points') {
                                      updateQuestion(editingQuestionsCategory, q.id, { 
                                        type: 'points',
                                        maxPoints: q.maxPoints || 10
                                      });
                                    }
                                  }}
                                  className={`p-3.5 sm:p-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${
                                    q.type === 'points'
                                      ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-200'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <Trophy className="w-4 h-4" />
                                  <span>{t(lang, 'pointsQuestionType')}</span>
                                </button>
                              </div>
                            </div>

                            {/* Options, Text, or Points Configuration */}
                            {q.type === 'points' ? (
                              <div className="space-y-5 p-6 sm:p-8 bg-amber-50/80 border-2 border-amber-200 rounded-3xl">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-amber-500 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-sm">
                                    🎯
                                  </div>
                                  <div>
                                    <h4 className="font-black text-sm sm:text-base text-amber-950 uppercase tracking-wide">{t(lang, 'maxPointsTitle')}</h4>
                                    <p className="text-xs text-amber-800 font-medium">{t(lang, 'maxPointsDesc')}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 pt-2">
                                  <input 
                                    type="number"
                                    min="1"
                                    max="1000"
                                    disabled={!isAdmin}
                                    className="w-32 p-3.5 bg-white border-2 border-amber-300 rounded-2xl text-xl font-black text-amber-950 outline-none focus:border-amber-500 shadow-inner"
                                    value={rawQ.maxPoints || 10}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      updateQuestion(editingQuestionsCategory, q.id, {
                                        maxPoints: isNaN(val) ? 1 : Math.max(1, val)
                                      });
                                    }}
                                  />
                                  <span className="font-black text-sm text-amber-900 uppercase tracking-wider">{t(lang, 'pointsMaxLabel')}</span>
                                </div>

                                {/* Group Checkboxes for Poängfrågor */}
                                <div className="pt-4 border-t border-amber-200/80 space-y-3">
                                  <div>
                                    <h5 className="font-black text-xs sm:text-sm text-amber-950 uppercase tracking-wider">{t(lang, 'targetGroupsLabel')}</h5>
                                    <p className="text-[11px] text-amber-800 font-medium">{t(lang, 'targetGroupsDesc')}</p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 pt-1">
                                    <label 
                                      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-black text-xs uppercase cursor-pointer transition-all active:scale-95 ${
                                        isBarnChecked
                                          ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-200'
                                          : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100/50'
                                      } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                      <input 
                                        type="checkbox"
                                        checked={isBarnChecked}
                                        disabled={!isAdmin}
                                        onChange={(e) => {
                                          if (!isAdmin) return;
                                          toggleQuestionTargetGroup(q.id, 'barn', e.target.checked);
                                        }}
                                        className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
                                      />
                                      <span className="text-base leading-none">👶</span>
                                      <span>{t(lang, 'kid')}</span>
                                    </label>

                                    <label 
                                      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-black text-xs uppercase cursor-pointer transition-all active:scale-95 ${
                                        isVuxenChecked
                                          ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-200'
                                          : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100/50'
                                      } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                      <input 
                                        type="checkbox"
                                        checked={isVuxenChecked}
                                        disabled={!isAdmin}
                                        onChange={(e) => {
                                          if (!isAdmin) return;
                                          toggleQuestionTargetGroup(q.id, 'vuxen', e.target.checked);
                                        }}
                                        className="w-4 h-4 rounded accent-amber-600 cursor-pointer"
                                      />
                                      <span className="text-base leading-none">🧑</span>
                                      <span>{t(lang, 'adult')}</span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ) : q.type === 'text' ? (
                              <div className="space-y-5 p-6 sm:p-8 bg-sky-50/80 border-2 border-sky-200 rounded-3xl">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-sky-600 text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-sm">
                                      🔤
                                    </div>
                                    <div>
                                      <h4 className="font-black text-sm sm:text-base text-sky-950 uppercase tracking-wide">{t(lang, 'textAnswerCorrectHeader')}</h4>
                                      <p className="text-xs text-sky-800 font-medium">{t(lang, 'soundexOfflineNote')}</p>
                                    </div>
                                  </div>
                                  <span className="bg-sky-200 text-sky-900 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                    {t(lang, 'linguisticEngineTag')}
                                  </span>
                                </div>

                                {/* Primary Correct Answer */}
                                <div className="space-y-2 pt-2">
                                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                    {t(lang, 'primaryCorrectAnswerLabel')}
                                  </label>
                                  <div className="relative">
                                    <input 
                                      type="text"
                                      disabled={!isAdmin}
                                      value={rawQ.correctTextAnswer || ''}
                                      placeholder={t(lang, 'correctAnswerPlaceholder')}
                                      onChange={(e) => {
                                        updateQuestion(editingQuestionsCategory, q.id, {
                                          correctTextAnswer: e.target.value
                                        });
                                      }}
                                      className={`w-full p-4 bg-white border-2 border-sky-300 focus:border-sky-500 rounded-2xl text-base font-bold text-slate-800 shadow-inner outline-none transition-all ${
                                        !isAdmin ? 'bg-slate-100 cursor-not-allowed' : ''
                                      }`}
                                    />
                                    {rawQ.correctTextAnswer && (
                                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sky-700 bg-sky-100 px-2 py-1 rounded-lg text-[10px] font-black">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t(lang, 'soundexCodeLabel')}:</span>
                                        <code className="font-mono">{soundex(rawQ.correctTextAnswer)}</code>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Accepted Alternatives */}
                                <div className="space-y-3 pt-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                      {t(lang, 'acceptedAlternativesLabel')} ({t(lang, 'optional')})
                                    </label>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const curr = rawQ.acceptedTextAnswers || [];
                                          updateQuestion(editingQuestionsCategory, q.id, {
                                            acceptedTextAnswers: [...curr, '']
                                          });
                                        }}
                                        className="text-[10px] font-black uppercase text-sky-700 hover:text-sky-900 bg-sky-200/60 hover:bg-sky-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>{t(lang, 'addAlternativeBtn')}</span>
                                      </button>
                                    )}
                                  </div>

                                  {(rawQ.acceptedTextAnswers && rawQ.acceptedTextAnswers.length > 0) ? (
                                    <div className="space-y-2">
                                      {rawQ.acceptedTextAnswers.map((alt, altIdx) => (
                                        <div key={altIdx} className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            disabled={!isAdmin}
                                            value={alt}
                                            placeholder={t(lang, 'alternativeNumPlaceholder', { num: (altIdx + 1).toString() })}
                                            onChange={(e) => {
                                              const newAlts = [...(rawQ.acceptedTextAnswers || [])];
                                              newAlts[altIdx] = e.target.value;
                                              updateQuestion(editingQuestionsCategory, q.id, {
                                                acceptedTextAnswers: newAlts
                                              });
                                            }}
                                            className="flex-1 p-3 bg-white border border-sky-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-sky-500"
                                          />
                                          {isAdmin && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newAlts = (rawQ.acceptedTextAnswers || []).filter((_, i) => i !== altIdx);
                                                updateQuestion(editingQuestionsCategory, q.id, {
                                                  acceptedTextAnswers: newAlts
                                                });
                                              }}
                                              className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                              title={t(lang, 'deleteQuestionBtn')}
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">
                                      {t(lang, 'noAlternativesHint')}
                                    </p>
                                  )}
                                </div>

                                {/* Real-time Interactive Test Validator */}
                                <div className="p-4 bg-gradient-to-br from-indigo-50/90 to-sky-50/90 border-2 border-indigo-200/80 rounded-2xl space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">🧪</span>
                                      <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">{t(lang, 'testSpellingLabel')}</span>
                                    </div>
                                    <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100/70 px-2 py-0.5 rounded-md">{t(lang, 'liveBadge')}</span>
                                  </div>

                                  <div className="space-y-2">
                                    <input 
                                      type="text"
                                      value={editorTestWord}
                                      onChange={(e) => setEditorTestWord(e.target.value)}
                                      placeholder={t(lang, 'testSpellingPlaceholder')}
                                      className="w-full p-3 bg-white border border-indigo-300 focus:border-indigo-500 rounded-xl text-sm font-bold text-slate-800 outline-none shadow-2xs"
                                    />

                                    {editorTestWord.trim() && (() => {
                                      const testRes = evaluateTextAnswer(
                                        editorTestWord,
                                        rawQ.correctTextAnswer || '',
                                        rawQ.acceptedTextAnswers || [],
                                        editingQuestionLang,
                                        quizConfig.textMatchStrictness || 'normal'
                                      );
                                      const flagMap: Record<string, string> = { sv: '🇸🇪', en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸' };
                                      return (
                                        <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs font-bold ${
                                          testRes.match 
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                                            : 'bg-rose-50 border-rose-200 text-rose-800'
                                        }`}>
                                          <div className="flex items-center gap-2">
                                            <span>{testRes.match ? '✅' : '❌'}</span>
                                            <span>{testRes.match ? t(lang, 'testMatchSuccess') : t(lang, 'testMatchFail')}</span>
                                            <span className="opacity-80 text-[11px]">({Math.round(testRes.confidence * 100)} % {t(lang, 'confidenceLabel').toLowerCase()})</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="bg-white/80 px-2 py-0.5 rounded text-[11px] font-extrabold">
                                              {flagMap[testRes.detected_language] || '🌐'} {testRes.detected_language.toUpperCase()}
                                            </span>
                                            {testRes.method && testRes.method !== 'none' && (
                                              <span className="bg-white/80 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono">
                                                {t(lang, `method_${testRes.method}` as any) || testRes.method}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {/* Target Groups for Text Questions */}
                                <div className="pt-3 border-t border-sky-200/80 space-y-3">
                                  <div>
                                    <h5 className="font-black text-xs sm:text-sm text-sky-950 uppercase tracking-wider">{t(lang, 'targetGroupsLabel')}</h5>
                                    <p className="text-[11px] text-sky-800 font-medium">{t(lang, 'targetGroupsDesc')}</p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 pt-1">
                                    <label 
                                      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-black text-xs uppercase cursor-pointer transition-all active:scale-95 ${
                                        isBarnChecked
                                          ? 'bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-sky-200'
                                          : 'bg-white text-slate-600 border-sky-200 hover:bg-sky-100/50'
                                      } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                      <input 
                                        type="checkbox"
                                        checked={isBarnChecked}
                                        disabled={!isAdmin}
                                        onChange={(e) => {
                                          if (!isAdmin) return;
                                          toggleQuestionTargetGroup(q.id, 'barn', e.target.checked);
                                        }}
                                        className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                                      />
                                      <span className="text-base leading-none">👶</span>
                                      <span>{t(lang, 'kid')}</span>
                                    </label>

                                    <label 
                                      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-black text-xs uppercase cursor-pointer transition-all active:scale-95 ${
                                        isVuxenChecked
                                          ? 'bg-sky-600 text-white border-sky-600 shadow-md ring-2 ring-sky-200'
                                          : 'bg-white text-slate-600 border-sky-200 hover:bg-sky-100/50'
                                      } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                      <input 
                                        type="checkbox"
                                        checked={isVuxenChecked}
                                        disabled={!isAdmin}
                                        onChange={(e) => {
                                          if (!isAdmin) return;
                                          toggleQuestionTargetGroup(q.id, 'vuxen', e.target.checked);
                                        }}
                                        className="w-4 h-4 rounded accent-sky-600 cursor-pointer"
                                      />
                                      <span className="text-base leading-none">🧑</span>
                                      <span>{t(lang, 'adult')}</span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Options & Correct Answer */
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                                    {t(lang, 'optionsAndCorrectAnswersLabel')} ({currentLangOption.code.toUpperCase()})
                                  </label>
                                  <span className="text-[10px] font-bold text-slate-400">{t(lang, 'clickButtonToSetCorrectAnswer')}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                  {q.options.map((opt, oIdx) => (
                                    <div key={oIdx} className="flex gap-2 sm:gap-4 items-center">
                                      <button 
                                        onClick={() => {
                                          if (!isAdmin) return;
                                          let newCorrect = [...(rawQ?.correctAnswers || [])];
                                          if (newCorrect.includes(oIdx)) {
                                            if (newCorrect.length > 1) {
                                              newCorrect = newCorrect.filter(idx => idx !== oIdx);
                                            }
                                          } else {
                                            newCorrect.push(oIdx);
                                          }
                                          updateQuestion(editingQuestionsCategory, q.id, { correctAnswers: newCorrect });
                                        }}
                                        disabled={!isAdmin}
                                        className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black text-base sm:text-lg transition-all shrink-0 ${
                                          (rawQ?.correctAnswers || []).includes(oIdx) 
                                            ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-200 ring-4 ring-emerald-100 scale-105' 
                                            : 'bg-slate-100 border border-slate-200 text-slate-400 hover:bg-slate-200'
                                        } ${!isAdmin ? 'opacity-80' : ''}`}
                                        title={t(lang, 'clickToSetCorrect')}
                                      >
                                        {getOptionLabel(oIdx, q.options?.length)}
                                      </button>
                                      
                                      <div className="flex-1 relative flex items-center gap-2 sm:gap-3">
                                        {/* Option Image Thumbnail or Upload Button */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {rawQ.optionImages?.[oIdx] ? (
                                            <div className="relative flex items-center gap-1">
                                              <div 
                                                className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl overflow-hidden border-2 border-indigo-200 shadow-2xs cursor-pointer bg-slate-100 shrink-0 group relative"
                                                onClick={() => setZoomedImageUrl(rawQ.optionImages?.[oIdx] || null)}
                                                title={t(lang, 'previewImage')}
                                              >
                                                <OfflineImage 
                                                  src={rawQ.optionImages[oIdx]} 
                                                  alt={`Option ${oIdx + 1}`} 
                                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                                />
                                                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                                  <Maximize2 className="w-3 h-3" />
                                                </div>
                                              </div>
                                              {isAdmin && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const nextImgs = [...(rawQ.optionImages || [])];
                                                    nextImgs[oIdx] = undefined;
                                                    updateQuestion(editingQuestionsCategory, q.id, { optionImages: nextImgs });
                                                  }}
                                                  className="w-7 h-7 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center transition-all border border-rose-200/60"
                                                  title={t(lang, 'removeImageBtn')}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              )}
                                            </div>
                                          ) : (
                                            isAdmin && (
                                              <label 
                                                className="w-11 h-11 sm:w-13 sm:h-13 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-2xl flex items-center justify-center cursor-pointer transition-all shrink-0 shadow-2xs"
                                                title={t(lang, 'optionImageLabel')}
                                              >
                                                <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                      try {
                                                        const dataUrl = await compressImageFile(file, 800, 800, 0.82);
                                                        const nextImgs = [...(rawQ.optionImages || [])];
                                                        nextImgs[oIdx] = dataUrl;
                                                        updateQuestion(editingQuestionsCategory, q.id, { optionImages: nextImgs });
                                                      } catch (err) {
                                                        alert('Kunde inte läsa in bilden.');
                                                      }
                                                    }
                                                  }}
                                                />
                                              </label>
                                            )
                                          )}
                                        </div>

                                        <div className="flex-1 relative">
                                          <input 
                                            type="text"
                                            className={`w-full p-3.5 sm:p-5 border-2 rounded-2xl text-base sm:text-lg font-bold outline-none transition-all ${
                                              isAdmin 
                                                ? ((rawQ?.correctAnswers || []).includes(oIdx) ? 'bg-emerald-50 border-emerald-200 focus:border-emerald-500' : 'bg-white border-slate-200 focus:border-indigo-500') 
                                                : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                                            }`}
                                            value={opt}
                                            placeholder={t(editingQuestionLang, 'optionPlaceholder', { num: (oIdx + 1).toString() })}
                                            readOnly={!isAdmin}
                                            onChange={(e) => handleOptionChange(oIdx, e.target.value)}
                                          />
                                          {(rawQ?.correctAnswers || []).includes(oIdx) && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                              <div className="bg-emerald-500 text-white p-1 rounded-full">
                                                <Check className="w-3 h-3 stroke-[4]" />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {isAdmin && q.options.length > 1 && (
                                          <button 
                                            type="button"
                                            onClick={() => handleRemoveOption(oIdx)}
                                            className="w-11 h-11 sm:w-12 sm:h-12 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/80 rounded-2xl flex items-center justify-center transition-all shrink-0 active:scale-90 shadow-2xs"
                                            title={t(lang, 'removeOption')}
                                          >
                                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {isAdmin && (
                                    <button 
                                      type="button"
                                      onClick={handleAddOption}
                                      className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all font-bold text-sm flex items-center justify-center gap-2"
                                    >
                                      <Plus className="w-4 h-4" />
                                      <span>{t(lang, 'addOption')}</span>
                                    </button>
                                  )}
                                </div>

                                {/* Target Groups for Options Questions */}
                                <div className="pt-4 border-t border-slate-200/80 space-y-3">
                                  <div>
                                    <h5 className="font-black text-xs sm:text-sm text-slate-800 uppercase tracking-wider">{t(lang, 'targetGroupsLabel')}</h5>
                                    <p className="text-[11px] text-slate-500 font-medium">{t(lang, 'targetGroupsDesc')}</p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 pt-1">
                                    <label 
                                      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-black text-xs uppercase cursor-pointer transition-all active:scale-95 ${
                                        isBarnChecked
                                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200'
                                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                      } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                      <input 
                                        type="checkbox"
                                        checked={isBarnChecked}
                                        disabled={!isAdmin}
                                        onChange={(e) => {
                                          if (!isAdmin) return;
                                          toggleQuestionTargetGroup(q.id, 'barn', e.target.checked);
                                        }}
                                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                                      />
                                      <span className="text-base leading-none">👶</span>
                                      <span>{t(lang, 'kid')}</span>
                                    </label>

                                    <label 
                                      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-black text-xs uppercase cursor-pointer transition-all active:scale-95 ${
                                        isVuxenChecked
                                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200'
                                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                      } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
                                    >
                                      <input 
                                        type="checkbox"
                                        checked={isVuxenChecked}
                                        disabled={!isAdmin}
                                        onChange={(e) => {
                                          if (!isAdmin) return;
                                          toggleQuestionTargetGroup(q.id, 'vuxen', e.target.checked);
                                        }}
                                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                                      />
                                      <span className="text-base leading-none">🧑</span>
                                      <span>{t(lang, 'adult')}</span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>

                        {/* Toggle button ABOVE Geotag & Follow-up */}
                        <div className="pt-6 mt-6 border-t border-slate-200">
                          <button
                            type="button"
                            onClick={() => setShowQuestionMore(prev => !prev)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 rounded-2xl border border-slate-200/90 shadow-2xs transition-all cursor-pointer select-none"
                          >
                            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-800">
                              <ChevronDown className={`w-4 h-4 text-indigo-600 transition-transform duration-200 ${showQuestionMore ? 'rotate-180' : ''}`} />
                              {t(lang, 'geotagFollowUpSection')}
                            </span>
                            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-indigo-700 shadow-2xs">
                              {showQuestionMore ? '▲ Dölj' : '▼ Visa'}
                            </span>
                          </button>
                        </div>

                        {showQuestionMore && (
                          <div className="space-y-8 pt-2">
                            {/* Geotagging */}
                            <div className="p-5 sm:p-6 bg-indigo-50/40 border-2 border-indigo-100 rounded-3xl space-y-5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shadow-2xs">
                                    <MapPin className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h4 className="font-black text-sm text-slate-800 uppercase tracking-widest">{t(lang, 'geotagTitle')}</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t(lang, 'geotagDesc')}</p>
                                  </div>
                                </div>
                                {isAdmin && rawQ.location && (
                                  <button 
                                    type="button"
                                    onClick={() => updateQuestion(editingQuestionsCategory, q.id, { location: undefined })}
                                    className="px-4 py-2 bg-rose-50 text-rose-600 text-[10px] font-black rounded-xl border border-rose-100 hover:bg-rose-100 transition-all uppercase tracking-widest"
                                  >
                                    {t(lang, 'removeGeotagBtn')}
                                  </button>
                                )}
                              </div>

                              {isAdmin && (
                                <div className="space-y-3">
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                      <input
                                        type="text"
                                        placeholder={t(lang, 'searchPlaceInputPlaceholder')}
                                        value={searchPlaceQuery[q.id] !== undefined ? searchPlaceQuery[q.id] : (rawQ.location?.name || '')}
                                        onChange={(e) => setSearchPlaceQuery(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const qText = searchPlaceQuery[q.id] !== undefined ? searchPlaceQuery[q.id] : (rawQ.location?.name || q.text);
                                            handleSearchAndGeotagPlace(editingQuestionsCategory, q.id, qText);
                                          }
                                        }}
                                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500 shadow-2xs"
                                      />
                                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                      <button
                                        type="button"
                                        disabled={isSearchingPlace[q.id]}
                                        onClick={() => {
                                          const qText = searchPlaceQuery[q.id] !== undefined ? searchPlaceQuery[q.id] : (rawQ.location?.name || q.text);
                                          handleSearchAndGeotagPlace(editingQuestionsCategory, q.id, qText);
                                        }}
                                        className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                                      >
                                        {isSearchingPlace[q.id] ? (
                                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                          <MapPin className="w-3.5 h-3.5" />
                                        )}
                                        <span>{t(lang, 'searchAndGeotagBtn')}</span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isAiGeotaggingSingle[q.id]}
                                        onClick={() => {
                                          const placeOrText = searchPlaceQuery[q.id] || q.text;
                                          handleAiGeotagSingleQuestion(editingQuestionsCategory, q.id, placeOrText);
                                        }}
                                        className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                                        title="Låt Gemini AI hitta platsens koordinater automatiskt utifrån frågan eller platsnamnet"
                                      >
                                        {isAiGeotaggingSingle[q.id] ? (
                                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                        )}
                                        <span>{t(lang, 'aiGeotagSingleBtn')}</span>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="rounded-3xl overflow-hidden border-4 border-slate-50 shadow-lg">
                                    <AdminMapPicker 
                                      initialLocation={rawQ.location}
                                      fallbackCenter={lastTaggedLocation || userLocation}
                                      onSelectLocation={(loc) => handleGeotagQuestion(editingQuestionsCategory, q.id, loc)}
                                      questionsWithLocations={
                                        editingQuestionsCategory === 'barn'
                                          ? quizConfig.barnQuestions.map((item, index) => ({ q: item, index, type: 'barn' as const }))
                                          : quizConfig.vuxenQuestions.map((item, index) => ({ q: item, index, type: 'vuxen' as const }))
                                      }
                                      activeQuestionId={q.id}
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                {isAdmin ? (
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      if (!navigator.geolocation) {
                                        alert(t(lang, 'noGpsSupport'));
                                        return;
                                      }
                                      navigator.geolocation.getCurrentPosition((pos) => {
                                        handleGeotagQuestion(editingQuestionsCategory, q.id, {
                                          lat: pos.coords.latitude,
                                          lng: pos.coords.longitude
                                        });
                                      }, (err) => {
                                        alert(t(lang, 'couldNotGetPosition') + ': ' + err.message);
                                      });
                                    }}
                                    className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95 uppercase tracking-widest cursor-pointer"
                                  >
                                    <Locate className="w-4 h-4" />
                                    <span>{t(lang, 'setCurrentPosition')}</span>
                                  </button>
                                ) : (
                                  <div className="text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-xl">
                                    {rawQ.location ? t(lang, 'geotaggedLabel') : t(lang, 'notGeotaggedLabel')}
                                  </div>
                                )}

                                {rawQ.location && (
                                  <div className="px-4 py-2 bg-slate-900 text-white/90 text-[10px] font-mono rounded-xl shadow-inner">
                                    {rawQ.location.lat.toFixed(6)}, {rawQ.location.lng.toFixed(6)}
                                  </div>
                                )}
                              </div>

                              {rawQ.location && (
                                <div className="p-4 bg-amber-50/90 border-2 border-amber-200 rounded-2xl space-y-2">
                                  <label className="flex items-start gap-3 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      disabled={!isAdmin}
                                      checked={!!rawQ.hideLocationOnMap || !!rawQ.location?.hideOnMap}
                                      onChange={(e) => {
                                        if (!isAdmin) return;
                                        const checked = e.target.checked;
                                        updateQuestion(editingQuestionsCategory, q.id, {
                                          hideLocationOnMap: checked,
                                          location: rawQ.location ? { ...rawQ.location, hideOnMap: checked } : undefined,
                                        });
                                      }}
                                      className="w-5 h-5 rounded mt-0.5 accent-amber-600 cursor-pointer"
                                    />
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-black text-amber-950 flex items-center gap-1.5">
                                          <span>🕵️‍♂️</span>
                                          <span>{t(lang, 'hideLocationOnMapLabel')}</span>
                                        </span>
                                        {(rawQ.hideLocationOnMap || rawQ.location?.hideOnMap) && (
                                          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md">
                                            {t(lang, 'treasureHuntActiveBadge')}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-amber-900 font-medium mt-1 leading-relaxed">
                                        {t(lang, 'hideLocationOnMapDescription')}
                                      </p>
                                    </div>
                                  </label>
                                </div>
                              )}
                            </div>

                            {/* Manual Follow-up Configuration */}
                            <div className="space-y-3 p-5 sm:p-6 bg-emerald-50/80 border-2 border-emerald-200 rounded-3xl">
                              <div>
                                <h4 className="font-black text-sm sm:text-base text-emerald-950 uppercase tracking-wide">{t(lang, 'followUpQuestionLabel')}</h4>
                                <p className="text-xs text-emerald-800 font-medium">{t(lang, 'followUpQuestionDescription')}</p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <select
                                  disabled={!isAdmin}
                                  value={rawQ.followUpQuestionId || ''}
                                  onChange={(e) => updateQuestion(editingQuestionsCategory, rawQ.id, {
                                    followUpQuestionId: e.target.value || undefined,
                                    followUpMode: e.target.value ? (rawQ.followUpMode || 'always') : undefined
                                  })}
                                  className="w-full p-3.5 bg-white border-2 border-emerald-200 rounded-2xl font-bold text-sm text-slate-800 outline-none focus:border-emerald-500"
                                >
                                  <option value="">{t(lang, 'noFollowUpOption')}</option>
                                  {questions.filter(item => item.id !== rawQ.id).map(item => (
                                    <option key={item.id} value={item.id}>{item.text || item.id}</option>
                                  ))}
                                </select>
                                <select
                                  disabled={!isAdmin || !rawQ.followUpQuestionId}
                                  value={rawQ.followUpMode || 'always'}
                                  onChange={(e) => updateQuestion(editingQuestionsCategory, rawQ.id, {
                                    followUpMode: e.target.value as Question['followUpMode']
                                  })}
                                  className="w-full p-3.5 bg-white border-2 border-emerald-200 rounded-2xl font-bold text-sm text-slate-800 outline-none focus:border-emerald-500"
                                >
                                  <option value="always">{t(lang, 'followUpAlwaysOption')}</option>
                                  <option value="correct">{t(lang, 'followUpCorrectOption')}</option>
                                  <option value="incorrect">{t(lang, 'followUpIncorrectOption')}</option>
                                </select>
                              </div>
                            </div>

                            {/* Toggle button BELOW Geotag & Follow-up */}
                            <button
                              type="button"
                              onClick={() => setShowQuestionMore(false)}
                              className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] text-slate-700 rounded-2xl border border-slate-200 transition-all cursor-pointer select-none"
                            >
                              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-700">
                                <ChevronDown className="w-4 h-4 text-indigo-600 rotate-180" />
                                {t(lang, 'geotagFollowUpSection')}
                              </span>
                              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-indigo-700 shadow-2xs">
                                ▲ Dölj
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Editor Footer */}
                      <footer className="p-5 sm:p-8 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-4 shrink-0">
                        <button 
                          onClick={() => onClose()}
                          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase shadow-xl shadow-indigo-200 transition-all active:scale-95"
                        >
                          {t(lang, 'doneAndSave')}
                        </button>
                      </footer>
                    </>
                  );
                })()}
              </motion.div>
            </motion.div>
      )}
    </AnimatePresence>
  );
};
