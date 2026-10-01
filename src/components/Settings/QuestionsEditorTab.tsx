/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Plus,
  MapPin,
  Map,
  Compass,
  Edit2,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Globe,
  ImageIcon,
  Sparkles,
  CheckCircle2,
  GripVertical,
  Check,
  Maximize2,
  ChevronRight,
  Search,
  CheckSquare,
  ArrowUpDown,
  Target,
  PenTool,
  X
} from 'lucide-react';
import { QuizConfig, UserType, Question, Location, QuestionType } from '../../types';
import { Language, t, translateQuestion } from '../../i18n';
import { calculateDistanceMeters, formatDistance, calculateWalkingTimeMinutes } from '../../utils/geoUtils';
import { getQuestionAvailableLanguages } from '../../utils/quizLanguages';
import { getOptionLabel } from '../../utils/imageAndLabelUtils';

export interface QuestionsEditorTabProps {
  quizConfig: QuizConfig;
  setQuizConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
  editingQuestionsCategory: UserType;
  setEditingQuestionsCategory: (c: UserType) => void;
  setShowCreateQuestionModal: (type: UserType | 'båda' | null) => void;
  setShowRouteGeoTagModal: (show: boolean) => void;
  setFullScreenEditingQuestionId: (id: string | null) => void;
  handleDuplicateQuestion?: (category: UserType, index: number) => void;
  handleDeleteQuestion?: (category: UserType, index: number) => void;
  handleMoveQuestion?: (category: UserType, index: number, direction: 'up' | 'down') => void;
  isAdmin: boolean;
  lang: Language;
  isBatchTranslating?: boolean;
  handleBatchTranslateQuiz?: () => Promise<void>;
}

