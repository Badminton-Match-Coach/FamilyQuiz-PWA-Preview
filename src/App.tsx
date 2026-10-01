import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import LZString from 'lz-string';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Settings, 
  Trophy, 
  CheckCircle2, 
  Lock, 
  ChevronRight, 
  ChevronLeft, 
  Upload,
  Share2,
  XCircle,
  X,
  Edit2,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
  HelpCircle,
  Check,
  CheckSquare,
  MapPin,
  Map,
  Locate,
  Navigation,
  Compass,
  Search,
  Maximize2,
  Globe,
  Download,
  Database,
  Save,
  FolderOpen,
  HardDrive,
  Mail,
  ArrowUpDown,
  GripVertical,
  Image as ImageIcon,
  Key,
  ExternalLink
} from 'lucide-react';
import { Participant, QuizConfig, QuizMetadata, AnswerRecord, UserType, Question, QuestionType, Location } from './types';
import { Header } from './components/Navigation/Header';
import { SetupView } from './components/Tipspromenad/SetupView';
import { compressImageFile, getOptionLabel } from './utils/imageAndLabelUtils';

import { QuizWalkView } from './components/Tipspromenad/QuizWalkView';
import { ResultsView } from './components/Tipspromenad/ResultsView';
import { SettingsView } from './components/Settings/SettingsView';
import { QuestionFullScreenEditor } from './components/Settings/QuestionFullScreenEditor';
import { GlobalImportModal } from './components/Modals/GlobalImportModal';
import { GlobalAnswerImportModal } from './components/Modals/GlobalAnswerImportModal';
import { ImageZoomModal } from './components/Modals/ImageZoomModal';
import { HowItWorksModal } from './components/Modals/HowItWorksModal';
import { InAppBreakoutModal } from './components/Modals/InAppBreakoutModal';
import { CustomAlertModal } from './components/Modals/CustomAlertModal';
import { UrlHelpModal } from './components/Modals/UrlHelpModal';
import { BackupChoiceModal } from './components/Settings/BackupChoiceModal';

import { defaultQuiz } from './data/defaultQuiz';
import { 
  calculateDistanceMeters, 
  formatDistance, 
  calculateWalkingTimeMinutes,
  calculatePathDistance 
} from './utils/geoUtils';
import { generateQuizClient, batchTranslateQuizQuestions, getStoredApiKey, setStoredApiKey, getStoredAiUseImages, setStoredAiUseImages, validateTextAnswerWithGemini, findLocationCoordinatesWithGemini } from './geminiClient';
import { Language, SUPPORTED_LANGUAGES, detectLanguage, t, translateQuestion, unpackLanguage } from './i18n';
import { subscribeTranslationCache, requestQuestionTranslations, registerQuestionTranslation } from './translationCache';
import { evaluateTextAnswer, soundex, detectLinguisticLanguage } from './utils/soundex';
import { compressQuizToUrlCode, generateQuizDirectUrl, decompressQuizFromUrlCode } from './utils/quizCompression';
import { validateQuizConfig } from './utils/quizValidation';
import { cacheLogoAsDataUrl } from './utils/logoCache';
import { cacheAllQuizImages, preloadQuizImagesToMemory } from './utils/offlineImageCache';
import { 
  SavedQuizRecord, 
  saveQuizToIndexedDB, 
  saveQuizSessionToIndexedDB,
  getQuizByQuizId,
  getAllQuizzesFromIndexedDB, 
  deleteQuizFromIndexedDB, 
  exportIndexedDBToJSON, 
  importIndexedDBFromJSON, 
  shareIndexedDBJSON, 
  clearAllQuizzesFromIndexedDB,
  exportIndividualQuizzesToFiles,
  downloadSingleQuizAsJSON
} from './quizDb';
import { 
  getQuestionAvailableLanguages, 
  getQuizAvailableLanguages, 
  getLibraryItemLanguages, 
  getLanguageOption 
} from './utils/quizLanguages';
import { 
  robustParseQuizJson, 
  formatImportedQuestion, 
  parseQuizText 
} from './utils/quizParsers';

import {
  ParticipantAnswerPayload,
  DEFAULT_PARTICIPANT_UNIQUE_ID,
  normalizeParticipantNameForCompare,
  isReservedParticipantName,
  xorDecrypt,
  encodeParticipantAnswers,
  parseParticipantAnswerPayload,
  isQuizMatch,
  mergeParticipantAnswers,
  unwrapRedirectUrl
} from './utils/answerSharing';

const STORAGE_KEY_ANSWERS = 'quiz_pwa_answers';
const STORAGE_KEY_PARTICIPANTS = 'quiz_pwa_participants';
const STORAGE_KEY_CONFIG = 'quiz_pwa_config';
const STORAGE_KEY_WALKED_PATH = 'family_quiz_walked_path';
const STORAGE_KEY_CACHED_APP_URL = 'family_quiz_cached_app_url';
const STORAGE_KEY_WALK_ID = 'family_quiz_walk_id';
const DEFAULT_QUIZ_ID = 'default-quiz-template';
const FALLBACK_APP_URL = 'https://badminton-match-coach.github.io/FamilyQuiz-PWA/';

function getInitialCachedAppUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CACHED_APP_URL);
      if (saved && (saved.startsWith('http://') || saved.startsWith('https://'))) {
        return saved;
      }
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        const current = `${window.location.origin}${window.location.pathname}`;
        try {
          localStorage.setItem(STORAGE_KEY_CACHED_APP_URL, current);
        } catch {
          // ignore
        }
        return current;
      }
    } catch {
      // ignore
    }
  }
  return FALLBACK_APP_URL;
}

const ensureQuizId = (config: QuizConfig): QuizConfig => {
  if (config.quizId) return config;
  return { ...config, quizId: crypto.randomUUID() };
};