export const QuestionsEditorTab: React.FC<QuestionsEditorTabProps> = ({
  quizConfig,
  setQuizConfig,
  editingQuestionsCategory,
  setEditingQuestionsCategory,
  setShowCreateQuestionModal,
  setShowRouteGeoTagModal,
  setFullScreenEditingQuestionId,
  handleDuplicateQuestion,
  handleDeleteQuestion,
  handleMoveQuestion,
  isAdmin,
  lang,
  isBatchTranslating = false,
  handleBatchTranslateQuiz = async () => {}
}) => {
  const [questionSearch, setQuestionSearch] = useState('');
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const handleAddNewQuestion = (type: QuestionType = 'options', targetCategory?: UserType) => {
    const category = targetCategory || createModalCategory || editingQuestionsCategory;
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      type,
      text: type === 'points' ? 'Ny poängfråga...' : type === 'text' ? 'Ny textfråga...' : 'Ny fråga...',
      options: type === 'points' || type === 'text' ? [] : ['Svar 1', 'Svar X', 'Svar 2'],
      correctAnswers: type === 'points' || type === 'text' ? [] : [0],
      maxPoints: type === 'points' ? 10 : undefined,
      correctTextAnswer: type === 'text' ? 'Rätt svar' : undefined,
      acceptedTextAnswers: type === 'text' ? [] : undefined,
      originalLanguage: lang,
    };
    
    setQuizConfig(prev => {
      const newConfig = { ...prev };
      if (category === 'barn') {
        newConfig.barnQuestions = [...newConfig.barnQuestions, newQuestion];
      } else {
        newConfig.vuxenQuestions = [...newConfig.vuxenQuestions, newQuestion];
      }
      return newConfig;
    });
    setCreateModalCategory(null);
    setShowCreateQuestionModal(null);
    setFullScreenEditingQuestionId(newQuestion.id);
  };

  const selectAllQuestions = () => {
    const questions = editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    if (selectedQuestionIds.length === questions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(questions.map(q => q.id));
    }
  };

  const confirmDeleteSelectedQuestions = () => {
    if (selectedQuestionIds.length === 0) return;
    const category = editingQuestionsCategory;
    const idsToRemove = new Set(selectedQuestionIds);
    setQuizConfig(prev => {
      const newConfig = { ...prev };
      if (category === 'barn') {
        newConfig.barnQuestions = newConfig.barnQuestions.filter(q => !idsToRemove.has(q.id));
      } else {
        newConfig.vuxenQuestions = newConfig.vuxenQuestions.filter(q => !idsToRemove.has(q.id));
      }
      return newConfig;
    });
    setSelectedQuestionIds([]);
    setShowBulkDeleteConfirm(false);
  };

  const editorQuestionRows = useMemo(() => {
    const questions = editingQuestionsCategory === 'barn'
      ? quizConfig.barnQuestions
      : quizConfig.vuxenQuestions;
    const followUpTargetIds = new Set(
      questions
        .map(question => question.followUpQuestionId)
        .filter((id) => !!id)
    );
    const childrenByParentId = new globalThis.Map();

    for (const question of questions) {
      if (!question.followUpQuestionId) continue;
      const children = childrenByParentId.get(question.id) || [];
      const child = questions.find(candidate => candidate.id === question.followUpQuestionId);
      if (child) children.push(child);
      childrenByParentId.set(question.id, children);
    }

    const mainQuestions = questions.filter(question => !followUpTargetIds.has(question.id));
    const rows = [];

    mainQuestions.forEach((rootQ, rootIdx) => {
      const groupChildren = [];
      const collectChildren = (q, visited) => {
        const children = childrenByParentId.get(q.id) || [];
        for (const child of children) {
          if (!visited.has(child.id)) {
            visited.add(child.id);
            groupChildren.push(child);
            collectChildren(child, visited);
          }
        }
      };
      collectChildren(rootQ, new Set([rootQ.id]));

      let currentChildCounter = 0;
      const addRowAndChildren = (
        question,
        label,
        isFollowUp,
        visited,
        parentQuestionId,
        subIndex = 0
      ) => {
        if (visited.has(question.id)) return;
        const nextVisited = new Set(visited).add(question.id);
        rows.push({
          question,
          label,
          isFollowUp,
          parentQuestionId,
          rootQuestionId: rootQ.id,
          groupIndex: rootIdx,
          totalGroups: mainQuestions.length,
          subIndex,
          totalSubInGroup: groupChildren.length
        });
        (childrenByParentId.get(question.id) || []).forEach((child, childIndex) => {
          currentChildCounter++;
          addRowAndChildren(child, label + ':' + (childIndex + 1), true, nextVisited, question.id, currentChildCounter);
        });
      };

      addRowAndChildren(rootQ, '' + (rootIdx + 1), false, new Set(), undefined, 0);
    });

    return rows;
  }, [editingQuestionsCategory, quizConfig]);

  const [draggedQuestionRow, setDraggedQuestionRow] = useState<{ id: string; isFollowUp: boolean; parentId?: string } | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<'before' | 'after' | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [createModalCategory, setCreateModalCategory] = useState<UserType | null>(null);

  const getQuestionGroups = (category: UserType) => {
    const questions = category === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const followUpSet = new Set<string>();
    questions.forEach(q => {
      if (q.followUpQuestionId) followUpSet.add(q.followUpQuestionId);
    });

    const roots = questions.filter(q => !followUpSet.has(q.id));
    return roots.map(root => {
      const followUps: Question[] = [];
      let currId = root.followUpQuestionId;
      const visited = new Set<string>([root.id]);
      while (currId && !visited.has(currId)) {
        visited.add(currId);
        const child = questions.find(q => q.id === currId);
        if (!child) break;
        followUps.push(child);
        currId = child.followUpQuestionId;
      }
      return { root, followUps };
    });
  };

  const reorderMainQuestions = (category: UserType, sourceRootId: string, targetRootId: string, position: 'before' | 'after' = 'before') => {
    if (!isAdmin || sourceRootId === targetRootId) return;
    const groups = getQuestionGroups(category);
    const sourceIdx = groups.findIndex(g => g.root.id === sourceRootId);
    const targetIdx = groups.findIndex(g => g.root.id === targetRootId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const [movedGroup] = groups.splice(sourceIdx, 1);
    const newTargetIdx = groups.findIndex(g => g.root.id === targetRootId);
    const insertIdx = position === 'after' ? newTargetIdx + 1 : newTargetIdx;
    groups.splice(insertIdx, 0, movedGroup);

    const newQuestions: Question[] = [];
    for (const g of groups) {
      newQuestions.push(g.root, ...g.followUps);
    }

    setQuizConfig(prev => category === 'barn'
      ? { ...prev, barnQuestions: newQuestions }
      : { ...prev, vuxenQuestions: newQuestions }
    );
  };

  const reorderFollowUpQuestions = (category: UserType, rootQuestionId: string, sourceFollowUpId: string, targetFollowUpId: string, position: 'before' | 'after' = 'before') => {
    if (!isAdmin || sourceFollowUpId === targetFollowUpId) return;
    const groups = getQuestionGroups(category);
    const group = groups.find(g => g.root.id === rootQuestionId);
    if (!group || group.followUps.length < 2) return;

    const sourceIdx = group.followUps.findIndex(q => q.id === sourceFollowUpId);
    const targetIdx = group.followUps.findIndex(q => q.id === targetFollowUpId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const [moved] = group.followUps.splice(sourceIdx, 1);
    const newTargetIdx = group.followUps.findIndex(q => q.id === targetFollowUpId);
    const insertIdx = position === 'after' ? newTargetIdx + 1 : newTargetIdx;
    group.followUps.splice(insertIdx, 0, moved);

    if (group.followUps.length > 0) {
      group.root = { ...group.root, followUpQuestionId: group.followUps[0].id };
      for (let i = 0; i < group.followUps.length; i++) {
        const nextId = i < group.followUps.length - 1 ? group.followUps[i + 1].id : undefined;
        group.followUps[i] = { ...group.followUps[i], followUpQuestionId: nextId };
      }
    }

    const newQuestions: Question[] = [];
    for (const g of groups) {
      newQuestions.push(g.root, ...g.followUps);
    }

    setQuizConfig(prev => category === 'barn'
      ? { ...prev, barnQuestions: newQuestions }
      : { ...prev, vuxenQuestions: newQuestions }
    );
  };

  const moveMainQuestionStep = (category: UserType, rootId: string, direction: 'up' | 'down') => {
    if (!isAdmin) return;
    const groups = getQuestionGroups(category);
    const idx = groups.findIndex(g => g.root.id === rootId);
    if (idx === -1) return;
    if (direction === 'up' && idx > 0) {
      const temp = groups[idx];
      groups[idx] = groups[idx - 1];
      groups[idx - 1] = temp;
    } else if (direction === 'down' && idx < groups.length - 1) {
      const temp = groups[idx];
      groups[idx] = groups[idx + 1];
      groups[idx + 1] = temp;
    } else {
      return;
    }

    const newQuestions: Question[] = [];
    for (const g of groups) {
      newQuestions.push(g.root, ...g.followUps);
    }

    setQuizConfig(prev => category === 'barn'
      ? { ...prev, barnQuestions: newQuestions }
      : { ...prev, vuxenQuestions: newQuestions }
    );
  };

  const moveFollowUpStep = (category: UserType, rootId: string, followUpId: string, direction: 'up' | 'down') => {
    if (!isAdmin) return;
    const groups = getQuestionGroups(category);
    const group = groups.find(g => g.root.id === rootId);
    if (!group) return;
    const idx = group.followUps.findIndex(q => q.id === followUpId);
    if (idx === -1) return;

    if (direction === 'up' && idx > 0) {
      const temp = group.followUps[idx];
      group.followUps[idx] = group.followUps[idx - 1];
      group.followUps[idx - 1] = temp;
    } else if (direction === 'down' && idx < group.followUps.length - 1) {
      const temp = group.followUps[idx];
      group.followUps[idx] = group.followUps[idx + 1];
      group.followUps[idx + 1] = temp;
    } else {
      return;
    }

    if (group.followUps.length > 0) {
      group.root = { ...group.root, followUpQuestionId: group.followUps[0].id };
      for (let i = 0; i < group.followUps.length; i++) {
        const nextId = i < group.followUps.length - 1 ? group.followUps[i + 1].id : undefined;
        group.followUps[i] = { ...group.followUps[i], followUpQuestionId: nextId };
      }
    }

    const newQuestions: Question[] = [];
    for (const g of groups) {
      newQuestions.push(g.root, ...g.followUps);
    }

    setQuizConfig(prev => category === 'barn'
      ? { ...prev, barnQuestions: newQuestions }
      : { ...prev, vuxenQuestions: newQuestions }
    );
  };

  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const openQuestionEditor = (id: string) => {
    setFullScreenEditingQuestionId(id);
  };

  const deleteQuestion = (category: UserType, id: string) => {
    if (handleDeleteQuestion) {
      const questions = category === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
      const idx = questions.findIndex(q => q.id === id);
      if (idx !== -1) {
        handleDeleteQuestion(category, idx);
        return;
      }
    }
    setQuizConfig(prev => ({
      ...prev,
      barnQuestions: category === 'barn' ? prev.barnQuestions.filter(q => q.id !== id) : prev.barnQuestions,
      vuxenQuestions: category === 'vuxen' ? prev.vuxenQuestions.filter(q => q.id !== id) : prev.vuxenQuestions
    }));
  };

  return (
                    <div className="space-y-5">
                      {/* Category Switcher Pills */}
                      <div className="flex flex-col xs:flex-row items-center justify-between gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200/60">
                        <button 
                          onClick={() => setEditingQuestionsCategory('barn')}
                          className={`w-full xs:flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${
                            editingQuestionsCategory === 'barn' 
                              ? 'bg-amber-400 text-white shadow-md' 
                              : 'text-slate-500 hover:bg-slate-200/60'
                          }`}
                        >
                          <span>{t(lang, 'childrenQuestionsCategory')} 🧒</span>
                          <span className="bg-white/30 text-white px-2 py-0.5 rounded-full text-[10px]">
                            {quizConfig.barnQuestions.length}
                          </span>
                        </button>
                        <button 
                          onClick={() => setEditingQuestionsCategory('vuxen')}
                          className={`w-full xs:flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${
                            editingQuestionsCategory === 'vuxen' 
                              ? 'bg-pink-400 text-white shadow-md' 
                              : 'text-slate-500 hover:bg-slate-200/60'
                          }`}
                        >
                          <span>{t(lang, 'adultQuestionsCategory')} 🧔</span>
                          <span className="bg-white/30 text-white px-2 py-0.5 rounded-full text-[10px]">
                            {quizConfig.vuxenQuestions.length}
                          </span>
                        </button>
                      </div>

                      {/* Trail Stats Summary (if geotagged) */}
                      {(() => {
                        const activeList = editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                        const geotaggedList = activeList.filter(q => !!q.location);
                        if (geotaggedList.length >= 2) {
                          let dist = 0;
                          for (let k = 0; k < geotaggedList.length - 1; k++) {
                            dist += calculateDistanceMeters(
                              geotaggedList[k].location!.lat,
                              geotaggedList[k].location!.lng,
                              geotaggedList[k + 1].location!.lat,
                              geotaggedList[k + 1].location!.lng
                            );
                          }
                          return (
                            <div className="bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-200/80 flex flex-wrap items-center justify-between gap-2 text-xs font-black text-indigo-950">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-indigo-600" />
                                <span>{t(lang, 'trailLength')}: <strong className="text-indigo-600 font-black">{formatDistance(dist)}</strong></span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                <span>⏱️ {t(lang, 'estWalkTime')}: <strong className="text-indigo-700 font-black">~{calculateWalkingTimeMinutes(dist)} min</strong></span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Route GeoTag Button */}
                      <button
                        onClick={() => setShowRouteGeoTagModal(true)}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3 transition-all active:scale-95 group overflow-hidden relative"
                      >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                        <Map className="w-5 h-5 text-yellow-300" />
                        <span className="relative z-10">{t(lang, 'drawRouteOnMapBtn')}</span>
                        <ChevronRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
                      </button>

                      {/* Search & Bulk Toolbar */}
                      <div className="bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-200/60 space-y-3">
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input 
                            type="text"
                            placeholder={t(lang, 'searchQuestionsPlaceholder')}
                            value={questionSearch}
                            onChange={(e) => setQuestionSearch(e.target.value)}
                            className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-indigo-500"
                          />
                          {questionSearch && (
                            <button 
                              onClick={() => setQuestionSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-sm"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={selectAllQuestions}
                              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-extrabold text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                            >
                              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                              {(editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions).length === selectedQuestionIds.length && selectedQuestionIds.length > 0
                                ? t(lang, 'deselectAllBtn')
                                : t(lang, 'selectAllBtn')}
                            </button>
                            {selectedQuestionIds.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                                  {t(lang, 'selectedCount', { count: selectedQuestionIds.length.toString() })}
                                </span>
                                <button 
                                  onClick={() => setSelectedQuestionIds([])}
                                  className="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs font-bold shrink-0"
                                >
                                  {t(lang, 'clearSelectionBtn')}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isAdmin && (
                              <button 
                                onClick={handleBatchTranslateQuiz}
                                disabled={isBatchTranslating || (quizConfig.barnQuestions.length + quizConfig.vuxenQuestions.length === 0)}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-[11px] font-extrabold uppercase shadow-sm transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                                title={t(lang, 'batchTranslateQuizDesc')}
                              >
                                {isBatchTranslating ? (
                                  <div className="w-3.5 h-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                                ) : (
                                  <Globe className="w-3.5 h-3.5 text-indigo-600" />
                                )}
                                <span>{isBatchTranslating ? t(lang, 'generatingWithAi') : t(lang, 'batchTranslateQuizBtn')}</span>
                              </button>
                            )}

                            {isAdmin && selectedQuestionIds.length > 0 && (
                              <button 
                                onClick={() => setShowBulkDeleteConfirm(true)}
                                className="px-3.5 py-1.5 bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase shadow-md shadow-rose-200 hover:bg-rose-700 transition-all flex items-center gap-1.5 active:scale-95"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t(lang, 'deleteSelectedCount', { count: selectedQuestionIds.length.toString() })}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Drag & Drop Hint Banner */}
                      {isAdmin && (
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-100/90 rounded-xl text-[11px] font-bold text-slate-600 border border-slate-200/80">
                          <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">{t(lang, 'dragToReorder')}</span>
                          <span className="hidden sm:inline text-slate-400">•</span>
                          <span className="hidden sm:inline text-[10px] text-slate-500 font-medium truncate">{t(lang, 'dragFollowUpReorderNotice')}</span>
                        </div>
                      )}

                      {/* Question List */}
                      <div className="max-h-[460px] overflow-y-auto pr-1.5 custom-scrollbar space-y-3">
                        {editorQuestionRows
                          .map(row => {
                            const trans = translateQuestion(row.question.id, row.question.text, row.question.options || [], lang, row.question.originalLanguage);
                            return { ...row, question: { ...row.question, text: trans.text, options: trans.options } };
                          })
                          .filter(row => !questionSearch || row.question.text.toLowerCase().includes(questionSearch.toLowerCase()))
                          .map((row) => {
                            const { question: q, label, isFollowUp, rootQuestionId, groupIndex, totalGroups, subIndex, totalSubInGroup } = row;
                            const isSelected = selectedQuestionIds.includes(q.id);
                            const qLangs = getQuestionAvailableLanguages(q);
                            const isDraggingThis = draggedQuestionRow?.id === q.id;
                            const isDropTarget = dragOverQuestionId === q.id;
                            
                            const isDragTargetValid = (() => {
                              if (!draggedQuestionRow) return false;
                              if (draggedQuestionRow.id === q.id) return false;
                              if (draggedQuestionRow.isFollowUp) {
                                return isFollowUp && rootQuestionId === draggedQuestionRow.rootQuestionId;
                              } else {
                                return !isFollowUp;
                              }
                            })();

                            return (
                              <div 
                                key={q.id}
                                draggable={isAdmin}
                                onDragStart={(e) => {
                                  if (!isAdmin) return;
                                  setDraggedQuestionRow({
                                    id: q.id,
                                    isFollowUp,
                                    rootQuestionId
                                  });
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', q.id);
                                }}
                                onDragOver={(e) => {
                                  if (!isAdmin || !draggedQuestionRow) return;
                                  if (isDragTargetValid) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const midpoint = rect.top + rect.height / 2;
                                    const position = e.clientY < midpoint ? 'before' : 'after';
                                    if (dragOverQuestionId !== q.id || dropIndicatorPosition !== position) {
                                      setDragOverQuestionId(q.id);
                                      setDropIndicatorPosition(position);
                                    }
                                  } else {
                                    e.dataTransfer.dropEffect = 'none';
                                  }
                                }}
                                onDragLeave={(e) => {
                                  if (dragOverQuestionId === q.id) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    if (
                                      e.clientX < rect.left ||
                                      e.clientX >= rect.right ||
                                      e.clientY < rect.top ||
                                      e.clientY >= rect.bottom
                                    ) {
                                      setDragOverQuestionId(null);
                                      setDropIndicatorPosition(null);
                                    }
                                  }
                                }}
                                onDrop={(e) => {
                                  if (!isAdmin || !draggedQuestionRow || !isDragTargetValid) return;
                                  e.preventDefault();
                                  const position = dropIndicatorPosition || 'before';
                                  if (draggedQuestionRow.isFollowUp) {
                                    reorderFollowUpQuestions(editingQuestionsCategory, rootQuestionId, draggedQuestionRow.id, q.id, position);
                                  } else {
                                    reorderMainQuestions(editingQuestionsCategory, draggedQuestionRow.id, q.id, position);
                                  }
                                  setDraggedQuestionRow(null);
                                  setDragOverQuestionId(null);
                                  setDropIndicatorPosition(null);
                                }}
                                onDragEnd={() => {
                                  setDraggedQuestionRow(null);
                                  setDragOverQuestionId(null);
                                  setDropIndicatorPosition(null);
                                }}
                                className={`relative transition-all ${
                                  isDraggingThis ? 'opacity-40 scale-[0.99]' : 'opacity-100'
                                } ${isFollowUp ? 'ml-6' : ''}`}
                              >
                                {isDropTarget && isDragTargetValid && dropIndicatorPosition === 'before' && (
                                  <div className="absolute -top-1.5 left-0 right-0 h-1 bg-indigo-500 rounded-full z-20 shadow-sm animate-pulse" />
                                )}
                                {isDropTarget && isDragTargetValid && dropIndicatorPosition === 'after' && (
                                  <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-indigo-500 rounded-full z-20 shadow-sm animate-pulse" />
                                )}

                                <div 
                                  className={`${isFollowUp ? 'border-l-4 border-emerald-400' : ''} border rounded-2xl overflow-hidden transition-all ${
                                    isSelected 
                                      ? 'bg-rose-50/60 border-rose-300 shadow-sm' 
                                      : isDropTarget && isDragTargetValid
                                      ? 'bg-indigo-50/80 border-indigo-400 shadow-md ring-2 ring-indigo-200'
                                      : 'bg-slate-50 border-slate-200/70 hover:border-indigo-200'
                                  }`}
                                >
                                  <div 
                                    className="w-full p-3 sm:p-3.5 flex items-center justify-between hover:bg-slate-100/60 transition-colors cursor-pointer"
                                    onClick={() => openQuestionEditor(q.id)}
                                  >
                                    <div className="flex items-start gap-2 text-left min-w-0 pr-2">
                                      {/* Drag Handle & Step Buttons */}
                                      {isAdmin && (
                                        <div 
                                          className="flex items-center gap-0.5 shrink-0 self-center py-1 pr-1 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing touch-none select-none"
                                          title={isFollowUp ? t(lang, 'dragFollowUpReorderNotice') : t(lang, 'dragToReorder')}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <GripVertical className="w-4 h-4 text-slate-400 hover:text-indigo-600 transition-colors" />
                                          <div className="flex flex-col -space-y-0.5">
                                            <button
                                              type="button"
                                              disabled={isFollowUp ? subIndex <= 1 : groupIndex === 0}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (isFollowUp) {
                                                  moveFollowUpStep(editingQuestionsCategory, rootQuestionId, q.id, 'up');
                                                } else {
                                                  moveMainQuestionStep(editingQuestionsCategory, rootQuestionId, 'up');
                                                }
                                              }}
                                              className="p-0.5 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                              title={t(lang, 'moveQuestionUp')}
                                            >
                                              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 4l-8 8h16z"/></svg>
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isFollowUp ? subIndex >= totalSubInGroup : groupIndex === totalGroups - 1}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (isFollowUp) {
                                                  moveFollowUpStep(editingQuestionsCategory, rootQuestionId, q.id, 'down');
                                                } else {
                                                  moveMainQuestionStep(editingQuestionsCategory, rootQuestionId, 'down');
                                                }
                                              }}
                                              className="p-0.5 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                                              title={t(lang, 'moveQuestionDown')}
                                            >
                                              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 20l8-8H4z"/></svg>
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      <button 
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleSelectQuestion(q.id);
                                        }}
                                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 self-center ${
                                          isSelected 
                                            ? 'bg-rose-500 border-rose-500 text-white shadow-sm' 
                                            : 'bg-white border-slate-300 text-transparent hover:border-indigo-400'
                                        }`}
                                      >
                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                      </button>

                                      <span className={`min-w-6 h-6 px-1 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 self-center ${
                                        isSelected ? 'bg-rose-100 text-rose-700' : isFollowUp ? 'bg-emerald-100 border border-emerald-200 text-emerald-800' : 'bg-white border border-slate-200 text-slate-600'
                                      }`}>
                                        {label}
                                      </span>

                                      <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="text-xs sm:text-sm font-bold leading-snug text-slate-800 break-words">
                                          {q.text || t(lang, 'writeQuestionPlaceholder')}
                                        </div>
                                        {isFollowUp && (
                                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                                            ↳ {t(lang, 'followUpQuestionLabel')}
                                          </span>
                                        )}

                                        <div className="flex items-center gap-1 flex-wrap" title={t(lang, 'availableLanguagesLabel')}>
                                          {qLangs.slice(0, 4).map(l => (
                                            <span
                                              key={l.code}
                                              className="text-[11px] px-1 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs"
                                              title={`${l.name} (${l.code === (q.originalLanguage || 'sv') ? t(lang, 'questionOriginalLang') : t(lang, 'translationsAvailable')})`}
                                            >
                                              {l.flag}
                                            </span>
                                          ))}
                                          {qLangs.length > 4 && (
                                            <span 
                                              className="text-[9px] font-black text-slate-600 bg-slate-200 px-1 py-0.5 rounded-md"
                                              title={qLangs.slice(4).map(l => `${l.flag} ${l.name}`).join(', ')}
                                            >
                                              +{qLangs.length - 4}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {q.location && (
                                        <span 
                                          className={`p-1.5 rounded-lg shrink-0 flex items-center gap-1 text-[10px] font-black self-center transition-all ${
                                            q.hideLocationOnMap || q.location.hideOnMap
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs'
                                              : 'bg-indigo-100 text-indigo-700'
                                          }`}
                                          title={q.hideLocationOnMap || q.location.hideOnMap ? t(lang, 'treasureHuntBadge') : t(lang, 'geotaggedLabel')}
                                        >
                                          {q.hideLocationOnMap || q.location.hideOnMap ? (
                                            <>
                                              <span>🕵️‍♂️</span>
                                              <span className="hidden sm:inline">{t(lang, 'treasureHuntBadge')}</span>
                                            </>
                                          ) : (
                                            <MapPin className="w-3.5 h-3.5 stroke-[2.5]" />
                                          )}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {isAdmin && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteQuestion(editingQuestionsCategory, q.id);
                                          }}
                                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                          title={t(lang, 'deleteQuestionBtn')}
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openQuestionEditor(q.id);
                                        }}
                                        className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title={t(lang, 'openQuestionBtn')}
                                      >
                                        <Maximize2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {showBulkDeleteConfirm && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                          <div
                            className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
                            onClick={() => setShowBulkDeleteConfirm(false)}
                          />
                          <div className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-white shadow-2xl">
                            <div className="bg-rose-600 p-7 text-white sm:p-8">
                              <button
                                type="button"
                                onClick={() => setShowBulkDeleteConfirm(false)}
                                className="absolute right-6 top-6 rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
                              >
                                <span className="text-lg font-bold">×</span>
                              </button>
                              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                                <Trash2 className="h-8 w-8 text-white" />
                              </div>
                              <h2 className="text-2xl font-black">
                                {t(lang, 'deleteSelectedQuestionsTitle') || 'Radera markerade frågor'}
                              </h2>
                            </div>
                            <div className="space-y-5 p-7 sm:p-8">
                              <p className="text-sm font-medium leading-relaxed text-slate-500">
                                {t(lang, 'deleteSelectedQuestionsWarning', { count: selectedQuestionIds.length.toString() }) || `Är du säker på att du vill radera ${selectedQuestionIds.length} markerade frågor? Detta kan inte ångras.`}
                              </p>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => setShowBulkDeleteConfirm(false)}
                                  className="flex-1 rounded-2xl bg-slate-100 py-3.5 text-xs font-black uppercase text-slate-600 hover:bg-slate-200"
                                >
                                  {t(lang, 'cancelBtn') || 'Avbryt'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    confirmDeleteSelectedQuestions();
                                  }}
                                  className="flex-1 rounded-2xl bg-rose-600 py-3.5 text-xs font-black uppercase text-white hover:bg-rose-700 shadow-md shadow-rose-100"
                                >
                                  {t(lang, 'confirmDeleteSelectedQuestionsBtn') || 'Ja, radera'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {isAdmin && (
                        <button 
                          type="button"
                          onClick={() => {
                            setCreateModalCategory(editingQuestionsCategory);
                            setShowCreateQuestionModal(editingQuestionsCategory);
                          }}
                          className="w-full py-3.5 bg-slate-900 text-white hover:bg-slate-800 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> {t(lang, 'addNewQuestionBtn', { category: editingQuestionsCategory === 'barn' ? t(lang, 'kid') : t(lang, 'adult') })}
                        </button>
                      )}

                      {/* Question Type Selector Modal */}
                      {createModalCategory && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                          <div
                            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity"
                            onClick={() => {
                              setCreateModalCategory(null);
                              setShowCreateQuestionModal(null);
                            }}
                          />
                          <div className="relative w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-white shadow-2xl border border-slate-100 my-auto">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white sm:p-7 relative">
                              <button
                                type="button"
                                onClick={() => {
                                  setCreateModalCategory(null);
                                  setShowCreateQuestionModal(null);
                                }}
                                className="absolute right-5 top-5 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-white transition-colors cursor-pointer"
                                aria-label="Stäng"
                              >
                                <X className="w-5 h-5" />
                              </button>
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/30 border border-indigo-400/30 text-indigo-300">
                                  <Plus className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                  <h2 className="text-xl font-black tracking-tight">
                                    {t(lang, 'selectQuestionTypeTitle')}
                                  </h2>
                                  <p className="text-xs text-indigo-200 font-medium mt-0.5">
                                    {t(lang, 'selectQuestionTypeDesc', {
                                      category: (createModalCategory || editingQuestionsCategory) === 'barn'
                                        ? `🧒 ${t(lang, 'childrenQuestionsCategory')}`
                                        : `🧑 ${t(lang, 'adultQuestionsCategory')}`
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Question Type Choices */}
                            <div className="p-6 sm:p-7 space-y-3 bg-slate-50/50">
                              {/* Option 1: 1X2 Multiple Choice */}
                              <button
                                type="button"
                                onClick={() => handleAddNewQuestion('options')}
                                className="w-full text-left p-4 bg-white hover:bg-indigo-50/70 active:scale-[0.98] border-2 border-slate-200/90 hover:border-indigo-500 rounded-2xl transition-all shadow-sm group cursor-pointer flex items-center gap-4"
                              >
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                  <CheckSquare className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-slate-900 group-hover:text-indigo-700">
                                      {t(lang, 'questionTypeOptionsTitle')}
                                    </span>
                                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded-full">
                                      1X2
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                                    {t(lang, 'questionTypeOptionsDesc')}
                                  </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
                              </button>

                              {/* Option 2: Points Question */}
                              <button
                                type="button"
                                onClick={() => handleAddNewQuestion('points')}
                                className="w-full text-left p-4 bg-white hover:bg-amber-50/70 active:scale-[0.98] border-2 border-slate-200/90 hover:border-amber-500 rounded-2xl transition-all shadow-sm group cursor-pointer flex items-center gap-4"
                              >
                                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-all shadow-sm">
                                  <Target className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-slate-900 group-hover:text-amber-700">
                                      {t(lang, 'questionTypePointsTitle')}
                                    </span>
                                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full">
                                      0–10p
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                                    {t(lang, 'questionTypePointsDesc')}
                                  </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-amber-600 transition-colors shrink-0" />
                              </button>

                              {/* Option 3: Free-Text Question */}
                              <button
                                type="button"
                                onClick={() => handleAddNewQuestion('text')}
                                className="w-full text-left p-4 bg-white hover:bg-emerald-50/70 active:scale-[0.98] border-2 border-slate-200/90 hover:border-emerald-500 rounded-2xl transition-all shadow-sm group cursor-pointer flex items-center gap-4"
                              >
                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
                                  <PenTool className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-slate-900 group-hover:text-emerald-700">
                                      {t(lang, 'questionTypeTextTitle')}
                                    </span>
                                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded-full">
                                      Text
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                                    {t(lang, 'questionTypeTextDesc')}
                                  </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-600 transition-colors shrink-0" />
                              </button>
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-slate-100/80 border-t border-slate-200/70 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setCreateModalCategory(null);
                                  setShowCreateQuestionModal(null);
                                }}
                                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                              >
                                {t(lang, 'cancelBtn') || 'Avbryt'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
  );
};