export default function App() {
  const [lang, setLang] = useState<Language>(() => detectLanguage());
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [languageMenuPosition, setLanguageMenuPosition] = useState({ top: 0, left: 0 });
  const languageMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [, setTranslationTick] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const [cachedAppUrl, setCachedAppUrl] = useState<string>(() => getInitialCachedAppUrl());
  const selectedLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0];

  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [dbFilterCategory, setDbFilterCategory] = useState('all');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [libraryFilterLanguage, setLibraryFilterLanguage] = useState('all');
  const [librarySortBy, setLibrarySortBy] = useState<'name-asc' | 'date-desc' | 'count-desc'>('name-asc');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showBackupChoiceModal, setShowBackupChoiceModal] = useState(false);
  const [userApiKeyInput, setUserApiKeyInput] = useState<string>(() => getStoredApiKey());
  const [directLinkLockOrderMode, setDirectLinkLockOrderMode] = useState<boolean>(false);

  const handleOpenApiKeyModal = () => {
    setUserApiKeyInput(getStoredApiKey());
    setShowApiKeyInput(true);
  };

  const handleCloseApiKeyModal = () => {
    setShowApiKeyInput(false);
    setUserApiKeyInput(getStoredApiKey());
  };

  const handleSaveCustomApiKey = () => {
    try {
      const trimmed = userApiKeyInput.trim();
      setStoredApiKey(trimmed);
      setUserApiKeyInput(trimmed);
      setShowApiKeyInput(false);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!showApiKeyInput) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseApiKeyModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showApiKeyInput]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 600, 600, 0.85);
      const cached = await cacheLogoAsDataUrl(dataUrl);
      setQuizConfig(prev => ({ ...prev, logoUrl: cached }));
    } catch (err) {
      console.error('Failed to upload logo:', err);
    }
  };

  const handleRemoveLogo = () => {
    setQuizConfig(prev => ({ ...prev, logoUrl: undefined }));
  };



  useEffect(() => {
    if (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      const current = `${window.location.origin}${window.location.pathname}`;
      try {
        localStorage.setItem(STORAGE_KEY_CACHED_APP_URL, current);
        setCachedAppUrl(current);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

  


  return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    const updateMenuPosition = () => {
      const button = languageMenuButtonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuWidth = 224;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12);
      setLanguageMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, left)
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-language-menu-root]')) {
        setIsLanguageMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isLanguageMenuOpen]);

  const handleInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setIsAppInstalled(true);
    }
    setDeferredInstallPrompt(null);
  };

  const [participants, setParticipants] = useState<Participant[]>(() => {
    const currentLang = detectLanguage();
    const saved = localStorage.getItem(STORAGE_KEY_PARTICIPANTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migration: ensure all participants have uniqueId
          const migrated = parsed.map((p: any) => {
            // Preserve default participant's reserved uniqueId
            if (p.id === 'default-du' || p.uniqueId === DEFAULT_PARTICIPANT_UNIQUE_ID) {
              const currentName = (p.name || '').trim();
              const isDefaultName = !currentName || isReservedParticipantName(currentName);
              return {
                ...p,
                uniqueId: DEFAULT_PARTICIPANT_UNIQUE_ID,
                name: isDefaultName ? t(currentLang, 'defaultParticipantName') : currentName
              };
            }
            return { ...p, uniqueId: p.uniqueId || crypto.randomUUID() };
          });
          return migrated;
        }
      } catch (e) {
        console.error(e);
      }
    }
    return [{ id: 'default-du', uniqueId: DEFAULT_PARTICIPANT_UNIQUE_ID, name: t(currentLang, 'defaultParticipantName'), type: 'vuxen' }];
  });

  const handleLanguageChange = (newLang: Language) => {
    unpackLanguage(newLang);
    setLang(newLang);
    try {
      localStorage.setItem('family_quiz_lang', newLang);
      localStorage.setItem('quiz_app_lang', newLang);
    } catch {
      // ignore
    }

    // Update default / un-edited participant names to match the new language
    setParticipants(prev => prev.map(p => {
      if (p.id === 'default-du' || p.uniqueId === DEFAULT_PARTICIPANT_UNIQUE_ID || isReservedParticipantName(p.name)) {
        if (!p.name || !p.name.trim() || isReservedParticipantName(p.name)) {
          return { ...p, name: t(newLang, 'defaultParticipantName') };
        }
      }
      return p;
    }));
  };

  const [answers, setAnswers] = useState<AnswerRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ANSWERS);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Could not load saved answers; starting with an empty answer list:', error);
      return [];
    }
  });

  const [walkId, setWalkId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_WALK_ID);
    if (saved) return saved;
    const newId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY_WALK_ID, newId);
    return newId;
  });

  const [quizConfig, setQuizConfig] = useState<QuizConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: ensure correctAnswers and originalLanguage exist
        const migrateQuestions = (qs: any[]) => (qs || []).map(q => ({
          ...q,
          correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : (typeof q.correctAnswer === 'number' ? [q.correctAnswer] : [0]),
          originalLanguage: q.originalLanguage || 'en'
        }));
        return ensureQuizId({
          ...parsed,
          barnQuestions: migrateQuestions(parsed.barnQuestions),
          vuxenQuestions: migrateQuestions(parsed.vuxenQuestions)
        });
      } catch (e) {
        return ensureQuizId(defaultQuiz);
      }
    }
    return ensureQuizId(defaultQuiz);
  });

  useEffect(() => {
    return subscribeTranslationCache(() => {
      setTranslationTick(t => t + 1);
    });
  }, []);

  useEffect(() => {
    const allQuestions = [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions];
    requestQuestionTranslations(allQuestions, lang);
  }, [lang, quizConfig.barnQuestions, quizConfig.vuxenQuestions]);

  const [view, setView] = useState<'setup' | 'quiz' | 'results' | 'config'>('setup');
  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState === 'visible');
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => setIsPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const locateUser = () => {
    if (!navigator.geolocation) {
      alert(t(lang, 'noGpsSupport'));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsLocating(false);
      },
      (err) => {
        console.error(err);
        alert(t(lang, 'couldNotGetPosition'));
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
const [pendingQuestionIndex, setPendingQuestionIndex] = useState<number | null>(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [lockNotice, setLockNotice] = useState<{
    questionIndex: number;
    distanceMeters: number | null;
    message: string;
  } | null>(null);

  const canAccessQuestionForParticipant = (participantId: string, questionIndex: number) => {
    if (!quizConfig.requireSequentialAnswers) return true;

    const answeredIndexes = answers
      .filter(a => a.participantId === participantId)
      .map(a => a.questionIndex);

    if (answeredIndexes.length === 0) {
      return questionIndex === 0;
    }

    const highestAnsweredIndex = Math.max(...answeredIndexes);
    return questionIndex <= highestAnsweredIndex + 1;
  };

  const handleSelectQuestionIndex = (idx: number, isFollowUp = false, participantId?: string) => {
    const activePartId = participantId || selectedParticipantId || (participants.length === 1 ? participants[0]?.id : null);
    if (quizConfig.requireSequentialAnswers && activePartId && !isFollowUp) {
      if (!canAccessQuestionForParticipant(activePartId, idx)) {
        alert(t(lang, 'sequentialAnswerRequiredAlert'));
        return;
      }
    }

    const question = quizQuestionPool?.[idx]
      || quizConfig.barnQuestions[idx]
      || quizConfig.vuxenQuestions[idx];
    const location = question?.location;
    const unlockDistance = Math.max(5, quizConfig.geotagUnlockDistance || 20);

    if (location) {
      const isTreasure = !!question?.hideLocationOnMap || !!location?.hideOnMap;
      if (!userLocation) {
        setLockNotice({
          questionIndex: idx,
          distanceMeters: null,
          message: isTreasure
            ? t(lang, 'treasureHuntLockMessage')
            : 'Denna fråga har en geotag på kartan. Slå på din GPS-position för att kunna låsa upp och svara på den!',
        });
        return;
      }

      const dist = calculateDistanceMeters(userLocation.lat, userLocation.lng, location.lat, location.lng);
      if (dist > unlockDistance) {
        setLockNotice({
          questionIndex: idx,
          distanceMeters: isTreasure ? null : dist,
          message: isTreasure
            ? t(lang, 'treasureHuntLockMessage')
            : `Du är ${formatDistance(dist)} från stationen. Du behöver gå närmare (inom ${unlockDistance} meter) för att låsa upp fråga ${idx + 1}!`,
        });
        return;
      }
    }

    // Question is non-geotagged or within unlock radius -> open question!
    setSelectedQuestionIndex(idx);
    setSelectedParticipantId(
      isFollowUp ? activePartId : participants.length === 1 ? participants[0].id : null
    );
    setLockNotice(null);
  };

  const openFollowUpQuestion = (question: Question, participantId: string, isCorrect?: boolean): boolean => {
    const mode = question.followUpMode || 'always';
    if (!question.followUpQuestionId || (mode === 'correct' && !isCorrect) || (mode === 'incorrect' && isCorrect !== false)) return false;

    const participant = participants.find(p => p.id === participantId);
    if (!participant) return false;
    const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const followUpIndex = questions.findIndex(q => q.id === question.followUpQuestionId);
    if (followUpIndex < 0) return false;

    handleSelectQuestionIndex(followUpIndex, true, participantId);
    return true;
  };
  const [showLoadConfirm, setShowLoadConfirm] = useState<{ type: 'db' | 'library'; payload: any; catalogBaseUrl?: string } | null>(null);
  const [showUrlHelpModal, setShowUrlHelpModal] = useState(false);

  const [viewingParticipantId, setViewingParticipantId] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [fullScreenEditingQuestionId, setFullScreenEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionLang, setEditingQuestionLang] = useState<Language>('sv');
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [showCreateQuestionModal, setShowCreateQuestionModal] = useState<UserType | 'båda' | null>(null);
  const [createModalCategory, setCreateModalCategory] = useState<'barn' | 'vuxen' | 'båda'>('barn');
  const [showRouteGeoTagModal, setShowRouteGeoTagModal] = useState(false);
  const [customAlert, setCustomAlert] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    type?: 'info' | 'success' | 'error';
  }>({
    isOpen: false,
    message: '',
  });

  useEffect(() => {
    window.alert = (msg: any) => {
      setCustomAlert({
        isOpen: true,
        message: String(msg),
        type: 'info',
      });
    };
  }, []);
  const [showQuestionMiniMap, setShowQuestionMiniMap] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [configMasterPasswordInput, setConfigMasterPasswordInput] = useState('');
  const [isConfigUnlocked, setIsConfigUnlocked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordCorrect, setIsPasswordCorrect] = useState(false);
  const [showConfigInput, setShowConfigInput] = useState(false);
  const [configJsonInput, setConfigJsonInput] = useState('');
  const [showAnswerImportModal, setShowAnswerImportModal] = useState(false);
  const [answerImportInput, setAnswerImportInput] = useState('');
  const [showAnswerExportModal, setShowAnswerExportModal] = useState(false);
  const [showParticipantActions, setShowParticipantActions] = useState(false);
  const [showResultsActions, setShowResultsActions] = useState(false);
  const [editingQuestionsCategory, setEditingQuestionsCategory] = useState<UserType>('barn');
  const [showQuestionMore, setShowQuestionMore] = useState(false);
  const [configTab, setConfigTab] = useState<'questions' | 'ai' | 'db' | 'general' | 'library'>('questions');
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizRecord[]>([]);
  const [showAllSavedQuizzes, setShowAllSavedQuizzes] = useState(false);
  const [dbSortBy, setDbSortBy] = useState<'date-desc' | 'date-asc' | 'name-asc'>('date-desc');
  const [dbNotification, setDbNotification] = useState<string | null>(null);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const dbFileInputRef = useRef<HTMLInputElement>(null);
  const [draggedQuestionRow, setDraggedQuestionRow] = useState<{
    id: string;
    isFollowUp: boolean;
    rootQuestionId: string;
  } | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<'before' | 'after' | null>(null);

  const latestSavedQuiz = useMemo(() => {
    if (savedQuizzes.length === 0) return null;
    return [...savedQuizzes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  }, [savedQuizzes]);

  const sortedSavedQuizzes = useMemo(() => {
    return [...savedQuizzes].sort((a, b) => {
      if (dbSortBy === 'date-desc') {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      }
      if (dbSortBy === 'date-asc') {
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      }
      if (dbSortBy === 'name-asc') {
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true });
      }
      return 0;
    });
  }, [savedQuizzes, dbSortBy]);

  const refreshSavedQuizzes = async () => {
    try {
      const list = await getAllQuizzesFromIndexedDB();
      setSavedQuizzes(list);
    } catch (err) {
      console.error('Kunde inte läsa från IndexedDB:', err);
    }
  };

  const autoSaveQuizToIndexedDBIfNew = async (config: QuizConfig) => {
    try {
      const rawTitle = (config.title || '').trim();
      if (!rawTitle) return;

      const existingList = await getAllQuizzesFromIndexedDB();
      const titleLower = rawTitle.toLowerCase();
      const exists = existingList.some(
        (item) => (item.title || '').trim().toLowerCase() === titleLower
      );

      if (!exists) {
        await saveQuizToIndexedDB(config, undefined, rawTitle);
        await refreshSavedQuizzes();
        console.log(`[IndexedDB] Nytt quiz "${rawTitle}" sparades automatiskt i databasen.`);
      }
    } catch (err) {
      console.warn('Kunde inte autospara nytt quiz till IndexedDB:', err);
    }
  };

  useEffect(() => {
    refreshSavedQuizzes();
  }, []);

  // Automatically cache all quiz images (questions, options, logo) in IndexedDB for offline resilience
  useEffect(() => {
    if (quizConfig) {
      cacheAllQuizImages(quizConfig).catch(() => {});
      preloadQuizImagesToMemory(quizConfig).catch(() => {});
    }
  }, [quizConfig]);

  useEffect(() => {
    if (configTab === 'db' || configTab === 'library' || showConfigInput || showAnswerImportModal) {
      refreshSavedQuizzes();
    }
  }, [configTab, showConfigInput, showAnswerImportModal, showAnswerExportModal]);

  const handleSaveCurrentQuizToDB = async () => {
    setIsSavingToDb(true);
    try {
      await saveQuizToIndexedDB(quizConfig);
      await refreshSavedQuizzes();
      setDbNotification(t(lang, 'quizSavedSuccess'));
      setTimeout(() => setDbNotification(null), 4000);
    } catch (err) {
      alert('Kunde inte spara till IndexedDB');
    } finally {
      setIsSavingToDb(false);
    }
  };

  const handleLoadQuizFromDB = (record: SavedQuizRecord, bypassConfirm = false) => {
    if (!bypassConfirm && (participants.length > 0 || answers.length > 0)) {
      setShowLoadConfirm({ type: 'db', payload: record });
      return;
    }

    const loadedQuiz = ensureQuizId(record.quizConfig);
    setQuizConfig(loadedQuiz);
    setNewQuizTitle(loadedQuiz.title);
    setNewQuizPassword(loadedQuiz.password || '');
    setNewGeotagDistance(loadedQuiz.geotagUnlockDistance || 20);
    setParticipants(record.quizState?.participants || []);
    setAnswers(record.quizState?.answers || []);
    setWalkedPath([]);
    setSelectedQuestionIndex(null);
    setSelectedQuestionIds([]);
    try {
      localStorage.setItem('family_quiz_config', JSON.stringify(loadedQuiz));
      localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
      if (record.quizState?.answers) {
        localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(record.quizState.answers));
      } else {
        localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify([]));
      }
    } catch (err) {
      console.warn('Could not save to localStorage:', err);
    }
    const msg = `${t(lang, 'quizLoadedSuccess')} ("${record.title}")`;
    setDbNotification(msg);
    setTimeout(() => setDbNotification(null), 5000);
    setShowConfigInput(false);
    setView('setup');
  };

  const handleOverwriteQuizInDB = async (recordId: string) => {
    setDbConfirmation({ action: 'overwrite', recordId });
  };

  const handleDeleteQuizFromDB = async (recordId: string) => {
    setDbConfirmation({ action: 'delete', recordId });
  };

  const handleShareExportDB = async () => {
    setShowBackupChoiceModal(true);
  };

  const handleExportAllInOne = async () => {
    try {
      const res = await shareIndexedDBJSON();
      if (res.shared) {
        if (res.method === 'download') {
          setDbNotification('Säkerhetskopian har sparats som fil! 📥');
        } else if (res.method === 'clipboard') {
          setDbNotification('Säkerhetskopian har kopierats till urklipp! 📋');
        } else {
          setDbNotification(t(lang, 'exportDbSuccess'));
        }
        setTimeout(() => setDbNotification(null), 4000);
      }
    } catch (err) {
      alert('Kunde inte exportera säkerhetskopia');
    }
  };

  const handleExportIndividualQuizzes = async () => {
    try {
      const res = await exportIndividualQuizzesToFiles();
      if (res.count > 0) {
        setDbNotification(`Laddade ner ${res.count} quiz som separata .json-filer! 📥`);
      } else {
        downloadSingleQuizAsJSON({
          config: quizConfig,
          quizState: { participants, answers }
        });
        setDbNotification('Aktivt quiz har exporterats som .json-fil! 📥');
      }
      setTimeout(() => setDbNotification(null), 4000);
    } catch (err) {
      alert('Kunde inte exportera quiz-filerna');
    }
  };

  const handleImportBackupJSONFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let text = '';
      if (typeof file.text === 'function') {
        text = await file.text();
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Kunde inte läsa filen.'));
          reader.onabort = () => reject(new Error('Inläsningen avbröts.'));
          reader.readAsText(file);
        });
      }
      const count = await importIndexedDBFromJSON(text);
      await refreshSavedQuizzes();
      setDbNotification(t(lang, 'importDbSuccess').replace('{count}', String(count)));
      setTimeout(() => setDbNotification(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Fel vid import av säkerhetskopia');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleClearAllDB = async () => {
    setDbConfirmation({ action: 'clear' });
  };
  const [questionSearch, setQuestionSearch] = useState('');
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [newQuizPassword, setNewQuizPassword] = useState('');
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [newQuizLogoUrl, setNewQuizLogoUrl] = useState('');
  const [newGeotagDistance, setNewGeotagDistance] = useState<number>(() => quizConfig.geotagUnlockDistance || 20);
  const [importTarget, setImportTarget] = useState<'barn' | 'vuxen' | 'båda'>('båda');
  const [showFacit, setShowFacit] = useState(false);
  const [facitPasswordInput, setFacitPasswordInput] = useState('');
  const [isFacitUnlocked, setIsFacitUnlocked] = useState(false);
  const [copiedConfigCode, setCopiedConfigCode] = useState(false);
  const [copiedAppUrlCode, setCopiedAppUrlCode] = useState(false);
  const [copiedDirectUrlCode, setCopiedDirectUrlCode] = useState(false);
  const [directUrlLength, setDirectUrlLength] = useState<number | null>(null);
  const [directLinkLockMode, setDirectLinkLockMode] = useState<boolean>(true);
  const [isQuizModeLocked, setIsQuizModeLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const rawHash = window.location.hash || '';
      const hashStr = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
      const hashParams = new URLSearchParams(hashStr);

      const isLockedInUrl = 
        searchParams.get('lock') === '1' ||
        searchParams.get('mode') === 'quiz' ||
        searchParams.get('mode') === 'player' ||
        hashParams.get('lock') === '1' ||
        hashParams.get('mode') === 'quiz' ||
        hashParams.get('mode') === 'player' ||
        rawHash.includes('lock=1') ||
        rawHash.includes('mode=quiz');

      if (isLockedInUrl) {
        localStorage.setItem('family_quiz_lock_mode', 'true');
        return true;
      }
      return localStorage.getItem('family_quiz_lock_mode') === 'true';
    } catch {
      return false;
    }
  });
  const quizUnlockClickCountRef = useRef(0);
  const quizUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQuizIconClick = () => {
    if (quizUnlockTimerRef.current) {
      clearTimeout(quizUnlockTimerRef.current);
      quizUnlockTimerRef.current = null;
    }

    quizUnlockClickCountRef.current += 1;

    if (quizUnlockClickCountRef.current === 7) {
      quizUnlockTimerRef.current = setTimeout(() => {
        if (quizUnlockClickCountRef.current === 7) {
          setIsQuizModeLocked((currentQuizModeLocked) => {
            const nextQuizModeLocked = !currentQuizModeLocked;
            if (nextQuizModeLocked) {
              localStorage.setItem('family_quiz_lock_mode', 'true');
            } else {
              localStorage.removeItem('family_quiz_lock_mode');
            }
            return nextQuizModeLocked;
          });
          quizUnlockClickCountRef.current = 0;
        }
        quizUnlockTimerRef.current = null;
      }, 3000);
      return;
    }

    if (quizUnlockClickCountRef.current > 7) {
      quizUnlockClickCountRef.current = 0;
      return;
    }

    quizUnlockTimerRef.current = setTimeout(() => {
      quizUnlockClickCountRef.current = 0;
      quizUnlockTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (quizUnlockTimerRef.current) clearTimeout(quizUnlockTimerRef.current);
    };
  }, []);

  // Tracked walked path (breadcrumbs) with local persistence
  const [walkedPath, setWalkedPath] = useState<Location[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_WALKED_PATH);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_WALKED_PATH, JSON.stringify(walkedPath));
      } catch (e) {
        // ignore
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [walkedPath]);

  const hasAnyGeotag = useMemo(() => {
    return [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions].some(q => !!q.location);
  }, [quizConfig.barnQuestions, quizConfig.vuxenQuestions]);

  const isFacitUnlockedRef = useRef(isFacitUnlocked);
  useEffect(() => {
    isFacitUnlockedRef.current = isFacitUnlocked;
  }, [isFacitUnlocked]);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const hasAnyGeotagRef = useRef(hasAnyGeotag);
  useEffect(() => {
    hasAnyGeotagRef.current = hasAnyGeotag;
  }, [hasAnyGeotag]);

  const userLocRef = useRef<Location | null>(null);

  // GPS Tracking & Live Breadcrumb recording with micro-jitter filter
  useEffect(() => {
    const isGeoTagEditing = fullScreenEditingQuestionId !== null || showRouteGeoTagModal;
    const isGpsNeeded = isPageVisible && (hasAnyGeotag || isGeoTagEditing) && !isFacitUnlocked && (
      view === 'quiz' || view === 'results' || isGeoTagEditing
    );
    if (!navigator.geolocation || !isGpsNeeded) return;

    const handlePos = (pos: GeolocationPosition) => {
      const newLoc: Location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };

      // Jitter filter: Only update userLocation if moved >= 1.5 meters or initially empty
      if (!userLocRef.current || calculateDistanceMeters(userLocRef.current.lat, userLocRef.current.lng, newLoc.lat, newLoc.lng) >= 1.5) {
        userLocRef.current = newLoc;
        setUserLocation(newLoc);
      }

      // Record breadcrumb point if quiz has geotag info, facit has not been unlocked yet, and user is in quiz or results
      if (hasAnyGeotagRef.current && !isFacitUnlockedRef.current && (viewRef.current === 'quiz' || viewRef.current === 'results')) {
        setWalkedPath(prev => {
          if (prev.length === 0) return [newLoc];
          const last = prev[prev.length - 1];
          const dist = calculateDistanceMeters(last.lat, last.lng, newLoc.lat, newLoc.lng);
          // Only append if user walked at least 3.5 meters to avoid stationary GPS jitter
          if (dist >= 3.5) {
            return [...prev, newLoc];
          }
          return prev;
        });
      }
    };

    navigator.geolocation.getCurrentPosition(
      handlePos,
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      handlePos,
      (err) => {
        console.warn('Geolocation watch error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [fullScreenEditingQuestionId, hasAnyGeotag, isFacitUnlocked, isPageVisible, showRouteGeoTagModal, view]);

  const [pointsInputValue, setPointsInputValue] = useState<number>(0);
  const [textInputValue, setTextInputValue] = useState<string>('');
  const [editorTestWord, setEditorTestWord] = useState<string>('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [copiedCustomPrompt, setCopiedCustomPrompt] = useState(false);
  const [pastedJsonInput, setPastedJsonInput] = useState('');
  const [hasCustomizedPromptLangs, setHasCustomizedPromptLangs] = useState(false);
  const [promptLanguages, setPromptLanguages] = useState<Language[]>(() => [lang]);

  useEffect(() => {
    if (!hasCustomizedPromptLangs) {
      setPromptLanguages([lang]);
    }
  }, [lang, hasCustomizedPromptLangs]);

  const togglePromptLanguage = (code: Language) => {
    setHasCustomizedPromptLangs(true);
    setPromptLanguages(prev => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter(c => c !== code);
      } else {
        return [...prev, code];
      }
    });
  };

  const constructSelectedAiPrompt = () => {
    const topicText = aiTopic.trim() || (
      lang === 'sv' ? 'Blandade allmänbildande frågor, natur, vetenskap, historia och rolig kuriosa' :
      lang === 'fr' ? 'Culture générale, nature, science, histoire et anecdotes amusantes' :
      lang === 'es' ? 'Cultura general, naturaleza, ciencia, historia y datos curiosos' :
      lang === 'de' ? 'Allgemeinwissen, Natur, Wissenschaft, Geschichte und unterhaltsame Fakten' :
      'General knowledge, nature, science, history, and fun trivia'
    );
    const langNames: Record<Language, string> = {
      sv: lang === 'sv' ? 'svenska (Swedish)' : lang === 'fr' ? 'suédois (Swedish)' : lang === 'es' ? 'sueco (Swedish)' : lang === 'de' ? 'Schwedisch (Swedish)' : 'Swedish',
      fr: lang === 'sv' ? 'franska (French)' : lang === 'fr' ? 'français (French)' : lang === 'es' ? 'francés (French)' : lang === 'de' ? 'Französisch (French)' : 'French',
      en: lang === 'sv' ? 'engelska (English)' : lang === 'fr' ? 'anglais (English)' : lang === 'es' ? 'inglés (English)' : lang === 'de' ? 'Englisch (English)' : 'English',
      es: lang === 'sv' ? 'spanska (Spanish)' : lang === 'fr' ? 'espagnol (Spanish)' : lang === 'es' ? 'español (Spanish)' : lang === 'de' ? 'Spanisch (Spanish)' : 'Spanish',
      de: lang === 'sv' ? 'tyska (German)' : lang === 'fr' ? 'allemand (German)' : lang === 'es' ? 'alemán (German)' : lang === 'de' ? 'Deutsch (German)' : 'German',
      no: lang === 'sv' ? 'norska (Norwegian)' : 'Norwegian',
      da: lang === 'sv' ? 'danska (Danish)' : 'Danish',
      fi: lang === 'sv' ? 'finska (Finnish)' : 'Finnish',
      it: lang === 'sv' ? 'italienska (Italian)' : 'Italian',
      et: lang === 'sv' ? 'estniska (Estonian)' : 'Estonian',
      lv: lang === 'sv' ? 'lettiska (Latvian)' : 'Latvian',
      lt: lang === 'sv' ? 'litauiska (Lithuanian)' : 'Lithuanian',
      uk: lang === 'sv' ? 'ukrainska (Ukrainian)' : 'Ukrainian',
      is: lang === 'sv' ? 'isländska (Icelandic)' : 'Icelandic',
      se: lang === 'sv' ? 'nordsamiska (Northern Sami)' : 'Northern Sami',
      nl: lang === 'sv' ? 'nederländska (Dutch)' : 'Dutch',
      be: lang === 'sv' ? 'flamländska/belgiska (Flemish/Belgian)' : 'Flemish/Belgian'
    };

    const primaryLang = promptLanguages[0] || lang;
    const primaryLangName = langNames[primaryLang] || 'Swedish';
    const otherLangs = promptLanguages.filter(l => l !== primaryLang);

    const ageFromNum = Number(aiKidAgeFrom) || 5;
    const ageToNum = Number(aiKidAgeTo) || 10;
    const countNum = Number(aiCount) || 5;

    let targetDesc = '';
    if (aiTarget === 'båda') {
      if (lang === 'sv') targetDesc = `${countNum} frågor för barn (passande ålder ${ageFromNum}-${ageToNum} år) OCH ${countNum} frågor för vuxna (mer utmanande).`;
      else if (lang === 'fr') targetDesc = `${countNum} questions pour enfants (âge ${ageFromNum}-${ageToNum} ans) ET ${countNum} questions pour adultes (plus exigeantes).`;
      else if (lang === 'es') targetDesc = `${countNum} preguntas para niños (edad ${ageFromNum}-${ageToNum} años) Y ${countNum} preguntas para adultos (más desafiantes).`;
      else if (lang === 'de') targetDesc = `${countNum} Fragen für Kinder (passend für ${ageFromNum}-${ageToNum} Jahre) UND ${countNum} Fragen für Erwachsene (anspruchsvoller).`;
      else targetDesc = `${countNum} questions for kids (suitable age ${ageFromNum}-${ageToNum} years) AND ${countNum} questions for adults (more challenging).`;
    } else if (aiTarget === 'barn') {
      if (lang === 'sv') targetDesc = `${countNum} frågor för barn (passande ålder ${ageFromNum}-${ageToNum} år).`;
      else if (lang === 'fr') targetDesc = `${countNum} questions pour enfants (âge ${ageFromNum}-${ageToNum} ans).`;
      else if (lang === 'es') targetDesc = `${countNum} preguntas para niños (edad ${ageFromNum}-${ageToNum} años).`;
      else if (lang === 'de') targetDesc = `${countNum} Fragen für Kinder (passend für ${ageFromNum}-${ageToNum} Jahre).`;
      else targetDesc = `${countNum} questions for kids (suitable age ${ageFromNum}-${ageToNum} years).`;
    } else {
      if (lang === 'sv') targetDesc = `${countNum} frågor för vuxna (kluriga och underhållande).`;
      else if (lang === 'fr') targetDesc = `${countNum} questions pour adultes (captivantes et amusantes).`;
      else if (lang === 'es') targetDesc = `${countNum} preguntas para adultos (desafiantes y entretenidas).`;
      else if (lang === 'de') targetDesc = `${countNum} Fragen für Erwachsene (knifflig und unterhaltsam).`;
      else targetDesc = `${countNum} questions for adults (tricky and entertaining).`;
    }

    const buildSampleQuestion = (isAdult: boolean) => {
      const qText = isAdult 
        ? (primaryLang === 'en' ? "In which year did World War I start?" : primaryLang === 'fr' ? "En quelle année la Première Guerre mondiale a-t-elle commencé ?" : primaryLang === 'es' ? "¿En qué año comenzó la Primera Guerra Mundial?" : primaryLang === 'de' ? "In welchem Jahr begann der Erste Weltkrieg?" : "Vilket år startade första världskriget?")
        : (primaryLang === 'en' ? "What is the capital of Sweden?" : primaryLang === 'fr' ? "Quelle est la capitale de la Suède ?" : primaryLang === 'es' ? "¿Cuál es la capital de Suecia?" : primaryLang === 'de' ? "Was ist die Hauptstadt von Schweden?" : "Vad heter Sveriges huvudstad?");
      const qOpts = isAdult
        ? ["1912", "1914", "1918", "1939"]
        : (primaryLang === 'en' ? ["Stockholm", "Gothenburg", "Malmo"] : ["Stockholm", "Göteborg", "Malmö"]);
      const correct = isAdult ? 1 : 0;

      const base: any = {
        text: qText,
        options: qOpts,
        correctAnswer: correct,
        originalLanguage: primaryLang
      };

      if (aiGeotagLandmarks) {
        base.latitude = isAdult ? 59.3268 : 59.3293;
        base.longitude = isAdult ? 18.0717 : 18.0686;
        base.locationName = isAdult ? "Gamla Stan" : "Stockholms Slott";
      }

      if (aiIncludeImages) {
        base.imageUrl = "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&q=80";
        base.optionImages = [
          "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=400&q=80",
          "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=400&q=80",
          "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=80"
        ];
      }

      if (otherLangs.length > 0) {
        const transObj: Record<string, any> = {};
        // Sample with up to 3 requested translation languages to keep example clean
        const sampleLangs = otherLangs.slice(0, 3);
        sampleLangs.forEach(l => {
          if (l === 'en') {
            transObj.en = {
              text: isAdult ? "In which year did World War I start?" : "What is the capital of Sweden?",
              options: isAdult ? ["1912", "1914", "1918", "1939"] : ["Stockholm", "Gothenburg", "Malmo"]
            };
          } else if (l === 'fr') {
            transObj.fr = {
              text: isAdult ? "En quelle année la Première Guerre mondiale a-t-elle commencé ?" : "Quelle est la capitale de la Suède ?",
              options: isAdult ? ["1912", "1914", "1918", "1939"] : ["Stockholm", "Göteborg", "Malmö"]
            };
          } else if (l === 'de') {
            transObj.de = {
              text: isAdult ? "In welchem Jahr begann der Erste Weltkrieg?" : "Was ist die Hauptstadt von Schweden?",
              options: isAdult ? ["1912", "1914", "1918", "1939"] : ["Stockholm", "Göteborg", "Malmö"]
            };
          } else if (l === 'es') {
            transObj.es = {
              text: isAdult ? "¿En qué año comenzó la Primera Guerra Mundial?" : "¿Cuál es la capital de Suecia?",
              options: isAdult ? ["1912", "1914", "1918", "1939"] : ["Estocolmo", "Gotemburgo", "Malmo"]
            };
          } else if (l === 'sv') {
            transObj.sv = {
              text: isAdult ? "Vilket år startade första världskriget?" : "Vad heter Sveriges huvudstad?",
              options: isAdult ? ["1912", "1914", "1918", "1939"] : ["Stockholm", "Göteborg", "Malmö"]
            };
          } else {
            transObj[l] = {
              text: isAdult ? `[${langNames[l] || l}] Question text...` : `[${langNames[l] || l}] Question text...`,
              options: isAdult ? ["Opt 1", "Opt 2", "Opt 3", "Opt 4"] : ["Opt 1", "Opt 2", "Opt 3"]
            };
          }
        });
        base.translations = transObj;
      }

      return base;
    };

    let exampleJson = '';
    if (aiTarget === 'båda') {
      exampleJson = JSON.stringify({
        barnQuestions: [buildSampleQuestion(false)],
        vuxenQuestions: [buildSampleQuestion(true)]
      }, null, 2);
    } else if (aiTarget === 'barn') {
      exampleJson = JSON.stringify({
        barnQuestions: [buildSampleQuestion(false)]
      }, null, 2);
    } else {
      exampleJson = JSON.stringify({
        vuxenQuestions: [buildSampleQuestion(true)]
      }, null, 2);
    }

    if (lang === 'en') {
      let langReqs = `1. Primary language: ${primaryLangName}. All root fields ("text" and "options") MUST be in this language. Set "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. TRANSLATIONS: Each question MUST include a "translations" object with fully translated "text" and "options" for the following language codes: ${otherLangDesc}. Do NOT duplicate root language in translations.\n`;
      }

      return `Create a walk-quiz/trivia set about the topic: "${topicText}".

REQUIREMENTS:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Questions to generate: ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Answer options: Anywhere between 2 and 5 multiple choice options per question in the "options" array (questions can have 2, 3, 4, or 5 options).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" is a 0-based integer index for the correct option (0 for 1st option, 1 for 2nd, 2 for 3rd, 3 for 4th, 4 for 5th).
${otherLangs.length > 0 ? '6' : '5'}. Output format: Return ONLY valid JSON matching the template below without markdown code fences or explanatory text.

EXACT JSON TEMPLATE:
${exampleJson}`;
    } else if (lang === 'fr') {
      let langReqs = `1. Langue principale : ${primaryLangName}. Tous les champs principaux ("text" et "options") DOIVENT être dans cette langue. Indiquez "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. TRADUCTIONS : Chaque question DOIT inclure un objet "translations" avec la "text" et les "options" entièrement traduites pour les codes : ${otherLangDesc}.\n`;
      }

      return `Créez un jeu de cartes/quiz sur le thème : "${topicText}".

EXIGENCES :
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Nombre de questions : ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Options de réponse : Entre 2 et 5 options au choix par question dans le tableau "options" (2, 3, 4 ou 5 options).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" est un entier basé sur 0 indiquant la bonne réponse (0 pour la 1ère option, 1 pour la 2ème, 2 pour la 3ème, etc.).
${otherLangs.length > 0 ? '6' : '5'}. Format de sortie : Renvoyez UNIQUEMENT un JSON valide selon le modèle ci-dessous.

MODÈLE JSON :
${exampleJson}`;
    } else if (lang === 'es') {
      let langReqs = `1. Idioma principal: ${primaryLangName}. Todos los campos principales ("text" y "options") DEBEN estar en este idioma. Establece "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. TRADUCCIONES: Cada pregunta DEBE incluir un objeto "translations" con "text" y "options" traducidos para: ${otherLangDesc}.\n`;
      }

      return `Crea un cuestionario sobre el tema: "${topicText}".

REQUISITOS:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Cantidad de preguntas: ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Opciones de respuesta: Entre 2 y 5 opciones por pregunta en el arreglo "options" (2, 3, 4 o 5 opciones).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" es un número entero con índice base 0 para la opción correcta (0 para la 1ª opción, 1 para la 2ª, etc.).
${otherLangs.length > 0 ? '6' : '5'}. Formato de salida: Devuelve ÚNICAMENTE un JSON válido según la plantilla.

PLANTILLA JSON:
${exampleJson}`;
    } else if (lang === 'de') {
      let langReqs = `1. Hauptsprache: ${primaryLangName}. Alle Hauptfelder ("text" und "options") MÜSSEN in dieser Sprache sein. Setze "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. ÜBERSETZUNGEN: Jede Frage MUSS ein "translations"-Objekt mit übersetztem "text" und "options" für folgende Sprachcodes enthalten: ${otherLangDesc}.\n`;
      }

      return `Erstelle ein Quiz/Trivia-Set zum Thema: "${topicText}".

ANFORDERUNGEN:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Fragen: ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Antwortoptionen: Frei wählbar zwischen 2 und 5 Antwortmöglichkeiten pro Frage im "options"-Array (2, 3, 4 oder 5 Optionen).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" ist eine 0-basierte Ganzzahl für die richtige Option (0 für die 1. Option, 1 für die 2., etc.).
${otherLangs.length > 0 ? '6' : '5'}. Ausgabeformat: Antworte AUSSCHLIESSLICH mit gültigem JSON gemäß Vorlage.

EXAKTE JSON-VORLAGE:
${exampleJson}`;
    } else {
      let langReqs = `1. Huvudsakligt språk: ${primaryLangName}. Alla grundfält ("text" och "options") MÅSTE vara på detta språk. Sätt "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. ÖVERSÄTTNINGAR: Varje fråga MÅSTE inkludera ett "translations"-objekt med fullständigt översatt "text" och "options" för följande språkkoder: ${otherLangDesc}. (Inkludera inte "${primaryLang}" i translations-objektet).\n`;
      }

      return `Skapa ett tipspromenad-quiz om ämnet/temat: "${topicText}".

KRAV:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Antal frågor: ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Svarsalternativ: Valfritt mellan 2 och 5 svarsalternativ per fråga i "options"-listan (frågor kan ha 2, 3, 4 eller 5 alternativ).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer": 0-baserat heltal för indexet av det rätta alternativet (0 för 1:a alternativet, 1 för 2:a, 2 för 3:e, 3 för 4:e, eller 4 för 5:e alternativet).
${otherLangs.length > 0 ? '6' : '5'}. Format: Svara ENBART med ett giltigt JSON-objekt enligt mallen nedan utan förklarande text före eller efter.

EXAKT JSON-MALL ATT RETURNERA:
${exampleJson}`;
    }
  };

  const copyCustomPromptToClipboard = () => {
    const promptText = constructSelectedAiPrompt();
    navigator.clipboard.writeText(promptText).then(() => {
      setCopiedCustomPrompt(true);
      setTimeout(() => setCopiedCustomPrompt(false), 4000);
    });
  };

  const handleImportPastedJson = async (jsonStr: string) => {
    try {
      if (!jsonStr || !jsonStr.trim()) {
        alert(t(lang, 'couldNotReadInputAlert'));
        return;
      }
      await processImportConfig(jsonStr);
      setPastedJsonInput('');
      setShowSettingsModal(false);
    } catch (e) {
      alert(t(lang, 'couldNotReadInputAlert'));
    }
  };

  useEffect(() => {
    const activePartId = selectedParticipantId || (participants.length === 1 ? participants[0]?.id : null);
    if (activePartId && selectedQuestionIndex !== null) {
      const participant = participants.find(p => p.id === activePartId);
      if (participant) {
        const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
        const q = questions[selectedQuestionIndex];
        if (q && q.type === 'points') {
          const ans = answers.find(a => a.participantId === activePartId && a.questionIndex === selectedQuestionIndex);
          setPointsInputValue(typeof ans?.pointsScored === 'number' ? ans.pointsScored : 0);
        } else if (q && q.type === 'text') {
          const ans = answers.find(a => a.participantId === activePartId && a.questionIndex === selectedQuestionIndex);
          setTextInputValue(ans?.textAnswer || '');
        }
      }
    }
  }, [selectedParticipantId, selectedQuestionIndex, participants, quizConfig, answers]);

  // Persist data to "cache" (localStorage) with debounce
  useEffect(() => {
    if (participants.length === 0) {
      setParticipants([{ id: 'default-du', uniqueId: DEFAULT_PARTICIPANT_UNIQUE_ID, name: t(lang, 'defaultParticipantName'), type: 'vuxen' }]);
    } else {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(participants));
        } catch {}
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [participants, lang]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(answers));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [answers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(quizConfig));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [quizConfig]);

  useEffect(() => {
    if (!isAdmin || !quizConfig.quizId) return;

    const saveTimeout = window.setTimeout(() => {
      saveQuizSessionToIndexedDB(quizConfig, { participants, answers })
        .then(() => refreshSavedQuizzes())
        .catch((error) => console.warn('Could not save quiz session to IndexedDB:', error));
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [isAdmin, quizConfig, participants, answers]);

  useEffect(() => {
    if (view === 'config') {
      setNewQuizPassword(quizConfig.password || '');
      setNewQuizTitle(quizConfig.title || '');
      setNewQuizLogoUrl(quizConfig.logoUrl || '');
      setNewGeotagDistance(quizConfig.geotagUnlockDistance || 20);
    }
  }, [view, quizConfig]);

  const totalQuestions = useMemo(() => {
    return Math.max(quizConfig.barnQuestions.length, quizConfig.vuxenQuestions.length, 0);
  }, [quizConfig]);

  const followUpQuestionIds = useMemo(() => new Set(
    [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions]
      .map(question => question.followUpQuestionId)
      .filter((id): id is string => !!id)
  ), [quizConfig]);

  const participantTypes = new Set(participants.map(participant => participant.type));
  const quizQuestionType = participantTypes.size === 1
    ? participants[0]?.type
    : selectedParticipantId
      ? participants.find(participant => participant.id === selectedParticipantId)?.type
      : null;
  const quizQuestionPool = quizQuestionType === 'barn'
    ? quizConfig.barnQuestions
    : quizQuestionType === 'vuxen'
      ? quizConfig.vuxenQuestions
      : null;

  const visibleQuestionIndexes = useMemo(() => (
    Array.from({ length: totalQuestions }, (_, index) => index)
      .filter(index => {
        const question = quizQuestionPool
          ? quizQuestionPool[index]
          : quizConfig.barnQuestions[index] || quizConfig.vuxenQuestions[index];
        const categoryFollowUpIds = quizQuestionPool
          ? new Set(quizQuestionPool
            .map(candidate => candidate.followUpQuestionId)
            .filter((id): id is string => !!id))
          : followUpQuestionIds;
        return !!question && !categoryFollowUpIds.has(question.id);
      })
  ), [followUpQuestionIds, quizConfig, quizQuestionPool, totalQuestions]);

  const visibleQuestionCount = visibleQuestionIndexes.length;

  const editorQuestionRows = useMemo(() => {
    const questions = editingQuestionsCategory === 'barn'
      ? quizConfig.barnQuestions
      : quizConfig.vuxenQuestions;
    const followUpTargetIds = new Set(
      questions
        .map(question => question.followUpQuestionId)
        .filter((id): id is string => !!id)
    );
    const childrenByParentId = new globalThis.Map<string, Question[]>();

    for (const question of questions) {
      if (!question.followUpQuestionId) continue;
      const children = childrenByParentId.get(question.id) || [];
      const child = questions.find(candidate => candidate.id === question.followUpQuestionId);
      if (child) children.push(child);
      childrenByParentId.set(question.id, children);
    }

    const mainQuestions = questions.filter(question => !followUpTargetIds.has(question.id));
    const rows: {
      question: Question;
      label: string;
      isFollowUp: boolean;
      parentQuestionId?: string;
      rootQuestionId: string;
      groupIndex: number;
      totalGroups: number;
      subIndex: number;
      totalSubInGroup: number;
    }[] = [];

    mainQuestions.forEach((rootQ, rootIdx) => {
      // Calculate total chained followups under this root
      const groupChildren: Question[] = [];
      const collectChildren = (q: Question, visited: Set<string>) => {
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
        question: Question,
        label: string,
        isFollowUp: boolean,
        visited: Set<string>,
        parentQuestionId?: string,
        subIndex: number = 0
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
          addRowAndChildren(child, `${label}:${childIndex + 1}`, true, nextVisited, question.id, currentChildCounter);
        });
      };

      addRowAndChildren(rootQ, `${rootIdx + 1}`, false, new Set(), undefined, 0);
    });

    return rows;
  }, [editingQuestionsCategory, quizConfig]);

  const addParticipant = (name: string, type: UserType) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (isReservedParticipantName(trimmedName)) {
      alert(t(lang, 'reservedParticipantNameError', { name: trimmedName }));
      return;
    }
    const newParticipant: Participant = {
      id: crypto.randomUUID(),
      uniqueId: crypto.randomUUID(),
      name: trimmedName,
      type
    };
    setParticipants([...participants, newParticipant]);
  };

  const removeParticipant = (id: string) => {
    setParticipants(participants.filter(p => p.id !== id));
    setAnswers(answers.filter(a => a.participantId !== id));
    if (selectedParticipantId === id) {
      setSelectedParticipantId(null);
    }
    if (viewingParticipantId === id) {
      setViewingParticipantId(null);
    }
  };

  const updateParticipantName = (id: string, newName: string) => {
    // Just update without validation - validation happens on blur
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const validateAndFinalizeParticipantName = (id: string) => {
    const participant = participants.find(p => p.id === id);
    if (!participant) return;

    const trimmedName = participant.name.trim();
    if (trimmedName && isReservedParticipantName(trimmedName)) {
      alert(t(lang, 'reservedParticipantNameError', { name: trimmedName }));
      setParticipants(prev => prev.map(p => p.id === id ? { ...p, name: '' } : p));
      return;
    }
    setEditingParticipantId(null);
  };

  const isQuestionFullyAnswered = (questionIndex: number) => {
    return participants.length > 0 && participants.every(p => {
      const pQuestions = p.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
      if (!pQuestions[questionIndex]) return true;
      return answers.some(a => a.participantId === p.id && a.questionIndex === questionIndex);
    });
  };

  const submitAnswer = (answerIndex: number) => {
    const activePartId = selectedParticipantId || (participants.length === 1 ? participants[0]?.id : null);
    if (!activePartId || selectedQuestionIndex === null) return;

    // Check if already answered in this quiz run
    const alreadyAnswered = answers.some(a => a.participantId === activePartId && a.questionIndex === selectedQuestionIndex);
    if (alreadyAnswered) return;

    const participant = participants.find(p => p.id === activePartId);
    if (!participant) return;

    const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const question = questions[selectedQuestionIndex];
    
    const isCorrect = (question?.correctAnswers || []).includes(answerIndex);

    const newAnswer: AnswerRecord = {
      participantId: activePartId,
      questionIndex: selectedQuestionIndex,
      answerIndex,
      isCorrect,
      timestamp: Date.now()
    };

    setAnswers([...answers, newAnswer]);

    const openedFollowUp = openFollowUpQuestion(question, activePartId, isCorrect);
    if (!openedFollowUp) {
      const allAnswered = isQuestionFullyAnswered(selectedQuestionIndex);
      if (allAnswered) {
        setSelectedParticipantId(participants.length === 1 ? participants[0].id : null);
        setSelectedQuestionIndex(null);
      } else {
        setSelectedParticipantId(null);
      }
    }
  };

  const submitPointsAnswer = (pointsScored: number) => {
    const activePartId = selectedParticipantId || (participants.length === 1 ? participants[0]?.id : null);
    if (!activePartId || selectedQuestionIndex === null) return;

    // Check if already answered in this quiz run
    const alreadyAnswered = answers.some(a => a.participantId === activePartId && a.questionIndex === selectedQuestionIndex);
    if (alreadyAnswered) return;

    const participant = participants.find(p => p.id === activePartId);
    if (!participant) return;
    const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const question = questions[selectedQuestionIndex];
    if (!question) return;

    const newAnswer: AnswerRecord = {
      participantId: activePartId,
      questionIndex: selectedQuestionIndex,
      pointsScored: Math.max(0, pointsScored),
      timestamp: Date.now()
    };

    setAnswers([...answers, newAnswer]);

    const openedFollowUp = openFollowUpQuestion(question, activePartId);
    if (!openedFollowUp) {
      const allAnswered = isQuestionFullyAnswered(selectedQuestionIndex);
      if (allAnswered) {
        setSelectedParticipantId(participants.length === 1 ? participants[0].id : null);
        setSelectedQuestionIndex(null);
      } else {
        setSelectedParticipantId(null);
      }
    }
  };

  const submitTextAnswer = (rawUserText: string) => {
    const activePartId = selectedParticipantId || (participants.length === 1 ? participants[0]?.id : null);
    if (!activePartId || selectedQuestionIndex === null) return;

    // Check if already answered in this quiz run
    const alreadyAnswered = answers.some(a => a.participantId === activePartId && a.questionIndex === selectedQuestionIndex);
    if (alreadyAnswered) return;

    const participant = participants.find(p => p.id === activePartId);
    if (!participant) return;

    const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const question = questions[selectedQuestionIndex];
    if (!question) return;

    const targetLang = question.originalLanguage || lang;
    const evalResult = evaluateTextAnswer(
      rawUserText,
      question.correctTextAnswer || '',
      question.acceptedTextAnswers || [],
      targetLang,
      quizConfig.textMatchStrictness || 'normal'
    );

    const targetPartId = activePartId;
    const targetQIdx = selectedQuestionIndex;

    const newAnswer: AnswerRecord = {
      participantId: targetPartId,
      questionIndex: targetQIdx,
      textAnswer: rawUserText.trim(),
      isCorrect: evalResult.isCorrect,
      timestamp: Date.now()
    };

    setAnswers([...answers, newAnswer]);

    // Optional AI Linguistic Engine check when online with Gemini key if initial offline test was inconclusive
    const storedApiKey = getStoredApiKey();
    if (!evalResult.isCorrect && storedApiKey && typeof navigator !== 'undefined' && navigator.onLine) {
      validateTextAnswerWithGemini({
        userInput: rawUserText,
        targetWord: question.correctTextAnswer || '',
        acceptedAlternatives: question.acceptedTextAnswers || [],
        language: targetLang,
        apiKey: storedApiKey
      }).then(aiResult => {
        if (aiResult.match) {
          setAnswers(prev => prev.map(a => 
            (a.participantId === targetPartId && a.questionIndex === targetQIdx)
              ? { ...a, isCorrect: true }
              : a
          ));
        }
      }).catch(() => {
        // Silently preserve offline engine result on network/API errors
      });
    }

    const openedFollowUp = openFollowUpQuestion(question, targetPartId, evalResult.isCorrect);
    if (!openedFollowUp) {
      const allAnswered = isQuestionFullyAnswered(selectedQuestionIndex);
      if (allAnswered) {
        setSelectedParticipantId(participants.length === 1 ? participants[0].id : null);
        setSelectedQuestionIndex(null);
      } else {
        setSelectedParticipantId(null);
      }
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const processImportConfig = async (rawInput: string) => {
    try {
      // Clean markdown code blocks if wrapped
      let cleanInput = rawInput
        .replace(/^```(?:json|text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      // Unwrap any redirect services (e.g. Outlook SafeLinks, Proofpoint, Google redirect, etc.)
      cleanInput = unwrapRedirectUrl(cleanInput);
      if (cleanInput.includes('%23') || cleanInput.includes('%3D') || cleanInput.includes('%26')) {
        try {
          cleanInput = decodeURIComponent(cleanInput);
        } catch {
          // ignore
        }
      }

      // Check if user provided a direct URL to a quiz file or manifest
      if ((cleanInput.startsWith('http://') || cleanInput.startsWith('https://')) && !cleanInput.includes('quiz=') && !cleanInput.includes('z=')) {
        try {
          const fetchedContent = await fetchWithCorsFallback(cleanInput, false);
          if (fetchedContent && typeof fetchedContent === 'string' && fetchedContent.trim()) {
            cleanInput = fetchedContent.trim();
          }
        } catch (urlErr: any) {
          console.warn('Failed to fetch URL directly in processImportConfig:', urlErr);
          throw new Error(urlErr.message || 'Kunde inte hämta filen från angiven webbadress.');
        }
      }

      // Check for compressed URL format or code (e.g. ?quiz=..., #quiz=..., #z=..., ?z=..., or raw compressed string)
      let compressedCode = '';
      if (cleanInput.includes('quiz=')) {
        const match = cleanInput.match(/[?#&]quiz=([^&#\s]+)/i);
        if (match && match[1]) {
          compressedCode = decodeURIComponent(match[1]);
        }
      } else if (cleanInput.includes('z=')) {
        const match = cleanInput.match(/[?#&]?z=([^&#\s]+)/i);
        if (match && match[1]) {
          compressedCode = match[1];
        } else if (cleanInput.toLowerCase().startsWith('z=')) {
          compressedCode = cleanInput;
        }
      } else if (cleanInput.includes('q=')) {
        const match = cleanInput.match(/[?#&]?q=([^&#\s]+)/i);
        if (match && match[1]) {
          compressedCode = match[1];
        }
      } else if (cleanInput.startsWith('#z=') || cleanInput.startsWith('#Z=')) {
        compressedCode = cleanInput.slice(1);
      }

      if (compressedCode) {
        const decompressed = decompressQuizFromUrlCode(compressedCode);
        if (decompressed) {
          const validation = validateQuizConfig(decompressed);
          if (!validation.valid) throw new Error(validation.error);
          let importedQuiz = ensureQuizId(decompressed);
          importedQuiz = { ...importedQuiz, logoUrl: await cacheLogoAsDataUrl(importedQuiz.logoUrl) };
          await autoSaveQuizToIndexedDBIfNew(importedQuiz);
          const newWalkId = crypto.randomUUID();
          setWalkId(newWalkId);
          localStorage.setItem(STORAGE_KEY_WALK_ID, newWalkId);
          setQuizConfig(importedQuiz);
          localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(importedQuiz));
          setShowConfigInput(false);
          setConfigJsonInput('');
          alert(t(lang, 'importSuccess'));
          return;
        }
      }

      const answerPayload = parseParticipantAnswerPayload(cleanInput);
      if (answerPayload) {
        await handleImportParticipantAnswers(answerPayload);
        setShowConfigInput(false);
        setConfigJsonInput('');
        return;
      }

      let jsonCandidate = cleanInput;

      // If it doesn't look like JSON array '[' or object '{', try decryption/base64 decoding
      if (!jsonCandidate.startsWith('{') && !jsonCandidate.startsWith('[')) {
        const decryptedDollar = xorDecrypt(rawInput, '$');
        const decDollarTrim = decryptedDollar.trim();
        if (decDollarTrim.startsWith('{') || decDollarTrim.startsWith('[')) {
          jsonCandidate = decDollarTrim;
        } else {
          const decryptedPassword = xorDecrypt(rawInput, 'Password');
          const decPassTrim = decryptedPassword.trim();
          if (decPassTrim.startsWith('{') || decPassTrim.startsWith('[')) {
            jsonCandidate = decPassTrim;
          } else {
            const directBase64 = tryBase64Decode(rawInput);
            if (directBase64) {
              const base64Trim = directBase64.trim();
              if (base64Trim.startsWith('{') || base64Trim.startsWith('[')) {
                jsonCandidate = base64Trim;
              }
            }
          }
        }
      }

      const looksLikeJson = jsonCandidate.startsWith('{') || jsonCandidate.startsWith('[') || jsonCandidate.includes('"barnQuestions"') || jsonCandidate.includes('"vuxenQuestions"');

      // Try parsing JSON using robust parser
      const parsed = robustParseQuizJson(jsonCandidate) || robustParseQuizJson(rawInput);
      if (parsed) {
        try {
          // Case 1: Full Quiz Config with barnQuestions and vuxenQuestions
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed.barnQuestions || parsed.vuxenQuestions)) {
            const barnQs = Array.isArray(parsed.barnQuestions)
              ? parsed.barnQuestions.map((q: any, idx: number) => formatImportedQuestion(q, idx))
              : [];
            const vuxenQs = Array.isArray(parsed.vuxenQuestions)
              ? parsed.vuxenQuestions.map((q: any, idx: number) => formatImportedQuestion(q, idx))
              : [];

            const fullConfig: QuizConfig = {
              quizId: parsed.quizId || crypto.randomUUID(),
              title: parsed.title || 'Quiz',
              password: parsed.password || '',
              logoUrl: parsed.logoUrl,
              barnQuestions: barnQs,
              vuxenQuestions: vuxenQs,
              geotagUnlockDistance: typeof parsed.geotagUnlockDistance === 'number' ? parsed.geotagUnlockDistance : 20,
              requireSequentialAnswers: !!parsed.requireSequentialAnswers
            };
            const validation = validateQuizConfig(fullConfig);
            if (!validation.valid) throw new Error(validation.error);
            let importedQuiz = ensureQuizId(fullConfig);
            if (importedQuiz.logoUrl) {
              importedQuiz = { ...importedQuiz, logoUrl: await cacheLogoAsDataUrl(importedQuiz.logoUrl) };
            }
            await autoSaveQuizToIndexedDBIfNew(importedQuiz);
            setQuizConfig(importedQuiz);
            setNewQuizTitle(importedQuiz.title);
            setNewQuizPassword(importedQuiz.password || '');
            setNewGeotagDistance(importedQuiz.geotagUnlockDistance || 20);
            try {
              localStorage.setItem('family_quiz_config', JSON.stringify(importedQuiz));
              localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
              localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify([]));
            } catch (err) {
              console.error('Error saving quiz to localStorage:', err);
            }
            setShowConfigInput(false);
            setConfigJsonInput('');
            setAnswers([]);
            setWalkedPath([]);
            setSelectedQuestionIndex(null);
            setSelectedQuestionIds([]);
            setView('setup');
            const msg = `${t(lang, 'quizLoadedSuccess')} ("${importedQuiz.title}")`;
            setDbNotification(msg);
            setTimeout(() => setDbNotification(null), 5000);
            return;
          }

          // Case 2: Array of questions [{ text, options, correctAnswer }, ...]
          let questionArray: any[] | null = null;
          if (Array.isArray(parsed)) {
            questionArray = parsed;
          } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
            questionArray = parsed.questions;
          } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed[importTarget + 'Questions'])) {
             // Specific category
             questionArray = parsed[importTarget + 'Questions'];
          }

          if (questionArray) {
            const formattedQuestions: Question[] = questionArray.map((q, idx) => formatImportedQuestion(q, idx));

            applyQuestionsToConfig(formattedQuestions);
            return;
          }
        } catch (jsonErr: any) {
          console.warn('JSON handling failed', jsonErr);
          if (looksLikeJson) {
            throw new Error(jsonErr?.message || 'Felaktig JSON-struktur i quizet.');
          }
        }
      } else if (looksLikeJson) {
        throw new Error('Kunde inte tolka JSON-strukturen. Kontrollera att filen är giltig JSON.');
      }
      
      // Otherwise, parse as plain text
      let newQuestions = parseQuizText(cleanInput);
      if (newQuestions.length === 0) {
        const base64DecodedText = tryBase64Decode(rawInput);
        if (base64DecodedText) {
          newQuestions = parseQuizText(base64DecodedText);
        }
      }
      
      if (newQuestions.length > 0) {
        applyQuestionsToConfig(newQuestions);
      } else {
        alert(t(lang, 'invalidFormatAlert'));
      }
    } catch (err) {
      console.error('Import error:', err);
      alert(err instanceof Error && err.message ? err.message : t(lang, 'invalidFormatAlert'));
    }
  };

  const resetQuiz = () => {
    setShowResetConfirm(true);
  };

  const confirmResetQuiz = () => {
    setAnswers([]);
    setWalkedPath([]);
    localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
    
    const newWalkId = crypto.randomUUID();
    setWalkId(newWalkId);
    localStorage.setItem(STORAGE_KEY_WALK_ID, newWalkId);

    setSelectedQuestionIndex(null);
    setView('setup');
    setPasswordInput('');
    setFacitPasswordInput('');
    setIsFacitUnlocked(false);
    setShowResetConfirm(false);
  };

  const [lastTaggedLocation, setLastTaggedLocation] = useState<Location | null>(null);

  const updateQuestion = (category: UserType, id: string, updates: Partial<Question>) => {
    setQuizConfig(prev => {
      const existingInBarn = prev.barnQuestions.find(q => q.id === id);
      const existingInVuxen = prev.vuxenQuestions.find(q => q.id === id);
      const currentOrigLang = (existingInBarn || existingInVuxen)?.originalLanguage || 'sv';

      const newOrigLang = (updates.text !== undefined || updates.options !== undefined) 
        ? (updates.originalLanguage || lang) 
        : currentOrigLang;

      const updateList = (qList: Question[]) => 
        qList.map(q => q.id === id ? { ...q, ...updates, originalLanguage: newOrigLang } : q);

      return {
        ...prev,
        barnQuestions: updateList(prev.barnQuestions),
        vuxenQuestions: updateList(prev.vuxenQuestions)
      };
    });
  };

  const openQuestionEditor = (qId: string) => {
    const foundQ = quizConfig.barnQuestions.find(item => item.id === qId) || quizConfig.vuxenQuestions.find(item => item.id === qId);
    setEditingQuestionLang(foundQ?.originalLanguage || lang);
    setFullScreenEditingQuestionId(qId);
  };

  const toggleQuestionTargetGroup = (questionId: string, group: UserType, enabled: boolean) => {
    setQuizConfig(prev => {
      const inBarn = prev.barnQuestions.some(q => q.id === questionId);
      const inVuxen = prev.vuxenQuestions.some(q => q.id === questionId);

      // Don't uncheck if it's the only group selected
      if (!enabled) {
        if (group === 'barn' && !inVuxen) return prev;
        if (group === 'vuxen' && !inBarn) return prev;
      }

      const questionObj = prev.barnQuestions.find(q => q.id === questionId) || prev.vuxenQuestions.find(q => q.id === questionId);
      if (!questionObj) return prev;

      let newBarn = [...prev.barnQuestions];
      let newVuxen = [...prev.vuxenQuestions];

      if (group === 'barn') {
        if (enabled && !inBarn) {
          newBarn.push({ ...questionObj });
        } else if (!enabled && inBarn) {
          newBarn = newBarn.filter(q => q.id !== questionId);
        }
      } else if (group === 'vuxen') {
        if (enabled && !inVuxen) {
          newVuxen.push({ ...questionObj });
        } else if (!enabled && inVuxen) {
          newVuxen = newVuxen.filter(q => q.id !== questionId);
        }
      }

      return {
        ...prev,
        barnQuestions: newBarn,
        vuxenQuestions: newVuxen
      };
    });
  };

  const handleGeotagQuestion = (category: UserType, questionId: string, loc: Location) => {
    updateQuestion(category, questionId, { location: loc });
    setLastTaggedLocation(loc);

    const questions = category === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const currentIndex = questions.findIndex(q => q.id === questionId);

    // Look for next untagged question starting after currentIndex
    let nextUntagged = questions.slice(currentIndex + 1).find(q => !q.location);
    if (!nextUntagged) {
      // Search from start if none found after
      nextUntagged = questions.slice(0, currentIndex).find(q => !q.location && q.id !== questionId);
    }

    if (nextUntagged) {
      setExpandedQuestionId(nextUntagged.id);
    }
  };

  const handleApplyRouteGeoTags = (category: UserType | 'both', locations: Location[]) => {
    setQuizConfig((prev) => {
      const newConfig = { ...prev };
      
      if (category === 'barn' || category === 'both') {
        newConfig.barnQuestions = newConfig.barnQuestions.map((q, idx) => {
          if (idx < locations.length) {
            return { ...q, location: locations[idx] };
          }
          return q;
        });
      }
      
      if (category === 'vuxen' || category === 'both') {
        newConfig.vuxenQuestions = newConfig.vuxenQuestions.map((q, idx) => {
          if (idx < locations.length) {
            return { ...q, location: locations[idx] };
          }
          return q;
        });
      }
      
      return newConfig;
    });
  };

  const getQuestionGroups = (category: UserType) => {
    const questions = category === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const followUpTargetIds = new Set(
      questions
        .map(q => q.followUpQuestionId)
        .filter((id): id is string => !!id)
    );

    const mainQuestions = questions.filter(q => !followUpTargetIds.has(q.id));
    
    return mainQuestions.map(root => {
      const followUps: Question[] = [];
      const visited = new Set<string>([root.id]);
      let currId = root.followUpQuestionId;
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

  const [questionToDelete, setQuestionToDelete] = useState<{ category: UserType; id: string } | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<Participant | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCreateNewQuizConfirm, setShowCreateNewQuizConfirm] = useState(false);
  const [dbConfirmation, setDbConfirmation] = useState<{ action: 'overwrite' | 'delete' | 'clear'; recordId?: string } | null>(null);
  const quizTitleInputRef = useRef<HTMLInputElement>(null);

  const confirmCreateNewQuiz = (customTitle?: string, customPassword?: string) => {
    const newQuizId = crypto.randomUUID();
    const newBlankQuiz: QuizConfig = {
      quizId: newQuizId,
      title: customTitle || '',
      password: customPassword || '',
      logoUrl: undefined,
      barnQuestions: [],
      vuxenQuestions: [],
      geotagUnlockDistance: 20,
      requireSequentialAnswers: false,
    };

    setQuizConfig(newBlankQuiz);
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(newBlankQuiz));

    setNewQuizTitle(customTitle || '');
    setNewQuizPassword(customPassword || '');
    setNewQuizLogoUrl('');
    setAnswers([]);
    localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify([]));
    
    // Generate a fresh walkId (Tipsrunde-ID) for the new quiz session
    const newWalkId = crypto.randomUUID();
    setWalkId(newWalkId);
    localStorage.setItem(STORAGE_KEY_WALK_ID, newWalkId);
    
    // Clear participants and related states to fully reset the old open quiz data
    setParticipants([]);
    localStorage.removeItem(STORAGE_KEY_PARTICIPANTS);
    setSelectedParticipantId(null);
    setViewingParticipantId(null);
    setLastTaggedLocation(null);

    setWalkedPath([]);
    localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
    setSelectedQuestionIndex(null);
    setSelectedQuestionIds([]);
    setEditingParticipantId(null);
    setQuestionToDelete(null);
    setParticipantToDelete(null);
    setPasswordInput('');
    setFacitPasswordInput('');
    setIsFacitUnlocked(false);
    setIsQuizModeLocked(false);
    localStorage.removeItem('family_quiz_lock_mode');
    setIsAdmin(true);

    setShowCreateNewQuizConfirm(false);
    setConfigTab('general');

    // Switch to General tab and focus the Quiz Title input field
    setTimeout(() => {
      if (quizTitleInputRef.current) {
        quizTitleInputRef.current.focus();
        quizTitleInputRef.current.select();
      }
    }, 150);
  };

  const handleClearParticipantsAndAnswers = () => {
    setParticipants([]);
    localStorage.removeItem(STORAGE_KEY_PARTICIPANTS);
    setAnswers([]);
    localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify([]));
    setSelectedParticipantId(null);
    setViewingParticipantId(null);
    setShowClearConfirm(false);
  };

  const confirmDbAction = async () => {
    const confirmation = dbConfirmation;
    setDbConfirmation(null);
    if (!confirmation) return;

    try {
      if (confirmation.action === 'overwrite' && confirmation.recordId) {
        await saveQuizToIndexedDB(quizConfig, confirmation.recordId);
        await refreshSavedQuizzes();
        setDbNotification(t(lang, 'quizSavedSuccess'));
      } else if (confirmation.action === 'delete' && confirmation.recordId) {
        await deleteQuizFromIndexedDB(confirmation.recordId);
        await refreshSavedQuizzes();
      } else if (confirmation.action === 'clear') {
        await clearAllQuizzesFromIndexedDB();
        await refreshSavedQuizzes();
        setParticipants([]);
        setAnswers([]);
        localStorage.removeItem(STORAGE_KEY_ANSWERS);
        localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
      }
      setTimeout(() => setDbNotification(null), 4000);
    } catch (err) {
      alert(t(lang, 'indexedDbActionFailed'));
    }
  };

  // Bulk question selection state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Quiz Library state & External Catalog support
  const DEFAULT_CATALOG_URL = `${import.meta.env.BASE_URL}quizzes/`;
  const STORAGE_KEY_CATALOG_URL = 'family_quiz_catalog_url';

  const normalizeCatalogUrl = (input?: any): { baseUrl: string; manifestUrl: string; isCustom: boolean } => {
    let trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed || trimmed === '[object Object]') {
      return { baseUrl: DEFAULT_CATALOG_URL, manifestUrl: `${DEFAULT_CATALOG_URL}manifest.json`, isCustom: false };
    }
    // Strip query string and hash from the catalog URL itself if present
    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const u = new URL(trimmed);
        trimmed = `${u.origin}${u.pathname}`;
      } else {
        trimmed = trimmed.split('?')[0].split('#')[0];
      }
    } catch {
      trimmed = trimmed.split('?')[0].split('#')[0];
    }
    trimmed = trimmed.trim();

    if (!trimmed || trimmed === DEFAULT_CATALOG_URL || trimmed === '/quizzes/' || trimmed === 'quizzes/' || trimmed === './quizzes/' || trimmed === 'quizzes' || trimmed === '/quizzes') {
      return { baseUrl: DEFAULT_CATALOG_URL, manifestUrl: `${DEFAULT_CATALOG_URL}manifest.json`, isCustom: false };
    }
    // If user provided link to index.html or index.htm
    if (trimmed.endsWith('index.html')) {
      trimmed = trimmed.slice(0, trimmed.length - 'index.html'.length);
    } else if (trimmed.endsWith('index.htm')) {
      trimmed = trimmed.slice(0, trimmed.length - 'index.htm'.length);
    }

    if (trimmed.endsWith('manifest.json')) {
      const baseUrl = trimmed.slice(0, trimmed.length - 'manifest.json'.length);
      return { baseUrl, manifestUrl: trimmed, isCustom: true };
    }
    if (!trimmed.endsWith('/')) {
      trimmed += '/';
    }
    return { baseUrl: trimmed, manifestUrl: `${trimmed}manifest.json`, isCustom: true };
  };

  const [catalogUrl, setCatalogUrl] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CATALOG_URL);
    if (!saved || saved === '[object Object]' || saved === 'undefined' || saved === 'null') {
      localStorage.removeItem(STORAGE_KEY_CATALOG_URL);
      return DEFAULT_CATALOG_URL;
    }
    return saved;
  });
  const [customCatalogInput, setCustomCatalogInput] = useState<string>('');
  const [showCatalogConfig, setShowCatalogConfig] = useState<boolean>(false);
  const [quizLibrary, setQuizLibrary] = useState<any[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const BUILTIN_DEFAULT_QUIZZES: QuizMetadata[] = [
    {
      id: 'intro-sv',
      title: 'Introduktionstips (Svenska)',
      description: 'Klassisk tipspromenad med 3 barnfrågor och 3 vuxenfrågor.',
      filename: 'intro_sv.json',
      barnCount: 3,
      vuxenCount: 3,
      language: 'sv',
      catalogBaseUrl: `${import.meta.env.BASE_URL}quizzes/`,
      resolvedUrl: `${import.meta.env.BASE_URL}quizzes/intro_sv.json`
    },
    {
      id: 'intro-en',
      title: 'Introductory Quiz (English)',
      description: 'Standard quiz trail with 3 kids questions and 3 adult questions.',
      filename: 'intro_en.json',
      barnCount: 3,
      vuxenCount: 3,
      language: 'en',
      catalogBaseUrl: `${import.meta.env.BASE_URL}quizzes/`,
      resolvedUrl: `${import.meta.env.BASE_URL}quizzes/intro_en.json`
    }
  ];

  const CATALOG_REQUEST_TIMEOUT_MS = 10000;

  const fetchWithTimeout = async (url: string, timeoutMs = CATALOG_REQUEST_TIMEOUT_MS): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  // Helper to fetch JSON/Text with backend proxy and CORS fallbacks for external domains
  const fetchWithCorsFallback = async (targetUrl: string, asJson = true): Promise<any> => {
    const parseResponseText = (text: string) => {
      if (!asJson) return text;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };

    const tryFetchText = async (requestUrl: string): Promise<string> => {
      const res = await fetchWithTimeout(requestUrl, CATALOG_REQUEST_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return await res.text();
    };

    // If targetUrl is local or on same origin, fetch directly without proxying
    const isSameOriginOrRelative = !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') 
      || (typeof window !== 'undefined' && targetUrl.startsWith(window.location.origin));

    if (isSameOriginOrRelative) {
      const relativeOrAbsolute = (typeof window !== 'undefined' && targetUrl.startsWith(window.location.origin))
        ? targetUrl.slice(window.location.origin.length)
        : targetUrl;
      const text = await tryFetchText(relativeOrAbsolute);
      return parseResponseText(text);
    }

    // Attempt 1: Server-side proxy (/api/proxy)
    try {
      const serverProxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
      const text = await tryFetchText(serverProxyUrl);
      return parseResponseText(text);
    } catch (e) {
      console.warn('Backend /api/proxy failed or not available, trying direct fetch:', e);
    }

    // Attempt 2: Direct browser fetch
    try {
      const text = await tryFetchText(targetUrl);
      return parseResponseText(text);
    } catch (e) {
      console.warn('Direct fetch failed, trying CORS proxies for:', targetUrl, e);
    }

    // Attempt 3: codetabs proxy
    try {
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;
      const text = await tryFetchText(proxyUrl);
      return parseResponseText(text);
    } catch (e) {
      console.warn('CodeTabs proxy failed:', e);
    }

    // Attempt 4: corsproxy.io proxy
    try {
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
      const text = await tryFetchText(proxyUrl);
      return parseResponseText(text);
    } catch (e) {
      console.warn('Corsproxy failed:', e);
    }

    throw new Error('Kunde inte hämta katalogen inom tidsgränsen (kontrollera URL, CORS och nätverk)');
  };

  const fetchQuizLibrary = async (targetCatalogUrl?: any) => {
    try {
      setIsLibraryLoading(true);
      setLibraryError(null);
      const validTargetUrl = (typeof targetCatalogUrl === 'string' && targetCatalogUrl.trim() !== '' && targetCatalogUrl !== '[object Object]')
        ? targetCatalogUrl.trim()
        : undefined;
      const urlToUse = validTargetUrl !== undefined ? validTargetUrl : catalogUrl;
      const { baseUrl, manifestUrl, isCustom } = normalizeCatalogUrl(urlToUse);
      
      const separator = manifestUrl.includes('?') ? '&' : '?';
      const fullManifestUrl = `${manifestUrl}${separator}_t=${Date.now()}`;
      
      let rawData: any;
      if (!isCustom) {
        const res = await fetchWithTimeout(fullManifestUrl, CATALOG_REQUEST_TIMEOUT_MS);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        rawData = await res.json();
      } else {
        try {
          rawData = await fetchWithCorsFallback(fullManifestUrl, true);
        } catch (manifestErr) {
          // If manifest.json failed, try fetching index.html or baseUrl directly
          console.warn('manifest.json failed, trying index.html or baseUrl:', manifestErr);
          const indexUrl = `${baseUrl}index.html?_t=${Date.now()}`;
          rawData = await fetchWithCorsFallback(indexUrl, true);
        }
      }
      
      let rawList: any[] = [];
      if (Array.isArray(rawData)) {
        rawList = rawData;
      } else if (rawData && typeof rawData === 'object' && Array.isArray(rawData.quizzes)) {
        rawList = rawData.quizzes;
      } else if (typeof rawData === 'string') {
        // 1. Try to extract embedded <script type="application/json" ...>...</script>
        const scriptMatch = rawData.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (scriptMatch && scriptMatch[1]) {
          try {
            const parsedScriptJson = JSON.parse(scriptMatch[1].trim());
            if (Array.isArray(parsedScriptJson)) {
              rawList = parsedScriptJson;
            } else if (parsedScriptJson && Array.isArray(parsedScriptJson.quizzes)) {
              rawList = parsedScriptJson.quizzes;
            }
          } catch (e) {
            console.warn('Failed to parse embedded json script in index.html:', e);
          }
        }

        // 2. If no embedded JSON script list found, parse HTML for .json links or filenames
        if (rawList.length === 0) {
          const jsonMatches = rawData.match(/[\w\-_./]+\.json/g) || [];
          const uniqueMatches = Array.from(new Set(jsonMatches)).filter(f => !f.endsWith('manifest.json'));
          rawList = uniqueMatches.map(filename => ({
            id: filename.replace('.json', ''),
            title: filename.replace('.json', '').replace(/[_-]/g, ' '),
            filename
          }));
        }
      }

      // If list is strings or objects, map and resolve
      const resolvedList = await Promise.all(rawList.map(async (item: any) => {
        const itemFilename = typeof item === 'string' ? item : (item.filename || item.file || item.url || '');
        const isAbsolute = itemFilename.startsWith('http://') || itemFilename.startsWith('https://') || itemFilename.startsWith('/');
        const resolvedUrl = isAbsolute ? itemFilename : `${baseUrl}${itemFilename}`;
        
        let title = (typeof item === 'object' && item.title) ? item.title : '';
        let description = (typeof item === 'object' && item.description) ? item.description : '';
        let barnCount = (typeof item === 'object' && typeof item.barnCount === 'number') ? item.barnCount : undefined;
        let vuxenCount = (typeof item === 'object' && typeof item.vuxenCount === 'number') ? item.vuxenCount : undefined;
        let language = (typeof item === 'object' && item.language) ? item.language : undefined;
        let timeLimit = (typeof item === 'object' && item.timeLimit) ? item.timeLimit : undefined;

        // Always inspect the quiz JSON file to extract exact question counts, language & timelimit
        try {
          const quizContent = !isCustom && !resolvedUrl.startsWith('http')
            ? await (await fetchWithTimeout(resolvedUrl, CATALOG_REQUEST_TIMEOUT_MS)).json()
            : await fetchWithCorsFallback(resolvedUrl, true);

          if (quizContent && typeof quizContent === 'object') {
            title = quizContent.title || title || itemFilename;
            description = quizContent.description || description || '';
            barnCount = Array.isArray(quizContent.barnQuestions) ? quizContent.barnQuestions.length : (barnCount ?? 0);
            vuxenCount = Array.isArray(quizContent.vuxenQuestions) ? quizContent.vuxenQuestions.length : (vuxenCount ?? 0);
            language = quizContent.language || language || (itemFilename.includes('_en') || itemFilename.includes('-en') ? 'en' : (itemFilename.includes('_sv') || itemFilename.includes('-sv') ? 'sv' : undefined));
            timeLimit = quizContent.timeLimit || timeLimit;
          }
        } catch (e) {
          console.warn(`Could not inspect quiz content for ${itemFilename}:`, e);
        }

        // Fallback for title if still missing
        if (!title) {
          title = itemFilename.replace(/\.json$/i, '').replace(/[_-]/g, ' ');
        }

        return {
          id: (typeof item === 'object' && item.id) ? item.id : itemFilename,
          title,
          description: description || '',
          filename: itemFilename,
          catalogBaseUrl: baseUrl,
          resolvedUrl,
          barnCount: barnCount ?? 0,
          vuxenCount: vuxenCount ?? 0,
          language,
          timeLimit
        };
      }));
      
      setQuizLibrary(resolvedList);
      if (validTargetUrl !== undefined) {
        setCatalogUrl(validTargetUrl);
        if (validTargetUrl === DEFAULT_CATALOG_URL || !isCustom) {
          localStorage.removeItem(STORAGE_KEY_CATALOG_URL);
        } else {
          localStorage.setItem(STORAGE_KEY_CATALOG_URL, validTargetUrl);
        }
      }
    } catch (err: any) {
      console.error('Failed to load quiz library from:', err);
      const { isCustom } = normalizeCatalogUrl(targetCatalogUrl || catalogUrl);
      if (!isCustom) {
        setQuizLibrary(BUILTIN_DEFAULT_QUIZZES);
        setLibraryError(null);
      } else {
        const errorMsg = err.message || 'Kunde inte läsa in katalogen';
        setLibraryError(errorMsg);
      }
    } finally {
      setIsLibraryLoading(false);
    }
  };

  const loadLibraryQuiz = async (filenameOrItem: string | any, bypassConfirm = false, customCatalogBaseUrl?: string) => {
    if (!bypassConfirm && (participants.length > 0 || answers.length > 0)) {
      setShowLoadConfirm({ type: 'library', payload: filenameOrItem, catalogBaseUrl: customCatalogBaseUrl });
      return;
    }

    try {
      setIsLibraryLoading(true);
      setLibraryError(null);

      let url = '';
      let presetTitle = '';
      let presetDesc = '';
      let presetLang: Language | undefined = undefined;

      if (typeof filenameOrItem === 'object' && filenameOrItem !== null) {
        url = filenameOrItem.resolvedUrl || filenameOrItem.filename || '';
        presetTitle = filenameOrItem.title || '';
        presetDesc = filenameOrItem.description || '';
        presetLang = filenameOrItem.language;
      } else {
        const str = String(filenameOrItem || '').trim();
        if (str.startsWith('http://') || str.startsWith('https://')) {
          url = str;
        } else if (str.startsWith('/') && !customCatalogBaseUrl) {
          url = str;
        } else {
          const effectiveCatalog = customCatalogBaseUrl || catalogUrl;
          const { baseUrl } = normalizeCatalogUrl(effectiveCatalog);
          let cleanFilename = str.replace(/^(\.\/|\/)/, '');
          if (!cleanFilename.includes('.')) {
            cleanFilename = `${cleanFilename}.json`;
          }
          url = `${baseUrl}${cleanFilename}`;
        }
      }

      // If url is relative or same-origin, fetch directly
      const isLocalOrSameOrigin = !url.startsWith('http://') && !url.startsWith('https://') 
        || (typeof window !== 'undefined' && url.startsWith(window.location.origin));

      let content = '';
      if (isLocalOrSameOrigin) {
        const relativeUrl = (typeof window !== 'undefined' && url.startsWith(window.location.origin))
          ? url.slice(window.location.origin.length)
          : url;
        const res = await fetchWithTimeout(relativeUrl, CATALOG_REQUEST_TIMEOUT_MS);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        content = await res.text();
      } else {
        content = await fetchWithCorsFallback(url, false);
      }

      if (!content || !content.trim()) {
        throw new Error(lang === 'sv' ? 'Filen var tom eller kunde inte läsas in.' : 'The file was empty or could not be read.');
      }

      // Parse JSON
      const parsed = robustParseQuizJson(content);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(lang === 'sv' ? 'Kunde inte tolka quizfilen som giltig JSON.' : 'Could not parse quiz file as valid JSON.');
      }

      const barnQs = Array.isArray(parsed.barnQuestions)
        ? parsed.barnQuestions.map((q: any, idx: number) => formatImportedQuestion(q, idx))
        : [];
      const vuxenQs = Array.isArray(parsed.vuxenQuestions)
        ? parsed.vuxenQuestions.map((q: any, idx: number) => formatImportedQuestion(q, idx))
        : [];

      const fullConfig: QuizConfig = {
        quizId: parsed.quizId || crypto.randomUUID(),
        title: parsed.title || presetTitle || 'Quiz',
        password: parsed.password || '',
        logoUrl: parsed.logoUrl,
        barnQuestions: barnQs,
        vuxenQuestions: vuxenQs,
        geotagUnlockDistance: typeof parsed.geotagUnlockDistance === 'number' ? parsed.geotagUnlockDistance : 20,
        requireSequentialAnswers: !!parsed.requireSequentialAnswers
      };

      const validation = validateQuizConfig(fullConfig);
      if (!validation.valid) {
        throw new Error(validation.error || (lang === 'sv' ? 'Ogiltigt quizformat' : 'Invalid quiz format'));
      }

      let importedQuiz = ensureQuizId(fullConfig);
      if (importedQuiz.logoUrl) {
        importedQuiz = { ...importedQuiz, logoUrl: await cacheLogoAsDataUrl(importedQuiz.logoUrl) };
      }
      await autoSaveQuizToIndexedDBIfNew(importedQuiz);

      setQuizConfig(importedQuiz);
      setNewQuizTitle(importedQuiz.title);
      setNewQuizPassword(importedQuiz.password || '');
      setNewGeotagDistance(importedQuiz.geotagUnlockDistance || 20);
      setAnswers([]);
      setParticipants([]);
      setWalkedPath([]);
      setSelectedQuestionIndex(null);
      setSelectedQuestionIds([]);

      try {
        const newWalkId = crypto.randomUUID();
        setWalkId(newWalkId);
        localStorage.setItem('family_quiz_config', JSON.stringify(importedQuiz));
        localStorage.setItem(STORAGE_KEY_WALK_ID, newWalkId);
        localStorage.removeItem(STORAGE_KEY_WALKED_PATH);
        localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify([]));
      } catch (err) {
        console.error('Error saving quiz to localStorage:', err);
      }

      const successMsg = `${t(lang, 'quizLoadedSuccess')} ("${importedQuiz.title}")`;
      setDbNotification(successMsg);
      setTimeout(() => setDbNotification(null), 5000);
      setLibraryError(null);
      setShowConfigInput(false);
      setView('setup');
    } catch (err: any) {
      console.error('Error loading library quiz:', err);
      const errMsg = t(lang, 'libraryError') + (err?.message ? ` (${err.message})` : '');
      setLibraryError(errMsg);
      setDbNotification(errMsg);
      setTimeout(() => setDbNotification(null), 8000);
    } finally {
      setIsLibraryLoading(false);
    }
  };

  const handleShareCatalogLink = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('quiz');
      url.searchParams.delete('z');
      url.searchParams.delete('q');
      url.searchParams.delete('quizFile');
      url.searchParams.delete('loadQuiz');
      url.searchParams.set('catalog', catalogUrl);
      url.hash = '';
      navigator.clipboard.writeText(url.toString());
      setDbNotification(t(lang, 'catalogLinkCopiedNotice'));
      setTimeout(() => setDbNotification(null), 5000);
    } catch (e) {
      console.error('Could not copy catalog link', e);
    }
  };

  const handleResetCatalog = async () => {
    setCatalogUrl(DEFAULT_CATALOG_URL);
    localStorage.removeItem(STORAGE_KEY_CATALOG_URL);
    setCustomCatalogInput('');
    setShowCatalogConfig(false);
    await fetchQuizLibrary(DEFAULT_CATALOG_URL);
  };

  useEffect(() => {
    // Check URL query parameters or URL hash for catalog or compressed quiz: ?quiz=..., #quiz=..., ?z=..., #z=..., #q=...
    const checkAndLoadUrlQuiz = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const rawHash = window.location.hash || '';
        const hashStr = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
        const hashParams = new URLSearchParams(hashStr);

        // Check for catalog parameter in URL: ?catalog=..., ?katalog=..., ?cat=..., #catalog=...
        const urlCatalog = 
          searchParams.get('catalog') || 
          searchParams.get('catalogUrl') || 
          searchParams.get('katalog') ||
          searchParams.get('katalogUrl') ||
          searchParams.get('cat') ||
          searchParams.get('c') ||
          hashParams.get('catalog') || 
          hashParams.get('catalogUrl') || 
          hashParams.get('katalog') || 
          hashParams.get('cat');

        let effectiveCatalog = catalogUrl;
        if (urlCatalog) {
          const decodedCatalog = decodeURIComponent(urlCatalog).trim();
          if (decodedCatalog) {
            effectiveCatalog = decodedCatalog;
            setCatalogUrl(decodedCatalog);
            localStorage.setItem(STORAGE_KEY_CATALOG_URL, decodedCatalog);
            await fetchQuizLibrary(decodedCatalog);
          }
        } else {
          await fetchQuizLibrary();
        }

        // Check if user requested URL Help Modal via query/hash
        if (
          searchParams.has('help') || 
          searchParams.has('hjalp') || 
          searchParams.has('urlguide') || 
          searchParams.has('urlhelp') || 
          hashParams.has('help') || 
          hashParams.has('urlguide')
        ) {
          setShowUrlHelpModal(true);
        }

        const fullUrl = window.location.href;
        const answerPayload = parseParticipantAnswerPayload(fullUrl);

        if (answerPayload) {
          try {
            await handleImportParticipantAnswers(answerPayload);
            if (window.history && window.history.replaceState) {
              const cleanUrl = window.location.origin + window.location.pathname;
              window.history.replaceState(null, '', cleanUrl);
            }
            return true;
          } catch (e) {
            console.error('Failed to parse qps payload from URL:', e);
          }
        }

        const isLockedInUrl = 
          searchParams.get('lock') === '1' ||
          searchParams.get('mode') === 'quiz' ||
          searchParams.get('mode') === 'player' ||
          hashParams.get('lock') === '1' ||
          hashParams.get('mode') === 'quiz' ||
          hashParams.get('mode') === 'player' ||
          rawHash.includes('lock=1') ||
          rawHash.includes('mode=quiz');

        if (isLockedInUrl) {
          setIsQuizModeLocked(true);
          localStorage.setItem('family_quiz_lock_mode', 'true');
        }

        const urlWalkId = searchParams.get('w') || hashParams.get('w');
        if (urlWalkId) {
          setWalkId(urlWalkId);
          localStorage.setItem(STORAGE_KEY_WALK_ID, urlWalkId);
        }

        // Check for direct quiz file loading: ?quizFile=..., ?file=..., ?fil=..., ?loadQuiz=...
        const rawQuizFile = 
          searchParams.get('quizFile') || 
          searchParams.get('quizfile') || 
          searchParams.get('file') || 
          searchParams.get('fil') || 
          searchParams.get('quizfil') || 
          searchParams.get('loadQuiz') || 
          searchParams.get('filename') || 
          searchParams.get('qf') ||
          hashParams.get('quizFile') || 
          hashParams.get('quizfile') || 
          hashParams.get('file') || 
          hashParams.get('fil') || 
          hashParams.get('loadQuiz') || 
          hashParams.get('filename');

        const isFilenameLike = (val?: string | null): boolean => {
          if (!val) return false;
          const s = val.trim().toLowerCase();
          return s.endsWith('.json') || s.endsWith('.txt') || (s.length < 60 && !s.includes('/') && !s.includes('&') && s.length > 2 && !s.match(/^[A-Za-z0-9+/=]{60,}$/));
        };

        const rawQuizParam = searchParams.get('quiz') || searchParams.get('q') || hashParams.get('quiz') || hashParams.get('q');
        const targetQuizFile = rawQuizFile || (isFilenameLike(rawQuizParam) ? rawQuizParam : null);

        if (targetQuizFile) {
          await loadLibraryQuiz(targetQuizFile, true, effectiveCatalog);
          if (window.history && window.history.replaceState) {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState(null, '', cleanUrl);
          }
          return true;
        }

        let compressedCandidate = 
          (!isFilenameLike(searchParams.get('quiz')) ? searchParams.get('quiz') : null) || 
          searchParams.get('z') || 
          (!isFilenameLike(searchParams.get('q')) ? searchParams.get('q') : null) || 
          (!isFilenameLike(hashParams.get('quiz')) ? hashParams.get('quiz') : null) || 
          hashParams.get('z') || 
          (!isFilenameLike(hashParams.get('q')) ? hashParams.get('q') : null);

        if (!urlWalkId && compressedCandidate) {
          // If loading a new quiz but no session ID was supplied in the URL, create a new one
          const newWalkId = crypto.randomUUID();
          setWalkId(newWalkId);
          localStorage.setItem(STORAGE_KEY_WALK_ID, newWalkId);
        }

        // If not parsed as standard searchParam key-value, check if raw hash is z=..., q=..., quiz=... or a direct hash payload
        if (!compressedCandidate && hashStr) {
          const lowerHash = hashStr.toLowerCase();
          if (lowerHash.startsWith('z=') || lowerHash.startsWith('q=') || lowerHash.startsWith('quiz=')) {
            compressedCandidate = hashStr;
          } else if (hashStr.length > 10 && !hashStr.includes('/') && !hashStr.includes('&')) {
            compressedCandidate = hashStr;
          }
        }

        if (compressedCandidate) {
          const decompressed = decompressQuizFromUrlCode(compressedCandidate);
          if (decompressed) {
            // Spara det nya quizet i IndexedDB innan det öppnas om namnet inte redan finns
            let importedQuiz = ensureQuizId(decompressed);
            importedQuiz = { ...importedQuiz, logoUrl: await cacheLogoAsDataUrl(importedQuiz.logoUrl) };
            await autoSaveQuizToIndexedDBIfNew(importedQuiz);

            setQuizConfig(importedQuiz);
            localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(importedQuiz));
            // Clean the URL to avoid reloading on refresh while keeping clean UX
            if (window.history && window.history.replaceState) {
              const cleanUrl = window.location.origin + window.location.pathname;
              window.history.replaceState(null, '', cleanUrl);
            }
            return true;
          }
        }
      } catch (err) {
        console.error('Failed to load quiz from URL parameters/hash:', err);
      }
      return false;
    };

    checkAndLoadUrlQuiz();

    // Listen to hashchange in case user opens or pastes direct #z= link while app is already open
    const handleHashChange = () => {
      checkAndLoadUrlQuiz();
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Clear selected question IDs when switching active editing category
  useEffect(() => {
    setSelectedQuestionIds([]);
  }, [editingQuestionsCategory]);

  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAllQuestions = () => {
    if (!editingQuestionsCategory) return;
    const questions = editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    if (selectedQuestionIds.length === questions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(questions.map(q => q.id));
    }
  };

  const confirmDeleteSelectedQuestions = () => {
    if (!editingQuestionsCategory || selectedQuestionIds.length === 0) return;
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

  const deleteQuestion = (category: UserType | null, id: string) => {
    if (!category) return;
    setQuestionToDelete({ category, id });
  };

  const confirmDeleteQuestion = () => {
    if (!questionToDelete) return;
    const { category, id } = questionToDelete;
    
    setQuizConfig(prev => {
      const newConfig = { ...prev };
      if (category === 'barn') {
        newConfig.barnQuestions = newConfig.barnQuestions.filter(q => q.id !== id);
      } else {
        newConfig.vuxenQuestions = newConfig.vuxenQuestions.filter(q => q.id !== id);
      }
      return newConfig;
    });
    setQuestionToDelete(null);
  };

  const addNewQuestion = (category: UserType | 'båda', type: QuestionType = 'options') => {
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
      if (category === 'båda') {
        newConfig.barnQuestions = [...newConfig.barnQuestions, newQuestion];
        newConfig.vuxenQuestions = [...newConfig.vuxenQuestions, { ...newQuestion }];
      } else if (category === 'barn') {
        newConfig.barnQuestions = [...newConfig.barnQuestions, newQuestion];
      } else {
        newConfig.vuxenQuestions = [...newConfig.vuxenQuestions, newQuestion];
      }
      return newConfig;
    });
    setShowCreateQuestionModal(null);
    setFullScreenEditingQuestionId(newQuestion.id);
  };

  const tryBase64Decode = (str: string): string | null => {
    try {
      const cleaned = str.trim().replace(/\s+/g, '');
      if (!cleaned) return null;
      let decoded = '';
      try {
        decoded = decodeURIComponent(escape(atob(cleaned)));
      } catch {
        decoded = atob(cleaned);
      }
      return decoded;
    } catch {
      return null;
    }
  };

  const xorEncryptDecrypt = (input: string, key: string): string => {
    let safeInput = input;
    try {
      safeInput = unescape(encodeURIComponent(input));
    } catch (e) {
      safeInput = input;
    }
    let output = '';
    for (let i = 0; i < safeInput.length; i++) {
      const charCode = safeInput.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      output += String.fromCharCode(charCode);
    }
    try {
      return btoa(unescape(encodeURIComponent(output)));
    } catch (e) {
      return btoa(output);
    }
  };

  const xorDecrypt = (input: string, key: string): string => {
    try {
      const cleaned = input.trim().replace(/\s+/g, '');
      let decoded = tryBase64Decode(cleaned);
      if (decoded === null) {
        decoded = cleaned;
      }
      let output = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        output += String.fromCharCode(charCode);
      }
      try {
        return decodeURIComponent(escape(output));
      } catch (e) {
        return output;
      }
    } catch (e) {
      return input;
    }
  };

  const applyQuestionsToConfig = (formattedQuestions: Question[]) => {
    if (formattedQuestions.length === 0) return;
    setQuizConfig(prev => {
      const newConfig = { ...prev };
      if (importTarget === 'båda') {
        newConfig.barnQuestions = formattedQuestions;
        newConfig.vuxenQuestions = formattedQuestions.map(q => ({ ...q, id: crypto.randomUUID() }));
      } else if (importTarget === 'barn') {
        newConfig.barnQuestions = formattedQuestions;
        if (newConfig.vuxenQuestions.length < formattedQuestions.length) {
          newConfig.vuxenQuestions = formattedQuestions.map(q => ({ ...q, id: crypto.randomUUID() }));
        }
      } else {
        newConfig.vuxenQuestions = formattedQuestions;
        if (newConfig.barnQuestions.length < formattedQuestions.length) {
          newConfig.barnQuestions = formattedQuestions.map(q => ({ ...q, id: crypto.randomUUID() }));
        }
      }
      return newConfig;
    });

    setShowConfigInput(false);
    setConfigJsonInput('');
    setAnswers([]);
    setParticipants([]);
    
    const newWalkId = crypto.randomUUID();
    setWalkId(newWalkId);
    try {
      localStorage.setItem(STORAGE_KEY_WALK_ID, newWalkId);
    } catch {}

    setView('setup');
    const targetText = importTarget === 'båda' ? 'båda kategorier' : importTarget === 'barn' ? 'Barn' : 'Vuxna';
    alert(t(lang, 'importedQuestionsAlert', { count: formattedQuestions.length.toString() }));
  };

  const handleImportConfig = () => {
    let rawInput = configJsonInput.trim();
    if (!rawInput) return;
    processImportConfig(rawInput);
  };

  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState<number | string>(5);
  const [aiTarget, setAiTarget] = useState<'barn' | 'vuxen' | 'båda'>('båda');
  const [aiKidAgeFrom, setAiKidAgeFrom] = useState<number | string>(5);
  const [aiKidAgeTo, setAiKidAgeTo] = useState<number | string>(10);
  const [aiGeotagLandmarks, setAiGeotagLandmarks] = useState(false);
  const [aiIncludeImages, setAiIncludeImages] = useState<boolean>(() => getStoredAiUseImages());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [batchTranslateProgress, setBatchTranslateProgress] = useState<{ current: number; total: number; langCode: string } | null>(null);

  const [searchPlaceQuery, setSearchPlaceQuery] = useState<{ [qId: string]: string }>({});
  const [isSearchingPlace, setIsSearchingPlace] = useState<{ [qId: string]: boolean }>({});
  const [isAiGeotaggingSingle, setIsAiGeotaggingSingle] = useState<{ [qId: string]: boolean }>({});
  const isAiGeotagging = useMemo(() => Object.values(isAiGeotaggingSingle).some(Boolean), [isAiGeotaggingSingle]);

  const handleSearchAndGeotagPlace = async (category: UserType, questionId: string, queryText: string) => {
    const query = queryText.trim();
    if (!query) {
      alert(t(lang, 'searchPlaceInputPlaceholder'));
      return;
    }
    setIsSearchingPlace(prev => ({ ...prev, [questionId]: true }));
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
        headers: {
          'Accept': 'application/json',
        }
      });
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const item = data[0];
        const loc: Location = {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          name: item.name || (item.display_name ? item.display_name.split(',')[0] : query)
        };
        handleGeotagQuestion(category, questionId, loc);
        alert(t(lang, 'locationFoundSuccess', { name: loc.name || query }));
      } else {
        alert(t(lang, 'noLocationFoundAlert'));
      }
    } catch (err) {
      console.error('Failed to geocode place with Nominatim:', err);
      alert(t(lang, 'noLocationFoundAlert'));
    } finally {
      setIsSearchingPlace(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const handleAiGeotagSingleQuestion = async (category: UserType, questionId: string, questionText: string) => {
    const currentApiKey = getStoredApiKey();
    if (!currentApiKey) {
      setUserApiKeyInput('');
      setShowSettingsModal(true);
      alert(t(lang, 'missingApiKeyAlert'));
      return;
    }
    setIsAiGeotaggingSingle(prev => ({ ...prev, [questionId]: true }));
    try {
      const result = await findLocationCoordinatesWithGemini(questionText, currentApiKey);
      if (result) {
        const loc: Location = {
          lat: result.lat,
          lng: result.lng,
          name: result.name
        };
        handleGeotagQuestion(category, questionId, loc);
        alert(t(lang, 'locationFoundSuccess', { name: result.name }));
      } else {
        alert(t(lang, 'noLocationFoundAlert'));
      }
    } catch (err: any) {
      if (err.message === 'MISSING_API_KEY') {
        setShowSettingsModal(true);
        alert(t(lang, 'missingApiKeyAlert'));
      } else {
        alert(t(lang, 'generationError') + err.message);
      }
    } finally {
      setIsAiGeotaggingSingle(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const generateWithAi = async () => {
    if (!aiTopic) return alert(t(lang, 'enterTopicAlert'));

    const currentApiKey = getStoredApiKey();
    if (!currentApiKey) {
      setUserApiKeyInput('');
      setShowSettingsModal(true);
      alert(t(lang, 'missingApiKeyAlert'));
      return;
    }

    setIsGenerating(true);
    try {
      const selectedLangs = promptLanguages.length > 0 ? promptLanguages : [lang];
      const data = await generateQuizClient({
        topics: aiTopic,
        count: Number(aiCount) || 5,
        target: aiTarget,
        lang: selectedLangs[0] || lang,
        ageFrom: Number(aiKidAgeFrom) || 5,
        ageTo: Number(aiKidAgeTo) || 10,
        apiKey: currentApiKey,
        geotagLandmarks: aiGeotagLandmarks,
        includeImages: aiIncludeImages,
        targetLanguages: selectedLangs,
      });

      // Register all newly generated translations into the local cache
      const allNew = [
        ...(data.barnQuestions || []),
        ...(data.vuxenQuestions || [])
      ];
      allNew.forEach((q: any) => {
        const origLang = q.originalLanguage || selectedLangs[0] || 'sv';
        if (q.translations) {
          Object.entries(q.translations).forEach(([tLang, trans]: [string, any]) => {
            registerQuestionTranslation(q.id, origLang, q.text, tLang, trans);
          });
        }
      });

      setQuizConfig(prev => ({
        ...prev,
        barnQuestions: data.barnQuestions ? [...prev.barnQuestions, ...data.barnQuestions] : prev.barnQuestions,
        vuxenQuestions: data.vuxenQuestions ? [...prev.vuxenQuestions, ...data.vuxenQuestions] : prev.vuxenQuestions,
      }));

      const totalGenerated = (data.barnQuestions?.length || 0) + (data.vuxenQuestions?.length || 0);
      const barnTagged = (data.barnQuestions || []).filter(q => q.location && typeof q.location.lat === 'number').length;
      const vuxenTagged = (data.vuxenQuestions || []).filter(q => q.location && typeof q.location.lat === 'number').length;
      const totalTagged = barnTagged + vuxenTagged;

      let msg = t(lang, 'aiDoneAlert', { count: totalGenerated.toString() });
      if (selectedLangs.length > 1) {
        msg += ` (🌐 ${selectedLangs.length} språk översatta direkt!)`;
      }
      if (totalTagged > 0) {
        msg += ` (${totalTagged} ${t(lang, 'geotaggedLabel').toLowerCase()} 📍)`;
      }
      alert(msg);
      setAiTopic('');
    } catch (err: any) {
      if (err.message === 'MISSING_API_KEY') {
        setShowSettingsModal(true);
        alert(t(lang, 'missingApiKeyAlert'));
      } else {
        alert(t(lang, 'generationError') + err.message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchTranslateQuiz = async () => {
    const currentApiKey = getStoredApiKey();
    if (!currentApiKey) {
      setUserApiKeyInput('');
      setShowSettingsModal(true);
      alert(t(lang, 'missingApiKeyAlert'));
      return;
    }

    const totalQuestions = quizConfig.barnQuestions.length + quizConfig.vuxenQuestions.length;
    if (totalQuestions === 0) {
      alert(t(lang, 'batchTranslateNoQuestions'));
      return;
    }

    const targetLangs = promptLanguages.length > 0 ? promptLanguages : (SUPPORTED_LANGUAGES.map(l => l.code) as Language[]);
    setIsBatchTranslating(true);
    setBatchTranslateProgress({ current: 0, total: targetLangs.length, langCode: targetLangs[0] || 'en' });

    try {
      // Translate barn questions
      const updatedBarn = await batchTranslateQuizQuestions({
        questions: quizConfig.barnQuestions,
        targetLanguages: targetLangs,
        apiKey: currentApiKey,
        onProgress: (current, total, langCode) => {
          setBatchTranslateProgress({ current, total, langCode });
        }
      });

      // Translate vuxen questions
      const updatedVuxen = await batchTranslateQuizQuestions({
        questions: quizConfig.vuxenQuestions,
        targetLanguages: targetLangs,
        apiKey: currentApiKey,
        onProgress: (current, total, langCode) => {
          setBatchTranslateProgress({ current, total, langCode });
        }
      });

      // Register all into local translation cache
      [...updatedBarn, ...updatedVuxen].forEach((q: any) => {
        const origLang = q.originalLanguage || 'sv';
        if (q.translations) {
          Object.entries(q.translations).forEach(([tLang, trans]: [string, any]) => {
            registerQuestionTranslation(q.id, origLang, q.text, tLang, trans);
          });
        }
      });

      setQuizConfig(prev => ({
        ...prev,
        barnQuestions: updatedBarn,
        vuxenQuestions: updatedVuxen,
      }));

      alert(t(lang, 'batchTranslateSuccess', {
        count: totalQuestions.toString(),
        langs: targetLangs.length.toString()
      }));
    } catch (err: any) {
      alert(t(lang, 'generationError') + (err.message || String(err)));
    } finally {
      setIsBatchTranslating(false);
      setBatchTranslateProgress(null);
    }
  };

  const shareConfig = () => {
    try {
      const configStr = JSON.stringify(quizConfig);
      const encrypted = xorEncryptDecrypt(configStr, '$');
      if (!navigator.clipboard?.writeText) throw new Error('Urklipp är inte tillgängligt.');
      navigator.clipboard.writeText(encrypted).then(() => {
        setCopiedConfigCode(true);
        setTimeout(() => setCopiedConfigCode(false), 6000);
      }).catch((error) => {
        console.error('Could not copy quiz export:', error);
        alert('Kunde inte kopiera quiz-exporten till urklipp.');
      });
    } catch (error) {
      console.error('Could not create quiz export:', error);
      alert('Kunde inte skapa quiz-exporten.');
    }
  };

  const buildParticipantAnswerPayload = (participantsToUse: Participant[] = participants) => {
    const payload: ParticipantAnswerPayload = {
      schema: 'family-quiz-participant-answers-v1',
      quizId: quizConfig.quizId,
      walkId: walkId,
      title: quizConfig.title,
      createdAt: new Date().toISOString(),
      participants: participantsToUse.map(({ id, uniqueId, name, type }) => ({
        id,
        uniqueId: uniqueId || crypto.randomUUID(),
        name: (name || '').trim(),
        type
      })),
      answers: answers.map(a => ({ ...a }))
    };

    return encodeParticipantAnswers(payload);
  };

  const shareParticipantAnswers = async () => {
    if (participants.length === 0) {
      alert(t(lang, 'noParticipantsToShare') || 'Inga deltagare registrerade.');
      return;
    }

    let currentParticipants = [...participants];
    let hasUpdatedParticipants = false;

    // Block submission if any participant still has a default or reserved name ("Jag", "Me", etc.)
    for (let i = 0; i < currentParticipants.length; i++) {
      const p = currentParticipants[i];
      const trimmed = (p.name || '').trim();
      const isReserved = !trimmed || isReservedParticipantName(trimmed);

      if (isReserved) {
        const placeholderName = trimmed || t(lang, 'defaultParticipantName') || 'Jag';
        const promptMsg = `${t(lang, 'reservedParticipantNameShareError', { name: placeholderName }) || `Byt namn på "${placeholderName}" till ditt/deltagarens riktiga namn innan du skickar in svaren.`}\n\n${lang === 'sv' ? 'Ange ditt/deltagarens riktiga namn:' : 'Enter real participant name:'}`;

        const enteredName = window.prompt(promptMsg, placeholderName.toLowerCase() === 'jag' || placeholderName.toLowerCase() === 'me' ? '' : placeholderName);

        if (!enteredName || !enteredName.trim() || isReservedParticipantName(enteredName.trim())) {
          alert(
            t(lang, 'reservedParticipantNameShareError', { name: enteredName?.trim() || placeholderName }) ||
            `Du måste byta ut "${placeholderName}" till ett riktigt namn innan du kan skicka in era svar!`
          );
          return;
        }

        currentParticipants[i] = { ...p, name: enteredName.trim() };
        hasUpdatedParticipants = true;
      }
    }

    if (hasUpdatedParticipants) {
      setParticipants(currentParticipants);
      try {
        localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(currentParticipants));
      } catch {}
    }

    const payload = buildParticipantAnswerPayload(currentParticipants);
    if (!payload) return;

    const shareUrl = `${window.location.origin}${window.location.pathname}#${payload}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: quizConfig.title || 'FamilyQuiz',
          text: t(lang, 'shareParticipantAnswersText') || 'Här är våra svar till tipspromenaden!',
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      window.prompt(t(lang, 'copyGroupAnswersManualPrompt') || 'Kopiera länken med era svar och skicka till den som leder quizet:', shareUrl);
    } catch (e) {
      window.prompt(t(lang, 'copyGroupAnswersManualPrompt') || 'Kopiera länken med era svar och skicka till den som leder quizet:', shareUrl);
    }
  };

  const handleImportParticipantAnswers = async (payload: ParticipantAnswerPayload) => {
    const incomingParticipants: Participant[] = Array.isArray(payload.participants) ? payload.participants : [];
    const incomingAnswers: AnswerRecord[] = Array.isArray(payload.answers) ? payload.answers : [];

    if (incomingParticipants.length === 0 && incomingAnswers.length === 0) {
      alert(t(lang, 'invalidAnswerImportFormat') || 'Inga deltagarsvar hittades i koden.');
      return;
    }

    if (payload.walkId) {
      setWalkId(payload.walkId);
      try {
        localStorage.setItem(STORAGE_KEY_WALK_ID, payload.walkId);
      } catch {}
    }

    const matchesActiveQuiz = isQuizMatch(payload, quizConfig);

    if (matchesActiveQuiz) {
      const merged = mergeParticipantAnswers(
        participants,
        answers,
        incomingParticipants,
        incomingAnswers,
        t(lang, 'defaultParticipantName') || 'Deltagare'
      );
      setParticipants(merged.participants);
      setAnswers(merged.answers);
      try {
        localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(merged.participants));
        localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(merged.answers));
      } catch {}

      if (isAdmin && quizConfig.quizId) {
        try {
          await saveQuizSessionToIndexedDB(ensureQuizId(quizConfig), merged);
          await refreshSavedQuizzes();
        } catch {}
      }

      const names = incomingParticipants.map(p => p.name).filter(Boolean).join(', ');
      alert(
        t(lang, 'readingAnswersSuccess', {
          count: incomingParticipants.length.toString(),
          names: names || 'deltagare'
        }) || t(lang, 'importSharedAnswersSuccess')
      );
      setShowAnswerImportModal(false);
      setAnswerImportInput('');
      setView('setup');
      return;
    }

    const targetQuiz = payload.quizId ? await getQuizByQuizId(payload.quizId) : null;
    if (targetQuiz) {
      const targetSession = targetQuiz.quizState || { participants: [], answers: [] };
      const merged = mergeParticipantAnswers(
        targetSession.participants,
        targetSession.answers,
        incomingParticipants,
        incomingAnswers,
        t(lang, 'defaultParticipantName') || 'Deltagare'
      );
      await saveQuizSessionToIndexedDB(ensureQuizId(targetQuiz.quizConfig), merged);
      await refreshSavedQuizzes();
      alert(t(lang, 'importSharedAnswersStoredForQuiz', { title: targetQuiz.title }));
      setShowAnswerImportModal(false);
      setAnswerImportInput('');
      return;
    }

    const proceed = window.confirm(
      t(lang, 'answerImportQuizMismatchConfirm', {
        title: payload.title || 'annat quiz',
        currentTitle: quizConfig.title || 'Tipspromenad'
      }) ||
      `Svaren är märkta för "${payload.title || 'annat quiz'}". Vill du läsa in dem till det aktiva quizet ("${quizConfig.title}") ändå?`
    );

    if (proceed) {
      const merged = mergeParticipantAnswers(
        participants,
        answers,
        incomingParticipants,
        incomingAnswers,
        t(lang, 'defaultParticipantName') || 'Deltagare'
      );
      setParticipants(merged.participants);
      setAnswers(merged.answers);
      try {
        localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(merged.participants));
        localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(merged.answers));
      } catch {}
      if (isAdmin && quizConfig.quizId) {
        try {
          await saveQuizSessionToIndexedDB(ensureQuizId(quizConfig), merged);
          await refreshSavedQuizzes();
        } catch {}
      }
      const names = incomingParticipants.map(p => p.name).filter(Boolean).join(', ');
      alert(
        t(lang, 'readingAnswersSuccess', {
          count: incomingParticipants.length.toString(),
          names: names || 'deltagare'
        }) || t(lang, 'importSharedAnswersSuccess')
      );
      setShowAnswerImportModal(false);
      setAnswerImportInput('');
      setView('setup');
    }
  };

  const handleImportAnswersFromInput = async () => {
    const rawInput = answerImportInput.trim();
    if (!rawInput) return;

    try {
      const payload = parseParticipantAnswerPayload(rawInput);
      if (payload) {
        await handleImportParticipantAnswers(payload);
        return;
      }
      alert(t(lang, 'invalidAnswerImportFormat'));
    } catch (error) {
      console.error('Failed to import answers:', error);
      alert(t(lang, 'invalidAnswerImportFormat'));
    }
  };

  const getQuizAnswerProgress = () => {
    if (participants.length === 0) {
      return { totalRequired: 0, answeredCount: 0, isAllAnswered: false };
    }

    let totalRequired = 0;
    let answeredCount = 0;

    for (const p of participants) {
      const questionsForP = p.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
      totalRequired += questionsForP.length;

      for (const [questionIndex] of questionsForP.entries()) {
        const isAnswered = answers.some(a => a.participantId === p.id && a.questionIndex === questionIndex);
        if (isAnswered) {
          answeredCount += 1;
        }
      }
    }

    const isAllAnswered = totalRequired > 0 && answeredCount >= totalRequired;
    return { totalRequired, answeredCount, isAllAnswered };
  };

  const shareDirectQuizUrl = async () => {
    try {
      const directUrl = generateQuizDirectUrl(quizConfig, { lockMode: directLinkLockMode, walkId: walkId });
      setDirectUrlLength(directUrl.length);

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: quizConfig.title || 'FamilyQuiz',
            text: `${quizConfig.title || 'FamilyQuiz'} - Tipsrunda`,
            url: directUrl,
          });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }

      if (!navigator.clipboard?.writeText) {
        window.prompt(t(lang, 'shareDirectLinkBtn') || 'Länk till quiz:', directUrl);
        return;
      }
      await navigator.clipboard.writeText(directUrl);
      setCopiedDirectUrlCode(true);
      setTimeout(() => setCopiedDirectUrlCode(false), 6000);
      window.prompt(lang === 'sv' ? 'Quizlänken har kopierats till urklipp! Du kan klistra in den här:' : 'Quiz link copied to clipboard! You can copy it here:', directUrl);
    } catch (error) {
      console.error('Could not create direct quiz URL:', error);
      alert('Kunde inte skapa quizlänken. Kontrollera quizets innehåll.');
    }
  };


  const getProgress = () => {
    if (participants.length === 0) return 0;
    const totalPossibleAnswers = participants.length * totalQuestions;
    return (answers.length / totalPossibleAnswers) * 100;
  };
  const languageMenuPortal = isLanguageMenuOpen && typeof document !== 'undefined'
    ? createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed w-56 rounded-2xl border border-white/15 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-md z-[2000]"
            style={{ top: languageMenuPosition.top, left: languageMenuPosition.left }}
            data-language-menu-root
          >
            {SUPPORTED_LANGUAGES.map((l) => {
              const isActive = lang === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    handleLanguageChange(l.code);
                    setIsLanguageMenuOpen(false);
                  }}
                  className={'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ' + (
                    isActive ? 'bg-indigo-600 font-black text-white' : 'text-slate-200 hover:bg-white/10'
                  )}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="text-lg leading-none">{l.flag}</span>
                    <span className="text-sm font-semibold truncate">{l.name}</span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">{l.code}</span>
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
    <div className="min-h-screen bg-indigo-600 text-slate-900 font-sans p-2 sm:p-3 md:p-6 flex flex-col">
      {languageMenuPortal}
      <div className="fixed inset-x-0 top-0 z-[200] bg-slate-950/85 backdrop-blur-sm border-b border-white/10 shadow-md">
        <a
          href={cachedAppUrl}
          target="_blank"
          rel="noreferrer"
          className="block max-w-5xl mx-auto px-2 py-1.5 text-center text-[8px] sm:text-[10px] font-black tracking-[0.08em] text-indigo-100 hover:text-white transition-colors truncate"
          title={cachedAppUrl}
        >
          {cachedAppUrl}
        </a>
      </div>

      <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 pt-7 sm:pt-9">
        {/* Messenger & Instagram In-App Browser Breakout Modal / Banner */}
        <InAppBreakoutModal lang={lang} />

        {/* Header Component */}
        <Header
          lang={lang}
          quizConfig={quizConfig}
          view={view}
          setView={setView}
          handleQuizIconClick={handleQuizIconClick}
          isLanguageMenuOpen={isLanguageMenuOpen}
          setIsLanguageMenuOpen={setIsLanguageMenuOpen}
          languageMenuButtonRef={languageMenuButtonRef}
          selectedLanguage={selectedLanguage}
          deferredInstallPrompt={deferredInstallPrompt}
          handleInstallPwa={handleInstallPwa}
          isQuizModeLocked={isQuizModeLocked}
          isFacitUnlocked={isFacitUnlocked}
          isAdmin={isAdmin}
          getQuizAnswerProgress={getQuizAnswerProgress}
          setShowConfigInput={setShowConfigInput}
          setConfigTab={setConfigTab}
        />

        {/* Global Notification / Alert Toast */}
        <AnimatePresence>
          {dbNotification && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className="mt-2 mb-1 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white text-xs sm:text-sm font-bold shadow-xl border border-white/20 flex items-center justify-between gap-3 z-50 backdrop-blur-md"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="truncate">{dbNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => setDbNotification(null)}
                className="text-slate-400 hover:text-white p-1 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Load Confirmation Modal */}
        <AnimatePresence>
          {showLoadConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                <h2 className="text-xl font-black text-slate-800">{t(lang, 'restartBtn')}</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {lang === 'sv' ? 'Vill du rensa gamla svar och deltagare innan du byter quiz?' : 'Do you want to clear old answers and participants before switching quiz?'}
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowLoadConfirm(null)}
                    className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-black uppercase text-slate-600 hover:bg-slate-200"
                  >
                    {t(lang, 'back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (showLoadConfirm.type === 'db') {
                        handleLoadQuizFromDB(showLoadConfirm.payload, true);
                      } else {
                        loadLibraryQuiz(showLoadConfirm.payload, true, showLoadConfirm.catalogBaseUrl);
                      }
                      setShowLoadConfirm(null);
                    }}
                    className="flex-1 rounded-xl bg-rose-600 py-3 text-xs font-black uppercase text-white hover:bg-rose-700"
                  >
                    {t(lang, 'restartBtn')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content Views: Tipspromenad & Inställningar */}
        <AnimatePresence mode="wait">
          {view === 'setup' && (
            <SetupView
              lang={lang}
              quizConfig={quizConfig}
              participants={participants}
              totalQuestions={totalQuestions}
              getQuizAvailableLanguages={getQuizAvailableLanguages}
              addParticipant={addParticipant}
              setParticipantToDelete={setParticipantToDelete}
              updateParticipantName={updateParticipantName}
              validateAndFinalizeParticipantName={validateAndFinalizeParticipantName}
              shareDirectQuizUrl={shareDirectQuizUrl}
              shareParticipantAnswers={shareParticipantAnswers}
              onOpenImportAnswers={() => setShowAnswerImportModal(true)}
              setShowHowItWorks={setShowHowItWorks}
              isDirectLinkLocked={isQuizModeLocked}
              setView={setView}
            />
          )}

          {view === 'quiz' && (
            <QuizWalkView
              lang={lang}
              quizConfig={quizConfig}
              participants={participants}
              answers={answers}
              selectedParticipantId={selectedParticipantId}
              setSelectedParticipantId={setSelectedParticipantId}
              selectedQuestionIndex={selectedQuestionIndex}
              setSelectedQuestionIndex={setSelectedQuestionIndex}
              visibleQuestionIndexes={visibleQuestionIndexes}
              userLocation={userLocation}
              setView={setView}
              pointsInputValue={pointsInputValue}
              setPointsInputValue={setPointsInputValue}
              submitPointsAnswer={submitPointsAnswer}
              textInputValue={textInputValue}
              setTextInputValue={setTextInputValue}
              submitTextAnswer={submitTextAnswer}
              submitAnswer={submitAnswer}
              setZoomedImageUrl={setZoomedImageUrl}
              isFacitUnlocked={isFacitUnlocked}
              isAdmin={isAdmin}
              locateUser={locateUser}
              isLocating={isLocating}
              walkedPath={walkedPath}
              setWalkedPath={setWalkedPath}
              STORAGE_KEY_WALKED_PATH={STORAGE_KEY_WALKED_PATH}
              handleSelectQuestionIndex={handleSelectQuestionIndex}
              getQuizAnswerProgress={getQuizAnswerProgress}
              quizQuestionPool={quizQuestionPool}
              visibleQuestionCount={visibleQuestionCount}
            />
          )}

          {view === 'results' && (
            <ResultsView
              lang={lang}
              quizConfig={quizConfig}
              participants={participants}
              answers={answers}
              totalQuestions={totalQuestions}
              viewingParticipantId={viewingParticipantId}
              setViewingParticipantId={setViewingParticipantId}
              isFacitUnlocked={isFacitUnlocked}
              setIsFacitUnlocked={setIsFacitUnlocked}
              isAdmin={isAdmin}
              isQuizModeLocked={isQuizModeLocked}
              facitPasswordInput={facitPasswordInput}
              setFacitPasswordInput={setFacitPasswordInput}
              getQuizAnswerProgress={getQuizAnswerProgress}
              showResetConfirm={showResetConfirm}
              setShowResetConfirm={setShowResetConfirm}
              handleResetQuiz={confirmResetQuiz}
              showResultsActions={showResultsActions}
              setShowResultsActions={setShowResultsActions}
              shareDirectQuizUrl={shareDirectQuizUrl}
              shareParticipantAnswers={shareParticipantAnswers}
              onOpenImportAnswers={() => setShowAnswerImportModal(true)}
              hasAnyGeotag={hasAnyGeotag}
              walkedPath={walkedPath}
              calculatePathDistance={calculatePathDistance}
              formatDistance={formatDistance}
              setSelectedQuestionIndex={setSelectedQuestionIndex}
              setSelectedParticipantId={setSelectedParticipantId}
              setView={setView}
              isDirectLinkLocked={isQuizModeLocked}
              setZoomedImageUrl={setZoomedImageUrl}
            />
          )}

          {view === 'config' && (
            <SettingsView
              lang={lang}
              quizConfig={quizConfig}
              setQuizConfig={setQuizConfig}
              isConfigUnlocked={isPasswordCorrect}
              setIsConfigUnlocked={setIsPasswordCorrect}
              isAdmin={isAdmin}
              setIsAdmin={setIsAdmin}
              configMasterPasswordInput={passwordInput}
              setConfigMasterPasswordInput={setPasswordInput}
              setView={setView}
              configTab={configTab as any}
              setConfigTab={setConfigTab as any}
              editingQuestionsCategory={editingQuestionsCategory}
              setEditingQuestionsCategory={setEditingQuestionsCategory}
              setShowCreateQuestionModal={setShowCreateQuestionModal}
              showRouteGeoTagModal={showRouteGeoTagModal}
              setShowRouteGeoTagModal={setShowRouteGeoTagModal}
              setFullScreenEditingQuestionId={setFullScreenEditingQuestionId}
              aiPrompt={aiTopic}
              setAiPrompt={setAiTopic}
              aiBarnCount={aiCount}
              setAiBarnCount={setAiCount}
              aiVuxenCount={aiCount}
              setAiVuxenCount={setAiCount}
              aiIncludeGeotags={aiGeotagLandmarks}
              setAiIncludeGeotags={setAiGeotagLandmarks}
              aiUseImages={false}
              setAiUseImages={() => {}}
              isGeneratingAi={isGenerating}
              handleGenerateQuizWithAI={generateWithAi}
              isBatchTranslating={isBatchTranslating}
              batchTranslateProgress={batchTranslateProgress}
              handleBatchTranslateQuiz={handleBatchTranslateQuiz}
              pastedJsonInput={pastedJsonInput}
              setPastedJsonInput={setPastedJsonInput}
              handleImportPastedJson={handleImportPastedJson}
              showApiKeyInput={showApiKeyInput}
              setShowApiKeyInput={setShowApiKeyInput}
              customApiKey={userApiKeyInput}
              setCustomApiKey={setUserApiKeyInput}
              handleSaveCustomApiKey={handleSaveCustomApiKey}
              userLocation={userLocation}
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
              quizMetadataList={quizLibrary}
              librarySearchQuery={librarySearchQuery}
              setLibrarySearchQuery={setLibrarySearchQuery}
              libraryFilterLanguage={libraryFilterLanguage}
              setLibraryFilterLanguage={setLibraryFilterLanguage}
              librarySortBy={librarySortBy}
              setLibrarySortBy={setLibrarySortBy}
              isLoadingCatalog={isLibraryLoading}
              catalogLoadError={libraryError}
              handleLoadPresetQuiz={loadLibraryQuiz}
              configJsonInput={configJsonInput}
              setConfigJsonInput={setConfigJsonInput}
              handleImportConfig={handleImportConfig}
              currentQuizId={quizConfig.quizId || ''}
              showCreateNewQuizConfirm={showCreateNewQuizConfirm}
              setShowCreateNewQuizConfirm={setShowCreateNewQuizConfirm}
              handleCreateNewQuizConfirm={confirmCreateNewQuiz}
              showResetConfirm={showResetConfirm}
              setShowResetConfirm={setShowResetConfirm}
              handleResetQuiz={confirmResetQuiz}
              showClearConfirm={showClearConfirm}
              setShowClearConfirm={setShowClearConfirm}
              handleClearAllData={handleClearParticipantsAndAnswers}
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
              newPassword={newQuizPassword}
              setNewPassword={setNewQuizPassword}
              newGeotagDistance={newGeotagDistance}
              setNewGeotagDistance={setNewGeotagDistance}
              handleApplyBatchRouteLocations={handleApplyRouteGeoTags}
              catalogUrl={catalogUrl}
              onOpenUrlHelpModal={() => setShowUrlHelpModal(true)}
              walkId={walkId}
            />
          )}
        </AnimatePresence>

        {/* Fullscreen Question Editor Modal */}
        {fullScreenEditingQuestionId && (
          <QuestionFullScreenEditor
            questionId={fullScreenEditingQuestionId}
            onClose={() => setFullScreenEditingQuestionId(null)}
            editingQuestionsCategory={editingQuestionsCategory}
            setEditingQuestionsCategory={setEditingQuestionsCategory}
            quizConfig={quizConfig}
            setQuizConfig={setQuizConfig}
            updateQuestion={updateQuestion}
            handleGeotagQuestion={handleGeotagQuestion}
            handleAiGeotagSingleQuestion={handleAiGeotagSingleQuestion}
            isAiGeotagging={isAiGeotagging}
            userLocation={userLocation}
            isAdmin={isAdmin}
            lang={lang}
            setZoomedImageUrl={setZoomedImageUrl}
          />
        )}

        {/* Global Import / Preset Library Modal */}
        {showConfigInput && (
          <GlobalImportModal
            isOpen={showConfigInput}
            onClose={() => setShowConfigInput(false)}
            lang={lang}
            configTab={configTab}
            setConfigTab={setConfigTab}
            savedQuizzes={savedQuizzes}
            dbSearchQuery={dbSearchQuery}
            setDbSearchQuery={setDbSearchQuery}
            dbFilterCategory={dbFilterCategory}
            setDbFilterCategory={setDbFilterCategory}
            dbSortBy={dbSortBy}
            setDbSortBy={setDbSortBy}
            quizMetadataList={quizLibrary}
            librarySearchQuery={librarySearchQuery}
            setLibrarySearchQuery={setLibrarySearchQuery}
            libraryFilterLanguage={libraryFilterLanguage}
            setLibraryFilterLanguage={setLibraryFilterLanguage}
            librarySortBy={librarySortBy}
            setLibrarySortBy={setLibrarySortBy}
            isLoadingCatalog={isLibraryLoading}
            catalogLoadError={libraryError}
            handleLoadQuizFromDB={handleLoadQuizFromDB}
            handleDeleteQuizFromDB={handleDeleteQuizFromDB}
            handleLoadPresetQuiz={loadLibraryQuiz}
            configJsonInput={configJsonInput}
            setConfigJsonInput={setConfigJsonInput}
            handleImportConfig={handleImportConfig}
            quizConfig={quizConfig}
            handleSaveCurrentQuizToDB={handleSaveCurrentQuizToDB}
            isSavingToDb={isSavingToDb}
          />
        )}

        {/* Global Answer Import Modal */}
        {showAnswerImportModal && (
          <GlobalAnswerImportModal
            isOpen={showAnswerImportModal}
            onClose={() => setShowAnswerImportModal(false)}
            lang={lang}
            quizConfig={quizConfig}
            onImportPayload={handleImportParticipantAnswers}
            onLoadQuizCode={(code) => {
              setShowAnswerImportModal(false);
              processImportConfig(code);
            }}
          />
        )}

        {/* Image Zoom Modal */}
        {zoomedImageUrl && (
          <ImageZoomModal
            imageUrl={zoomedImageUrl}
            onClose={() => setZoomedImageUrl(null)}
            lang={lang}
          />
        )}

        {/* Backup Choice Modal */}
        <BackupChoiceModal
          isOpen={showBackupChoiceModal}
          onClose={() => setShowBackupChoiceModal(false)}
          onExportAll={handleExportAllInOne}
          onExportIndividual={handleExportIndividualQuizzes}
          lang={lang}
        />

        {/* How It Works Help Modal */}
        {showHowItWorks && (
          <HowItWorksModal
            isOpen={showHowItWorks}
            onClose={() => setShowHowItWorks(false)}
            lang={lang}
          />
        )}

        {/* IndexedDB Action Confirmation Modal */}
        <AnimatePresence>
          {dbConfirmation && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDbConfirmation(null)}
                className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl border border-slate-100"
              >
                {/* Header */}
                <div className={`p-6 text-white ${
                  dbConfirmation.action === 'delete' || dbConfirmation.action === 'clear' 
                    ? 'bg-rose-600' 
                    : 'bg-indigo-600'
                }`}>
                  <button
                    type="button"
                    onClick={() => setDbConfirmation(null)}
                    className="absolute right-5 top-5 rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                    <Trash2 className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-black">
                    {dbConfirmation.action === 'delete' 
                      ? (t(lang, 'deleteQuizBtn') || 'Ta bort') 
                      : dbConfirmation.action === 'clear' 
                        ? (t(lang, 'clearDbBtn') || 'Rensa bibliotek') 
                        : (t(lang, 'overwriteQuizBtn') || 'Skriv över')}
                  </h3>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  <p className="text-sm font-semibold leading-relaxed text-slate-600">
                    {dbConfirmation.action === 'delete' 
                      ? (t(lang, 'deleteQuizConfirm') || 'Är du säker på att du vill ta bort detta quiz?') 
                      : dbConfirmation.action === 'clear' 
                        ? (t(lang, 'clearDbConfirm') || 'Är du säker på att du vill ta bort alla sparade quiz?') 
                        : (t(lang, 'overwriteQuizConfirm') || 'Vill du skriva över detta sparade quiz med nuvarande?')}
                  </p>

                  {/* Buttons */}
                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setDbConfirmation(null)}
                      className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-black uppercase text-slate-600 transition-all active:scale-95 cursor-pointer"
                    >
                      {t(lang, 'cancelBtn') || 'Avbryt'}
                    </button>
                    <button
                      type="button"
                      onClick={confirmDbAction}
                      className={`flex-1 rounded-xl py-3 text-xs font-black uppercase text-white transition-all active:scale-95 cursor-pointer shadow-md ${
                        dbConfirmation.action === 'delete' || dbConfirmation.action === 'clear'
                          ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                          : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                      }`}
                    >
                      {t(lang, 'confirm') || 'Ja'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Participant Delete Confirmation Modal */}
        <AnimatePresence>
          {participantToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl border border-slate-100 p-6 space-y-4 text-slate-800"
              >
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-black text-lg text-slate-800">
                    {lang === 'sv' ? 'Ta bort deltagare?' : 'Delete participant?'}
                  </h3>
                  <p className="text-sm font-semibold leading-relaxed text-slate-500">
                    {lang === 'sv'
                      ? `Är du säker på att du vill ta bort ${participantToDelete.name}? Alla sparade svar för deltagaren raderas också.`
                      : `Are you sure you want to delete ${participantToDelete.name}? All saved answers for this participant will also be deleted.`}
                  </p>
                </div>
                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setParticipantToDelete(null)}
                    className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 py-3 text-xs font-black uppercase text-slate-600 transition-all active:scale-95 cursor-pointer"
                  >
                    {lang === 'sv' ? 'Avbryt' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeParticipant(participantToDelete.id);
                      setParticipantToDelete(null);
                    }}
                    className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 py-3 text-xs font-black uppercase text-white transition-all active:scale-95 cursor-pointer shadow-md shadow-rose-100"
                  >
                    {lang === 'sv' ? 'Ta bort' : 'Delete'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Custom Alert Modal (replaces browser native alerts) */}
        {/* API Key Settings Modal */}
        <AnimatePresence>
          {showApiKeyInput && (
            <div 
              className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/75 backdrop-blur-sm"
              onClick={handleCloseApiKeyModal}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl border border-slate-100 z-10 my-auto max-h-[calc(100dvh-2rem)] flex flex-col"
              >
                <div className="bg-indigo-600 p-6 text-white relative shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseApiKeyModal}
                    className="absolute right-4 top-4 rounded-full bg-white/20 p-2.5 transition-colors hover:bg-white/30 cursor-pointer touch-manipulation text-white"
                    aria-label="Stäng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                    <Key className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-black">
                    {t(lang, 'aiSettingsSectionTitle') || 'Gemini API-nyckel'}
                  </h3>
                  <p className="text-xs text-indigo-100 font-medium mt-1">
                    {t(lang, 'aiSettingsDesc') || 'Ange din Gemini API-nyckel för att generera quizfrågor automatiskt med AI.'}
                  </p>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        API-nyckel (Gemini)
                      </label>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors touch-manipulation"
                      >
                        <span>{t(lang, 'getMyApiKeysLink') || 'Mina API-nycklar'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSaveCustomApiKey();
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="password"
                        placeholder="AIzaSy..."
                        value={userApiKeyInput}
                        onChange={(e) => setUserApiKeyInput(e.target.value)}
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoComplete="off"
                      />
                    </form>
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] text-slate-400 font-medium">
                        Nyckeln sparas säkert enbart i din webbläsare (localStorage).
                      </p>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-900 border border-indigo-100 transition-colors group touch-manipulation"
                      >
                        <Key className="w-4 h-4 text-indigo-600 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-semibold flex-1">
                          {t(lang, 'getApiKeyHelpText') || 'Hämta eller skapa din API-nyckel gratis hos Google AI Studio'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600 shrink-0" />
                      </a>
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleCloseApiKeyModal}
                      className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 py-3.5 text-xs font-black uppercase text-slate-600 transition-all active:scale-95 cursor-pointer touch-manipulation"
                    >
                      {t(lang, 'cancelBtn') || 'Avbryt'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCustomApiKey}
                      className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3.5 text-xs font-black uppercase text-white transition-all active:scale-95 cursor-pointer shadow-md shadow-indigo-100 touch-manipulation"
                    >
                      {t(lang, 'saveBtn') || 'Spara nyckel'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {customAlert.isOpen && (
          <CustomAlertModal
            isOpen={customAlert.isOpen}
            message={customAlert.message}
            title={customAlert.title}
            type={customAlert.type}
            onClose={() => setCustomAlert(prev => ({ ...prev, isOpen: false }))}
            lang={lang}
          />
        )}

        {showUrlHelpModal && (
          <UrlHelpModal
            isOpen={showUrlHelpModal}
            onClose={() => setShowUrlHelpModal(false)}
            lang={lang}
            currentCatalogUrl={catalogUrl}
            availableQuizFiles={quizLibrary.map(q => q.filename || `${q.id}.json`)}
          />
        )}
      </div>
    </div>
  );
}
