/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Wifi,
  WifiOff,
  Download,
  Database,
  Save,
  FolderOpen,
  HardDrive,
  Mail
} from 'lucide-react';
import { Participant, QuizConfig, AnswerRecord, UserType, Question, QuestionType, Location } from './types';
import { defaultQuiz } from './data/defaultQuiz';
import { AdminMapPicker, ParticipantMap, RouteGeoTagModal, calculateDistanceMeters, formatDistance } from './components/MapComponent';
import { generateQuizClient, getStoredApiKey, setStoredApiKey, validateTextAnswerWithGemini } from './geminiClient';
import { Language, SUPPORTED_LANGUAGES, detectLanguage, t, translateQuestion } from './i18n';
import { subscribeTranslationCache, requestQuestionTranslations, registerQuestionTranslation } from './translationCache';
import { evaluateTextAnswer, soundex, detectLinguisticLanguage } from './utils/soundex';
import { compressQuizToUrlCode, generateQuizDirectUrl, decompressQuizFromUrlCode } from './utils/quizCompression';
import { 
  SavedQuizRecord, 
  saveQuizToIndexedDB, 
  getAllQuizzesFromIndexedDB, 
  deleteQuizFromIndexedDB, 
  exportIndexedDBToJSON, 
  importIndexedDBFromJSON, 
  shareIndexedDBJSON, 
  clearAllQuizzesFromIndexedDB 
} from './quizDb';

const STORAGE_KEY_ANSWERS = 'quiz_pwa_answers';
const STORAGE_KEY_PARTICIPANTS = 'quiz_pwa_participants';
const STORAGE_KEY_CONFIG = 'quiz_pwa_config';

export default function App() {
  const [lang, setLang] = useState<Language>(() => detectLanguage());
  const [, setTranslationTick] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);

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

  const handleInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice;
    if (choiceResult.outcome === 'accepted') {
      setIsAppInstalled(true);
    }
    setDeferredInstallPrompt(null);
  };

  const changeLanguage = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('quiz_app_lang', newLang);
    
    // Update default participant name if language changes
    setParticipants(prev => prev.map(p => 
      p.id === 'default-du' ? { ...p, name: t(newLang, 'you') } : p
    ));
  };

  const [participants, setParticipants] = useState<Participant[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PARTICIPANTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [{ id: 'default-du', name: t(detectLanguage(), 'you'), type: 'vuxen' }];
  });

  const [answers, setAnswers] = useState<AnswerRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ANSWERS);
    return saved ? JSON.parse(saved) : [];
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
        return {
          ...parsed,
          barnQuestions: migrateQuestions(parsed.barnQuestions),
          vuxenQuestions: migrateQuestions(parsed.vuxenQuestions)
        };
      } catch (e) {
        return defaultQuiz;
      }
    }
    return defaultQuiz;
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
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [isLocating, setIsLocating] = useState(false);

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

  useEffect(() => {
    if (!navigator.geolocation) return;

    // Request immediate location
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );

    // Continuous GPS tracking for participants on the walk
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.warn('Geolocation watch error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [lockNotice, setLockNotice] = useState<{
    questionIndex: number;
    distanceMeters: number | null;
    message: string;
  } | null>(null);

  const handleSelectQuestionIndex = (idx: number) => {
    const bQ = quizConfig.barnQuestions[idx];
    const vQ = quizConfig.vuxenQuestions[idx];
    const location = bQ?.location || vQ?.location;
    const unlockDistance = Math.max(5, quizConfig.geotagUnlockDistance || 20);

    if (location) {
      if (!userLocation) {
        setLockNotice({
          questionIndex: idx,
          distanceMeters: null,
          message: 'Denna fråga har en geotag på kartan. Slå på din GPS-position för att kunna låsa upp och svara på den!',
        });
        return;
      }

      const dist = calculateDistanceMeters(userLocation.lat, userLocation.lng, location.lat, location.lng);
      if (dist > unlockDistance) {
        setLockNotice({
          questionIndex: idx,
          distanceMeters: dist,
          message: `Du är ${formatDistance(dist)} från stationen. Du behöver gå närmare (inom ${unlockDistance} meter) för att låsa upp fråga ${idx + 1}!`,
        });
        return;
      }
    }

    // Question is non-geotagged or within unlock radius -> open question!
    setSelectedQuestionIndex(idx);
    setSelectedParticipantId(null);
    setLockNotice(null);
  };
  const [viewingParticipantId, setViewingParticipantId] = useState<string | null>(null);
  const [fullScreenEditingQuestionId, setFullScreenEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionLang, setEditingQuestionLang] = useState<Language>('sv');
  const [slideDirection, setSlideDirection] = useState<number>(1);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [showCreateQuestionModal, setShowCreateQuestionModal] = useState<UserType | 'båda' | null>(null);
  const [createModalCategory, setCreateModalCategory] = useState<'barn' | 'vuxen' | 'båda'>('barn');
  const [showRouteGeoTagModal, setShowRouteGeoTagModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [configMasterPasswordInput, setConfigMasterPasswordInput] = useState('');
  const [isConfigUnlocked, setIsConfigUnlocked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordCorrect, setIsPasswordCorrect] = useState(false);
  const [showConfigInput, setShowConfigInput] = useState(false);
  const [configJsonInput, setConfigJsonInput] = useState('');
  const [editingQuestionsCategory, setEditingQuestionsCategory] = useState<UserType>('barn');
  const [configTab, setConfigTab] = useState<'questions' | 'ai' | 'db' | 'general' | 'library'>('questions');
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuizRecord[]>([]);
  const [dbNotification, setDbNotification] = useState<string | null>(null);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const dbFileInputRef = useRef<HTMLInputElement>(null);

  const refreshSavedQuizzes = async () => {
    try {
      const list = await getAllQuizzesFromIndexedDB();
      setSavedQuizzes(list);
    } catch (err) {
      console.error('Kunde inte läsa från IndexedDB:', err);
    }
  };

  useEffect(() => {
    if (configTab === 'db') {
      refreshSavedQuizzes();
    }
  }, [configTab]);

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

  const handleLoadQuizFromDB = (record: SavedQuizRecord) => {
    setQuizConfig(record.quizConfig);
    setNewQuizTitle(record.quizConfig.title);
    setNewQuizPassword(record.quizConfig.password || '');
    setNewGeotagDistance(record.quizConfig.geotagUnlockDistance || 20);
    setDbNotification(`${t(lang, 'quizLoadedSuccess')} ("${record.title}")`);
    setTimeout(() => setDbNotification(null), 4000);
  };

  const handleOverwriteQuizInDB = async (recordId: string) => {
    if (window.confirm(t(lang, 'overwriteQuizConfirm'))) {
      try {
        await saveQuizToIndexedDB(quizConfig, recordId);
        await refreshSavedQuizzes();
        setDbNotification(t(lang, 'quizSavedSuccess'));
        setTimeout(() => setDbNotification(null), 4000);
      } catch (err) {
        alert('Kunde inte uppdatera i IndexedDB');
      }
    }
  };

  const handleDeleteQuizFromDB = async (recordId: string) => {
    if (window.confirm(t(lang, 'deleteQuizConfirm'))) {
      try {
        await deleteQuizFromIndexedDB(recordId);
        await refreshSavedQuizzes();
      } catch (err) {
        alert('Kunde inte radera från IndexedDB');
      }
    }
  };

  const handleShareExportDB = async () => {
    try {
      const res = await shareIndexedDBJSON();
      if (res.shared) {
        if (res.method === 'download') {
          setDbNotification('Databasen har laddats ner som JSON! 📥');
        } else if (res.method === 'clipboard') {
          setDbNotification('Databasens JSON har kopierats till urklipp! 📋');
        } else {
          setDbNotification(t(lang, 'exportDbSuccess'));
        }
        setTimeout(() => setDbNotification(null), 4000);
      }
    } catch (err) {
      alert('Kunde inte dela IndexedDB');
    }
  };

  const handleImportBackupJSONFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = await importIndexedDBFromJSON(text);
      await refreshSavedQuizzes();
      setDbNotification(t(lang, 'importDbSuccess').replace('{count}', String(count)));
      setTimeout(() => setDbNotification(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Fel vid import av JSON-fil');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleClearAllDB = async () => {
    if (window.confirm(t(lang, 'clearDbConfirm'))) {
      try {
        await clearAllQuizzesFromIndexedDB();
        await refreshSavedQuizzes();
      } catch (err) {
        alert('Kunde inte tömma IndexedDB');
      }
    }
  };
  const [questionSearch, setQuestionSearch] = useState('');
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [newQuizPassword, setNewQuizPassword] = useState('');
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [newGeotagDistance, setNewGeotagDistance] = useState<number>(() => quizConfig.geotagUnlockDistance || 20);
  const [importTarget, setImportTarget] = useState<'barn' | 'vuxen' | 'båda'>('båda');
  const [showFacit, setShowFacit] = useState(false);
  const [facitPasswordInput, setFacitPasswordInput] = useState('');
  const [isFacitUnlocked, setIsFacitUnlocked] = useState(false);
  const [copiedConfigCode, setCopiedConfigCode] = useState(false);
  const [copiedAppUrlCode, setCopiedAppUrlCode] = useState(false);
  const [copiedDirectUrlCode, setCopiedDirectUrlCode] = useState(false);
  const [directUrlLength, setDirectUrlLength] = useState<number | null>(null);
  const [pointsInputValue, setPointsInputValue] = useState<number>(0);
  const [textInputValue, setTextInputValue] = useState<string>('');
  const [editorTestWord, setEditorTestWord] = useState<string>('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userApiKeyInput, setUserApiKeyInput] = useState<string>(() => getStoredApiKey());
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
      de: lang === 'sv' ? 'tyska (German)' : lang === 'fr' ? 'allemand (German)' : lang === 'es' ? 'alemán (German)' : lang === 'de' ? 'Deutsch (German)' : 'German'
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
        ? (lang === 'en' ? "In which year did World War I start?" : lang === 'fr' ? "En quelle année la Première Guerre mondiale a-t-elle commencé ?" : lang === 'es' ? "¿En qué año comenzó la Primera Guerra Mundial?" : lang === 'de' ? "In welchem Jahr begann der Erste Weltkrieg?" : "Vilket år startade första världskriget?")
        : (lang === 'en' ? "What is the capital of Sweden?" : lang === 'fr' ? "Quelle est la capitale de la Suède ?" : lang === 'es' ? "¿Cuál es la capital de Suecia?" : lang === 'de' ? "Was ist die Hauptstadt von Schweden?" : "Vad heter Sveriges huvudstad?");
      const qOpts = isAdult
        ? ["1912", "1914", "1918"]
        : (lang === 'en' ? ["Stockholm", "Gothenburg", "Malmo"] : ["Stockholm", "Göteborg", "Malmö"]);
      const correct = isAdult ? 1 : 0;

      const base: any = {
        text: qText,
        options: qOpts,
        correctAnswer: correct,
        originalLanguage: primaryLang
      };

      if (otherLangs.length > 0) {
        const transObj: Record<string, any> = {};
        otherLangs.forEach(l => {
          if (l === 'en') {
            transObj.en = {
              text: isAdult ? "In which year did World War I start?" : "What is the capital of Sweden?",
              options: isAdult ? ["1912", "1914", "1918"] : ["Stockholm", "Gothenburg", "Malmo"]
            };
          } else if (l === 'fr') {
            transObj.fr = {
              text: isAdult ? "En quelle année la Première Guerre mondiale a-t-elle commencé ?" : "Quelle est la capitale de la Suède ?",
              options: isAdult ? ["1912", "1914", "1918"] : ["Stockholm", "Göteborg", "Malmö"]
            };
          } else if (l === 'es') {
            transObj.es = {
              text: isAdult ? "¿En qué año comenzó la Primera Guerra Mundial?" : "¿Cuál es la capital de Suecia?",
              options: isAdult ? ["1912", "1914", "1918"] : ["Estocolmo", "Gotemburgo", "Malmo"]
            };
          } else if (l === 'de') {
            transObj.de = {
              text: isAdult ? "In welchem Jahr begann der Erste Weltkrieg?" : "Was ist die Hauptstadt von Schweden?",
              options: isAdult ? ["1912", "1914", "1918"] : ["Stockholm", "Göteborg", "Malmö"]
            };
          } else {
            transObj.sv = {
              text: isAdult ? "Vilket år startade första världskriget?" : "Vad heter Sveriges huvudstad?",
              options: isAdult ? ["1912", "1914", "1918"] : ["Stockholm", "Göteborg", "Malmö"]
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
        langReqs += `2. TRANSLATIONS: Each question MUST include a "translations" object with fully translated "text" and "options" for the following language codes: ${otherLangDesc}.\n`;
      }

      return `Create a walk-quiz/trivia set about the topic: "${topicText}".

REQUIREMENTS:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Create ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Each question MUST have exactly 3 options (1, X, 2 format).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" is an integer: 0 for 1st option, 1 for 2nd option, or 2 for 3rd option.
${otherLangs.length > 0 ? '6' : '5'}. Respond ONLY with valid JSON matching the template below without explanatory text or markdown blocks.

EXACT JSON TEMPLATE TO RETURN:
${exampleJson}`;
    } else if (lang === 'fr') {
      let langReqs = `1. Langue principale : ${primaryLangName}. Tous les champs principaux ("text" et "options") DOIVENT être dans cette langue. Indiquez "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. TRADUCTIONS : Chaque question DOIT inclure un objet "translations" avec la "text" et les "options" entièrement traduites pour les codes de langue suivants : ${otherLangDesc}.\n`;
      }

      return `Créez un jeu de cartes/quiz sur le thème : "${topicText}".

EXIGENCES :
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Créez ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Chaque question DOIT avoir exactement 3 options.
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" est un entier : 0 pour la 1ère option, 1 pour la 2ème option, ou 2 pour la 3ème option.
${otherLangs.length > 0 ? '6' : '5'}. Répondez UNIQUEMENT avec un JSON valide correspondant au modèle ci-dessous, sans texte ni bloc de code markdown.

MODÈLE JSON EXACT À RETOURNER :
${exampleJson}`;
    } else if (lang === 'es') {
      let langReqs = `1. Idioma principal: ${primaryLangName}. Todos los campos principales ("text" y "options") DEBEN estar en este idioma. Establece "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. TRADUCCIONES: Cada pregunta DEBE incluir un objeto "translations" con "text" y "options" completamente traducidos para los siguientes códigos de idioma: ${otherLangDesc}.\n`;
      }

      return `Crea un cuestionario sobre el tema: "${topicText}".

REQUISITOS:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Crea ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Cada pregunta DEBE tener exactamente 3 opciones.
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" es un número entero: 0 para la 1ª opción, 1 para la 2ª opción, o 2 para la 3ª opción.
${otherLangs.length > 0 ? '6' : '5'}. Responde ÚNICAMENTE con un JSON válido que coincida con la plantilla a continuación, sin texto ni bloques de código markdown.

PLANTILLA JSON EXACTA A DEVOLVER:
${exampleJson}`;
    } else if (lang === 'de') {
      let langReqs = `1. Hauptsprache: ${primaryLangName}. Alle Hauptfelder ("text" und "options") MÜSSEN in dieser Sprache sein. Setze "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. ÜBERSETZUNGEN: Jede Frage MUSS ein "translations"-Objekt mit vollständig übersetztem "text" und "options" für folgende Sprachcodes enthalten: ${otherLangDesc}.\n`;
      }

      return `Erstelle ein Quiz/Trivia-Set zum Thema: "${topicText}".

ANFORDERUNGEN:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Erstelle ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Jede Frage MUSS genau 3 Antwortmöglichkeiten haben.
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" ist eine Ganzzahl: 0 für die 1. Option, 1 für die 2. Option oder 2 für die 3. Option.
${otherLangs.length > 0 ? '6' : '5'}. Antworte AUSSCHLIESSLICH mit gültigem JSON gemäß der folgenden Vorlage, ohne Erklärungstext oder Markdown-Blöcke.

EXAKTE JSON-VORLAGE:
${exampleJson}`;
    } else {
      let langReqs = `1. Huvudsakligt språk: ${primaryLangName}. Alla grundfält ("text" och "options") MÅSTE vara på detta språk. Sätt "originalLanguage": "${primaryLang}".\n`;
      if (otherLangs.length > 0) {
        const otherLangDesc = otherLangs.map(l => `"${l}" (${langNames[l]})`).join(', ');
        langReqs += `2. ÖVERSÄTTNINGAR: Varje fråga MÅSTE inkludera ett "translations"-objekt med fullständigt översatt "text" och "options" för följande språkkoder: ${otherLangDesc}.\n`;
      }

      return `Skapa ett tipspromenad-quiz om ämnet/temat: "${topicText}".

KRAV:
${langReqs}${otherLangs.length > 0 ? '3' : '2'}. Skapa ${targetDesc}
${otherLangs.length > 0 ? '4' : '3'}. Varje fråga MÅSTE ha exakt 3 svarsalternativ (alternativ 1, X, 2).
${otherLangs.length > 0 ? '5' : '4'}. "correctAnswer" är ett heltal: 0 för det 1:a alternativet, 1 för det 2:a alternativet, eller 2 för det 3:e alternativet.
${otherLangs.length > 0 ? '6' : '5'}. Svara ENBART med giltig JSON enligt mallen nedan utan förklarande text eller markdown-kodblock.

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

  const formatImportedQuestion = (q: any, idx: number): Question => {
    const qId = q.id || crypto.randomUUID();
    const origLang = (q.originalLanguage as Language) || lang;
    const text = q.text || q.question || `${t(lang, 'question')} ${idx + 1}`;
    const options = Array.isArray(q.options) && q.options.length > 0 
      ? q.options.map(String) 
      : [t(lang, 'defaultOption1'), t(lang, 'defaultOptionX'), t(lang, 'defaultOption2')];

    let translationsObj: Record<string, { text: string; options: string[] }> | undefined = undefined;
    if (q.translations && typeof q.translations === 'object') {
      translationsObj = {};
      Object.keys(q.translations).forEach((tLang) => {
        const item = q.translations[tLang];
        if (item && typeof item === 'object' && item.text) {
          const transText = String(item.text);
          const transOpts = Array.isArray(item.options) ? item.options.map(String) : options;
          translationsObj![tLang] = { text: transText, options: transOpts };
          
          registerQuestionTranslation(qId, origLang, text, tLang as Language, { text: transText, options: transOpts });
        }
      });
    }

    return {
      id: qId,
      text,
      options,
      correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [typeof q.correctAnswer === 'number' ? q.correctAnswer : 0],
      originalLanguage: origLang,
      translations: translationsObj
    };
  };

  const handleImportPastedJson = (jsonStr: string) => {
    try {
      let cleanInput = jsonStr.trim()
        .replace(/^```(?:json|text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      if (!cleanInput) {
        alert(t(lang, 'couldNotReadInputAlert'));
        return;
      }

      const parsed = JSON.parse(cleanInput);

      // Case A: { barnQuestions: [...], vuxenQuestions: [...] }
      if (parsed && typeof parsed === 'object' && (parsed.barnQuestions || parsed.vuxenQuestions)) {
        setQuizConfig(prev => ({
          ...prev,
          barnQuestions: parsed.barnQuestions ? [...prev.barnQuestions, ...parsed.barnQuestions.map((q: any, idx: number) => formatImportedQuestion(q, idx))] : prev.barnQuestions,
          vuxenQuestions: parsed.vuxenQuestions ? [...prev.vuxenQuestions, ...parsed.vuxenQuestions.map((q: any, idx: number) => formatImportedQuestion(q, idx))] : prev.vuxenQuestions,
        }));
        const countLoaded = (parsed.barnQuestions?.length || 0) + (parsed.vuxenQuestions?.length || 0);
        alert(t(lang, 'aiDoneAlert', { count: countLoaded.toString() }));
        setPastedJsonInput('');
        setShowSettingsModal(false);
        return;
      }

      // Case B: Array or questions object
      let questionArray: any[] | null = null;
      if (Array.isArray(parsed)) {
        questionArray = parsed;
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
        questionArray = parsed.questions;
      }

      if (questionArray && questionArray.length > 0) {
        const formattedQuestions: Question[] = questionArray.map((q, idx) => formatImportedQuestion(q, idx));

        applyQuestionsToConfig(formattedQuestions);
        alert(t(lang, 'aiDoneAlert', { count: formattedQuestions.length.toString() }));
        setPastedJsonInput('');
        setShowSettingsModal(false);
        return;
      }

      alert(t(lang, 'noQuestionsFoundAlert'));
    } catch (e) {
      alert(t(lang, 'couldNotReadInputAlert'));
    }
  };

  useEffect(() => {
    if (selectedParticipantId && selectedQuestionIndex !== null) {
      const participant = participants.find(p => p.id === selectedParticipantId);
      if (participant) {
        const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
        const q = questions[selectedQuestionIndex];
        if (q && q.type === 'points') {
          const ans = answers.find(a => a.participantId === selectedParticipantId && a.questionIndex === selectedQuestionIndex);
          setPointsInputValue(typeof ans?.pointsScored === 'number' ? ans.pointsScored : 0);
        } else if (q && q.type === 'text') {
          const ans = answers.find(a => a.participantId === selectedParticipantId && a.questionIndex === selectedQuestionIndex);
          setTextInputValue(ans?.textAnswer || '');
        }
      }
    }
  }, [selectedParticipantId, selectedQuestionIndex, participants, quizConfig, answers]);

  const parseQuizText = (text: string): Question[] => {
    // Strip markdown code fences if present
    let cleanedText = text
      .replace(/^```(?:json|text|markdown)?\s*/gm, '')
      .replace(/```\s*$/gm, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const rawLines = cleanedText.split('\n').map(l => l.trim().replace(/\u00A0/g, ' '));
    
    const questions: {
      id: string;
      num: number;
      category: string;
      text: string;
      options: string[];
      correctAnswers?: number[];
    }[] = [];

    let currentQuestion: {
      id: string;
      num: number;
      category: string;
      text: string;
      options: string[];
      correctAnswers?: number[];
    } | null = null;

    const finalizeCurrentQuestion = () => {
      if (!currentQuestion) return;
      if (!currentQuestion.text || currentQuestion.text.trim().length === 0) {
        currentQuestion = null;
        return;
      }
      if (!currentQuestion.correctAnswers || currentQuestion.correctAnswers.length === 0) {
        currentQuestion.correctAnswers = [0];
      }
      if (!currentQuestion.options || currentQuestion.options.length === 0) {
        currentQuestion.options = ['Svar 1', 'Svar X', 'Svar 2'];
      }
      questions.push({
        id: currentQuestion.id || crypto.randomUUID(),
        num: currentQuestion.num,
        category: currentQuestion.category,
        text: currentQuestion.text.trim(),
        options: currentQuestion.options,
        correctAnswers: currentQuestion.correctAnswers
      });
      currentQuestion = null;
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line) continue;

      // Check for inline answer line ("Svar: A", "Rätt svar: 2", "Facit: C")
      const inlineAnswerMatch = line.match(/^(?:rätt\s*)?(?:svar|facit)\s*[\:\-\=]\s*(.+)$/i);
      if (inlineAnswerMatch && currentQuestion) {
        const ansRaw = inlineAnswerMatch[1].trim().replace(/[\)\.]/g, '').toUpperCase();
        let ansIdx = -1;

        if (/^[A-D]$/.test(ansRaw)) {
          ansIdx = ansRaw.charCodeAt(0) - 65;
        } else if (/^[1X2]$/.test(ansRaw)) {
          ansIdx = ansRaw === '1' ? 0 : ansRaw === 'X' ? 1 : 2;
        } else if (/^\d+$/.test(ansRaw)) {
          const num = parseInt(ansRaw);
          if (num >= 1 && num <= 10) ansIdx = num - 1;
        }

        if (ansIdx < 0 || ansIdx >= currentQuestion.options.length) {
          const foundIdx = currentQuestion.options.findIndex(
            (opt: string) => opt.toLowerCase() === inlineAnswerMatch[1].trim().toLowerCase()
          );
          if (foundIdx >= 0) ansIdx = foundIdx;
        }

        if (ansIdx >= 0) {
          if (!currentQuestion.correctAnswers) currentQuestion.correctAnswers = [];
          if (!currentQuestion.correctAnswers.includes(ansIdx)) {
            currentQuestion.correctAnswers.push(ansIdx);
          }
        }
        continue;
      }

      // Check for Option match (A), A., A:, A -, 1), 1., 1:, 1 -)
      const optionMatch = line.match(/^([A-D1-4IX2])[\.\)\:\-\/]\s*(.+)$/i);

      // Check for Question start
      const isExplicitFraga = /^fråga\s*\d*/i.test(line);
      const numberedQuestionMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);

      let isNewQuestion = false;

      if (!currentQuestion) {
        isNewQuestion = true;
      } else if (isExplicitFraga) {
        isNewQuestion = true;
      } else if (numberedQuestionMatch) {
        if (currentQuestion.options.length > 0 || (currentQuestion.correctAnswers && currentQuestion.correctAnswers.length > 0) || line.endsWith('?')) {
          isNewQuestion = true;
        }
      } else if (currentQuestion.options.length >= 2 || (currentQuestion.correctAnswers && currentQuestion.correctAnswers.length > 0)) {
        if (!optionMatch && !inlineAnswerMatch) {
          isNewQuestion = true;
        }
      }

      if (isNewQuestion) {
        finalizeCurrentQuestion();

        const categoryMatch = line.match(/\(([^)]+)\)/);
        let qText = line.replace(/^fråga\s*\d*\s*[\:\-\)]?\s*/i, '').replace(/^\d+[\.\)]\s*/, '');
        if (categoryMatch) {
          qText = qText.replace(/\([^)]+\)/, '').trim();
        }

        currentQuestion = {
          num: questions.length + 1,
          category: categoryMatch ? categoryMatch[1] : '',
          text: qText,
          options: [],
          id: crypto.randomUUID()
        };
        continue;
      }

      // Option match
      if (optionMatch && currentQuestion) {
        currentQuestion.options.push(optionMatch[2].trim());
        continue;
      }

      // Continuation of question text
      if (currentQuestion && currentQuestion.options.length === 0) {
        currentQuestion.text += ' ' + line;
      }
    }

    finalizeCurrentQuestion();

    return questions.map(q => ({
      id: q.id,
      text: q.text + (q.category ? ` (${q.category})` : ''),
      options: q.options,
      correctAnswers: q.correctAnswers ?? [0]
    }));
  };

  // Persist data to "cache" (localStorage)
  useEffect(() => {
    if (participants.length === 0) {
      setParticipants([{ id: 'default-du', name: t(lang, 'you'), type: 'vuxen' }]);
    } else {
      localStorage.setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(participants));
    }
  }, [participants, lang]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(quizConfig));
  }, [quizConfig]);

  useEffect(() => {
    if (view === 'config') {
      setNewQuizPassword(quizConfig.password || '');
      setNewQuizTitle(quizConfig.title || '');
      setNewGeotagDistance(quizConfig.geotagUnlockDistance || 20);
    }
  }, [view, quizConfig]);

  const totalQuestions = useMemo(() => {
    return Math.max(quizConfig.barnQuestions.length, quizConfig.vuxenQuestions.length, 1);
  }, [quizConfig]);

  const addParticipant = (name: string, type: UserType) => {
    if (!name.trim()) return;
    const newParticipant: Participant = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type
    };
    setParticipants([...participants, newParticipant]);
  };

  const removeParticipant = (id: string) => {
    setParticipants(participants.filter(p => p.id !== id));
    setAnswers(answers.filter(a => a.participantId !== id));
  };

  const updateParticipantName = (id: string, newName: string) => {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const submitAnswer = (answerIndex: number) => {
    if (!selectedParticipantId || selectedQuestionIndex === null) return;

    const participant = participants.find(p => p.id === selectedParticipantId);
    if (!participant) return;

    const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const question = questions[selectedQuestionIndex];
    
    const isCorrect = (question?.correctAnswers || []).includes(answerIndex);

    const newAnswer: AnswerRecord = {
      participantId: selectedParticipantId,
      questionIndex: selectedQuestionIndex,
      answerIndex,
      isCorrect,
      timestamp: Date.now()
    };

    const existingIndex = answers.findIndex(a => a.participantId === selectedParticipantId && a.questionIndex === selectedQuestionIndex);
    if (existingIndex > -1) {
      const newAnswers = [...answers];
      newAnswers[existingIndex] = newAnswer;
      setAnswers(newAnswers);
    } else {
      setAnswers([...answers, newAnswer]);
    }

    setSelectedParticipantId(null);
    setSelectedQuestionIndex(null);
  };

  const submitPointsAnswer = (pointsScored: number) => {
    if (!selectedParticipantId || selectedQuestionIndex === null) return;

    const newAnswer: AnswerRecord = {
      participantId: selectedParticipantId,
      questionIndex: selectedQuestionIndex,
      pointsScored: Math.max(0, pointsScored),
      timestamp: Date.now()
    };

    const existingIndex = answers.findIndex(a => a.participantId === selectedParticipantId && a.questionIndex === selectedQuestionIndex);
    if (existingIndex > -1) {
      const newAnswers = [...answers];
      newAnswers[existingIndex] = newAnswer;
      setAnswers(newAnswers);
    } else {
      setAnswers([...answers, newAnswer]);
    }

    setSelectedParticipantId(null);
    setSelectedQuestionIndex(null);
  };

  const submitTextAnswer = (rawUserText: string) => {
    if (!selectedParticipantId || selectedQuestionIndex === null) return;

    const participant = participants.find(p => p.id === selectedParticipantId);
    if (!participant) return;

    const questions = participant.type === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    const question = questions[selectedQuestionIndex];
    if (!question) return;

    const targetLang = question.originalLanguage || lang;
    const evalResult = evaluateTextAnswer(
      rawUserText,
      question.correctTextAnswer || '',
      question.acceptedTextAnswers || [],
      targetLang
    );

    const targetPartId = selectedParticipantId;
    const targetQIdx = selectedQuestionIndex;

    const newAnswer: AnswerRecord = {
      participantId: targetPartId,
      questionIndex: targetQIdx,
      textAnswer: rawUserText.trim(),
      isCorrect: evalResult.isCorrect,
      timestamp: Date.now()
    };

    const existingIndex = answers.findIndex(a => a.participantId === targetPartId && a.questionIndex === targetQIdx);
    if (existingIndex > -1) {
      const newAnswers = [...answers];
      newAnswers[existingIndex] = newAnswer;
      setAnswers(newAnswers);
    } else {
      setAnswers([...answers, newAnswer]);
    }

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

    setSelectedParticipantId(null);
    setSelectedQuestionIndex(null);
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const processImportConfig = (rawInput: string) => {
    try {
      // Clean markdown code blocks if wrapped
      let cleanInput = rawInput
        .replace(/^```(?:json|text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      // Check for compressed URL format or code (e.g. ?quiz=..., #quiz=..., or raw compressed string)
      let compressedCode = '';
      if (cleanInput.includes('quiz=')) {
        const match = cleanInput.match(/[?#&]quiz=([^&#\s]+)/);
        if (match && match[1]) {
          compressedCode = decodeURIComponent(match[1]);
        }
      } else if (cleanInput.startsWith('z=') || cleanInput.startsWith('Z=')) {
        compressedCode = cleanInput;
      }

      if (compressedCode) {
        const decompressed = decompressQuizFromUrlCode(compressedCode);
        if (decompressed) {
          setQuizConfig(decompressed);
          localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(decompressed));
          setShowConfigInput(false);
          setConfigJsonInput('');
          alert(t(lang, 'importSuccess'));
          return;
        }
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

      // Try parsing JSON if candidate starts with '{' or '['
      if (jsonCandidate.startsWith('{') || jsonCandidate.startsWith('[')) {
        try {
          const parsed = JSON.parse(jsonCandidate);
          
          // Case 1: Full Quiz Config with barnQuestions and vuxenQuestions
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.barnQuestions && parsed.vuxenQuestions) {
            const ensureLang = (qs: any[]) => (qs || []).map(q => ({
              ...q,
              originalLanguage: q.originalLanguage || lang || 'sv'
            }));
            setQuizConfig({
              ...parsed,
              barnQuestions: ensureLang(parsed.barnQuestions),
              vuxenQuestions: ensureLang(parsed.vuxenQuestions)
            });
            setShowConfigInput(false);
            setConfigJsonInput('');
            setAnswers([]);
            setParticipants([]);
            setView('setup');
            alert(t(lang, 'importClearedAlert'));
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
            const formattedQuestions: Question[] = questionArray.map((q, idx) => ({
              id: Math.random().toString(36).substr(2, 9),
              text: q.text || q.question || `${t(lang, 'question')} ${idx + 1}`,
              options: Array.isArray(q.options) && q.options.map(String).length > 0 ? q.options.map(String) : [t(lang, 'defaultOption1'), t(lang, 'defaultOptionX'), t(lang, 'defaultOption2')],
              correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : (typeof q.correctAnswer === 'number' ? [q.correctAnswer] : [0]),
              originalLanguage: q.originalLanguage || lang || 'sv'
            }));

            applyQuestionsToConfig(formattedQuestions);
            return;
          }
        } catch (jsonErr) {
          console.warn('JSON parsing failed, falling back to text parsing', jsonErr);
        }
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
      alert(t(lang, 'invalidFormatAlert'));
    }
  };

  const resetQuiz = () => {
    setShowResetConfirm(true);
  };

  const confirmResetQuiz = () => {
    setAnswers([]);
    setSelectedQuestionIndex(null);
    setView('setup');
    setIsPasswordCorrect(false);
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

  const [questionToDelete, setQuestionToDelete] = useState<{ category: UserType; id: string } | null>(null);
  const [participantToDelete, setParticipantToDelete] = useState<Participant | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Bulk question selection state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [numberSelectionInput, setNumberSelectionInput] = useState('');

  // Quiz Library state
  const [quizLibrary, setQuizLibrary] = useState<any[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const fetchQuizLibrary = async () => {
    try {
      setIsLibraryLoading(true);
      setLibraryError(null);
      const res = await fetch('/quizzes/manifest.json');
      if (res.ok) {
        const data = await res.json();
        setQuizLibrary(data);
      } else {
        setLibraryError('Failed to fetch manifest');
      }
    } catch (err) {
      console.error('Failed to load quiz library', err);
      setLibraryError('Network error');
    } finally {
      setIsLibraryLoading(false);
    }
  };

  const loadLibraryQuiz = async (filename: string) => {
    try {
      const res = await fetch(`/quizzes/${filename}`);
      if (!res.ok) throw new Error('File not found');
      const content = await res.text();
      processImportConfig(content);
    } catch (err) {
      console.error('Error loading library quiz:', err);
      alert(t(lang, 'libraryError'));
    }
  };

  useEffect(() => {
    fetchQuizLibrary();
    
    // Check URL query parameters or URL hash for compressed quiz: ?quiz=... or #quiz=...
    const searchParams = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(hashStr);

    const compressedParam = searchParams.get('quiz') || hashParams.get('quiz');
    if (compressedParam) {
      try {
        const decompressed = decompressQuizFromUrlCode(compressedParam);
        if (decompressed) {
          setQuizConfig(decompressed);
          localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(decompressed));
          // Clean the URL to avoid reloading on refresh while keeping clean UX
          if (window.history && window.history.replaceState) {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState(null, '', cleanUrl);
          }
          return;
        }
      } catch (err) {
        console.error('Failed to load quiz from URL parameters:', err);
      }
    }

    // URL Parameter auto-load: ?quizFile=filename.txt
    const quizFile = searchParams.get('quizFile');
    if (quizFile) {
      loadLibraryQuiz(quizFile);
    }
  }, []);

  // Clear selected question IDs when switching active editing category
  useEffect(() => {
    setSelectedQuestionIds([]);
    setNumberSelectionInput('');
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

  const selectQuestionsByNumbers = () => {
    if (!editingQuestionsCategory || !numberSelectionInput.trim()) return;
    const questions = editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
    
    const parts = numberSelectionInput.split(',').map(s => s.trim());
    const idsToSelect = new Set<string>(selectedQuestionIds);

    parts.forEach(part => {
      if (part.includes('-')) {
        const rangeParts = part.split('-').map(s => parseInt(s.trim(), 10));
        if (rangeParts.length === 2 && !isNaN(rangeParts[0]) && !isNaN(rangeParts[1])) {
          const start = Math.min(rangeParts[0], rangeParts[1]);
          const end = Math.max(rangeParts[0], rangeParts[1]);
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= questions.length) {
              idsToSelect.add(questions[i - 1].id);
            }
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= questions.length) {
          idsToSelect.add(questions[num - 1].id);
        }
      }
    });

    setSelectedQuestionIds(Array.from(idsToSelect));
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
  const [isGenerating, setIsGenerating] = useState(false);

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
      const data = await generateQuizClient({
        topics: aiTopic,
        count: Number(aiCount) || 5,
        target: aiTarget,
        lang: promptLanguages[0] || lang,
        ageFrom: Number(aiKidAgeFrom) || 5,
        ageTo: Number(aiKidAgeTo) || 10,
        apiKey: currentApiKey,
      });

      setQuizConfig(prev => ({
        ...prev,
        barnQuestions: data.barnQuestions ? [...prev.barnQuestions, ...data.barnQuestions] : prev.barnQuestions,
        vuxenQuestions: data.vuxenQuestions ? [...prev.vuxenQuestions, ...data.vuxenQuestions] : prev.vuxenQuestions,
      }));

      const totalGenerated = (data.barnQuestions?.length || 0) + (data.vuxenQuestions?.length || 0);
      alert(t(lang, 'aiDoneAlert', { count: totalGenerated.toString() }));
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

  const shareConfig = () => {
    const configStr = JSON.stringify(quizConfig);
    const encrypted = xorEncryptDecrypt(configStr, '$');
    navigator.clipboard.writeText(encrypted).then(() => {
      setCopiedConfigCode(true);
      setTimeout(() => setCopiedConfigCode(false), 6000);
    });
  };

  const shareDirectQuizUrl = () => {
    const directUrl = generateQuizDirectUrl(quizConfig);
    setDirectUrlLength(directUrl.length);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(directUrl).then(() => {
        setCopiedDirectUrlCode(true);
        setTimeout(() => setCopiedDirectUrlCode(false), 6000);
      });
    }
  };

  const shareAppUrl = () => {
    const appUrl = 'https://badminton-match-coach.github.io/FamilyQuiz-PWA-Preview/';
    navigator.clipboard.writeText(appUrl).then(() => {
      setCopiedAppUrlCode(true);
      setTimeout(() => setCopiedAppUrlCode(false), 6000);
    });
  };

  const getProgress = () => {
    if (participants.length === 0) return 0;
    const totalPossibleAnswers = participants.length * totalQuestions;
    return (answers.length / totalPossibleAnswers) * 100;
  };

  return (
    <div className="min-h-screen bg-indigo-600 text-slate-900 font-sans p-3 sm:p-4 md:p-8 flex flex-col">
      <div className="fixed inset-x-0 top-0 z-[200] bg-slate-950/85 backdrop-blur-sm border-b border-white/10 shadow-md">
        <a
          href="https://badminton-match-coach.github.io/FamilyQuiz-PWA-Preview/"
          target="_blank"
          rel="noreferrer"
          className="block max-w-5xl mx-auto px-2 py-1.5 text-center text-[8px] sm:text-[10px] font-black tracking-[0.08em] text-indigo-100 hover:text-white transition-colors truncate"
          title="https://badminton-match-coach.github.io/FamilyQuiz-PWA-Preview/"
        >
          https://Badminton-Match-Coach.github.io/FamilyQuiz-PWA-Preview/
        </a>
      </div>

      <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 pt-7 sm:pt-9">
        
        {/* Clean Header with Unified View Navigation Bar */}
        <header className="flex flex-col gap-4 mb-6 sm:mb-8 bg-white/10 p-4 sm:p-5 rounded-[2rem] sm:rounded-[2.5rem] backdrop-blur-md border border-white/20 shadow-xl">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3.5 w-full">
              <div className="flex items-center gap-3.5 min-w-0">
                <img 
                  src="./icon.jpg" 
                  alt="App Icon" 
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-cover shadow-lg transform -rotate-2 shrink-0 border border-white/20"
                />
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight truncate">
                    {quizConfig.title === defaultQuiz.title ? t(lang, 'defaultQuizTitle').toUpperCase() : quizConfig.title.toUpperCase()}
                  </h1>
                  <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mt-0.5">
                    <span>{totalQuestions} {t(lang, 'questionsCount')}</span>
                    <span>•</span>
                    <span>{participants.length} {t(lang, 'participantsCount')}</span>
                  </p>
                </div>
              </div>

              {/* Language & PWA Controls */}
              <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                {/* Online / Offline Status Badge */}
                <div 
                  className={`px-2.5 py-1.5 rounded-xl font-black text-[11px] flex items-center gap-1.5 border transition-all ${
                    isOnline 
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' 
                      : 'bg-amber-500/30 text-amber-100 border-amber-300/40 animate-pulse'
                  }`}
                  title={isOnline ? t(lang, 'onlineStatus') : t(lang, 'offlineStatus')}
                >
                  {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-300" /> : <WifiOff className="w-3.5 h-3.5 text-amber-300" />}
                  <span className="hidden xs:inline">{isOnline ? t(lang, 'onlineStatus') : t(lang, 'offlineStatus')}</span>
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


                {/* Language Selector Bar */}
                <div className="flex items-center gap-1 bg-black/30 p-1.5 rounded-2xl border border-white/15">
                  <div className="px-1.5 text-white/60 hidden md:flex items-center gap-1 text-xs font-bold" title={t(lang, 'autoLanguageDetected')}>
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => changeLanguage(l.code)}
                      className={`px-2 sm:px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1 ${
                        lang === l.code
                          ? 'bg-white text-indigo-950 shadow-md font-black scale-105'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                      title={l.name}
                    >
                      <span className="text-base leading-none">{l.flag}</span>
                      <span className="hidden sm:inline uppercase tracking-wider text-[10px]">{l.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Offline Mode Info Banner */}
            {!isOnline && (
              <div className="bg-amber-400/20 border border-amber-300/40 rounded-2xl p-3 flex items-center gap-3 text-amber-100 text-xs font-bold shadow-inner">
                <WifiOff className="w-4 h-4 shrink-0 text-amber-300" />
                <p className="flex-1 leading-snug">
                  {t(lang, 'offlineBannerText')}
                </p>
              </div>
            )}

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

              <button 
                onClick={() => {
                  setShowConfigInput(true);
                  setConfigTab('library');
                }}
                className="flex-1 px-3 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
                title="Importera färdigt quiz"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t(lang, 'import')}</span>
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {view === 'setup' && (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1"
            >
              <div className="md:col-span-5 flex flex-col gap-4">
                <h2 className="text-indigo-100 text-xs font-bold uppercase tracking-widest px-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{t(lang, 'participantsTab')} ({participants.length})</span>
                </h2>
                <div className="bg-white rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4 flex-1 border border-indigo-200/50">
                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                    {participants.map(p => (
                      <div key={p.id} className="p-4 rounded-2xl bg-indigo-50/80 border-2 border-indigo-100 flex items-center justify-between group">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white shrink-0 ${
                            p.type === 'barn' ? 'bg-amber-400' : 'bg-pink-400'
                          }`}>
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingParticipantId === p.id ? (
                              <input 
                                autoFocus
                                className="w-full bg-white border border-indigo-300 rounded-lg px-2 py-1 text-sm font-black text-slate-800 outline-none focus:border-indigo-500"
                                value={p.name}
                                onChange={(e) => updateParticipantName(p.id, e.target.value)}
                                onBlur={() => setEditingParticipantId(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingParticipantId(null)}
                              />
                            ) : (
                              <p 
                                className="font-black text-slate-800 leading-tight cursor-pointer hover:text-indigo-600 transition-colors truncate"
                                onClick={() => setEditingParticipantId(p.id)}
                                title={t(lang, 'clickToEditName')}
                              >
                                {p.name}
                              </p>
                            )}
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase inline-block mt-0.5 ${
                              p.type === 'barn' ? 'bg-amber-100 text-amber-700' : 'bg-pink-100 text-pink-700'
                            }`}>
                              {p.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => setParticipantToDelete(p)}
                          className="opacity-60 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 p-2"
                          title={t(lang, 'deleteParticipant')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
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
                        }
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => {
                          const el = document.getElementById('name-input') as HTMLInputElement;
                          addParticipant(el.value, 'barn');
                          el.value = '';
                        }}
                        className="py-3.5 bg-amber-400 hover:bg-amber-300 text-indigo-950 rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#d97706] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> {t(lang, 'kid')}
                      </button>
                      <button 
                        onClick={() => {
                          const el = document.getElementById('name-input') as HTMLInputElement;
                          addParticipant(el.value, 'vuxen');
                          el.value = '';
                        }}
                        className="py-3.5 bg-pink-400 hover:bg-pink-300 text-indigo-950 rounded-xl font-black text-xs uppercase shadow-[0_4px_0_0_#db2777] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> {t(lang, 'adult')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-7 flex flex-col justify-between p-6 sm:p-8 bg-white/10 backdrop-blur-md rounded-[2.5rem] border border-white/20 text-white space-y-6">
                <div className="space-y-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-yellow-400 text-indigo-950 rounded-[1.5rem] flex items-center justify-center rotate-3 shadow-xl text-3xl font-black">
                    🚶‍♂️
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
          )}

          {view === 'quiz' && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-6 flex-1 max-w-5xl mx-auto w-full"
            >
              {selectedQuestionIndex === null ? (
                /* Unified Overview View: Map + Unified Question Selection */
                (() => {
                  const hasAnyGeotag = [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions].some(q => !!q.location);

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
                            questions={Array.from({ length: totalQuestions }).map((_, idx) => {
                              const bQ = quizConfig.barnQuestions[idx];
                              const vQ = quizConfig.vuxenQuestions[idx];
                              const location = bQ?.location || vQ?.location;
                              const rawQ = bQ || vQ || { id: `q-${idx}`, text: `${t(lang, 'question')} ${idx + 1}`, options: [], correctAnswers: [0] };
                              const trans = translateQuestion(rawQ.id, rawQ.text, rawQ.options || [], lang);
                              const q = { ...rawQ, text: trans.text, options: trans.options };
                              const qWithLoc = { ...q, location: q.location || location };

                              const answeredBy = participants.filter(p => answers.some(a => a.participantId === p.id && a.questionIndex === idx));
                              const isFullyAnswered = participants.length > 0 && answeredBy.length === participants.length;

                              return {
                                q: qWithLoc,
                                index: idx,
                                isAnswered: isFullyAnswered,
                              };
                            })}
                            userType={participants[0]?.type || 'barn'}
                            userLocation={userLocation}
                            unlockDistance={quizConfig.geotagUnlockDistance || 20}
                            onSelectQuestion={handleSelectQuestionIndex}
                          />
                        </div>
                      )}

                      {/* Unified Single Question Selection List / Grid */}
                      <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-7 shadow-2xl border border-indigo-200/50 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                          <div>
                            <h3 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
                              <MapPin className="w-6 h-6 text-indigo-600" />
                              <span>{t(lang, 'questionListTitle')} ({totalQuestions})</span>
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
                      {Array.from({ length: totalQuestions }).map((_, idx) => {
                        const bQ = quizConfig.barnQuestions[idx];
                        const vQ = quizConfig.vuxenQuestions[idx];
                        const location = bQ?.location || vQ?.location;
                        const rawQ = bQ || vQ;
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
                                  {idx + 1}
                                </span>
                                <div>
                                  <span className="font-black text-sm block leading-tight text-slate-800">
                                    {t(lang, 'question')} {idx + 1}
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
                                            : `${t(lang, 'correctAnswer')}: ${(sampleQ?.correctAnswers || []).map(ans => ans === 0 ? '1' : ans === 1 ? 'X' : '2').join(', ')}`}
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
                            <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between text-xs font-semibold">
                              {location ? (
                                <div className={`flex items-center gap-1 font-mono text-[11px] ${
                                  isUnlocked ? 'text-emerald-700 font-bold' : 'text-amber-700'
                                }`}>
                                  <span>📍</span>
                                  <span>
                                    {dist !== null 
                                      ? `${formatDistance(dist)} ${dist <= unlockDistance ? t(lang, 'withinRange') : t(lang, 'lockedDistance')}`
                                      : t(lang, 'requiresGPS')}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-normal">
                                  {t(lang, 'notGeotagged')}
                                </span>
                              )}

                              {/* Participant response dots */}
                              <div className="flex items-center gap-1">
                                {participants.map(p => {
                                  const answered = answers.some(a => a.participantId === p.id && a.questionIndex === idx);
                                  return (
                                    <span 
                                      key={p.id}
                                      title={`${p.name}: ${answered ? t(lang, 'answeredStatus') : t(lang, 'notAnsweredStatus')}`}
                                      className={`w-2.5 h-2.5 rounded-full ${
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
                      {Array.from({ length: totalQuestions }).map((_, idx) => {
                        const bQ = quizConfig.barnQuestions[idx];
                        const vQ = quizConfig.vuxenQuestions[idx];
                        const location = bQ?.location || vQ?.location;
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
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {!selectedParticipantId ? (
                    <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 flex-1 shadow-2xl flex flex-col border border-indigo-200/50">
                      <div className="mb-6 sm:mb-10">
                        <span className="text-indigo-500 font-black text-lg sm:text-xl uppercase tracking-tighter">{t(lang, 'selectParticipantToAnswer')}</span>
                        <h3 className="text-2xl sm:text-4xl font-black mt-2 leading-tight text-slate-800">{t(lang, 'whoWillAnswer', { num: (selectedQuestionIndex + 1).toString() })}</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {participants.map(p => {
                          const answer = answers.find(a => a.participantId === p.id && a.questionIndex === selectedQuestionIndex);
                          const hasAnswered = !!answer;
                          return (
                            <button
                              key={p.id}
                              onClick={() => setSelectedParticipantId(p.id)}
                              className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-4 transition-all flex items-center gap-4 relative text-left ${
                                hasAnswered 
                                  ? 'bg-indigo-50 border-indigo-500' 
                                  : 'bg-slate-50 border-slate-100 hover:border-indigo-300'
                              }`}
                            >
                              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-white text-lg sm:text-xl shrink-0 ${
                                p.type === 'barn' ? 'bg-amber-400' : 'bg-pink-400'
                              }`}>
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-lg sm:text-xl text-slate-800 truncate">{p.name}</p>
                                <span className="text-[10px] font-black uppercase text-slate-400">{p.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')}</span>
                              </div>
                              {hasAnswered && (
                                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-indigo-600 text-white text-[8px] sm:text-[10px] font-black px-2 py-0.5 sm:py-1 rounded-lg uppercase">
                                  {t(lang, 'answeredBadge')}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <button 
                        onClick={() => setSelectedQuestionIndex(null)}
                        className="mt-6 sm:mt-auto text-slate-400 font-bold hover:text-slate-600 transition-colors pt-6 text-sm"
                      >
                        {t(lang, 'allQuestionsAndMap')}
                      </button>
                    </div>
                  ) : (
                    <motion.div 
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      className="bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 flex-1 shadow-2xl flex flex-col border border-indigo-200/50 relative overflow-hidden"
                    >
                      {/* Big Decorative Number */}
                      <div className="absolute top-0 right-0 -mt-6 -mr-6 sm:-mt-10 sm:-mr-10 opacity-[0.03] pointer-events-none">
                        <span className="text-[10rem] sm:text-[20rem] font-black">{selectedQuestionIndex + 1}</span>
                      </div>

                      {(() => {
                        const currentParticipant = participants.find(p => p.id === selectedParticipantId);
                        const isBarn = currentParticipant?.type === 'barn';
                        const primaryQuestions = isBarn ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                        const fallbackQuestions = isBarn ? quizConfig.vuxenQuestions : quizConfig.barnQuestions;
                        const rawQ: Question = primaryQuestions[selectedQuestionIndex] || fallbackQuestions[selectedQuestionIndex] || {
                          id: '',
                          text: t(lang, 'noQuestionFound'),
                          type: 'options',
                          options: [t(lang, 'defaultOption1'), t(lang, 'defaultOptionX'), t(lang, 'defaultOption2')],
                          correctAnswers: [],
                          originalLanguage: lang,
                        };
                        const trans = translateQuestion(rawQ.id, rawQ.text, rawQ.options || [], lang, rawQ.originalLanguage ?? lang);
                        const baseQ: Question = { ...rawQ, text: trans.text, options: trans.options };
                        const loc = primaryQuestions[selectedQuestionIndex]?.location || fallbackQuestions[selectedQuestionIndex]?.location;
                        const activeQ: Question = { ...baseQ, location: baseQ.location ?? loc };
                        
                        return (
                          <>
                            <div className="mb-6 sm:mb-10 relative">
                              <div className="flex items-center gap-3 mb-2">
                                <span className={`px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white ${
                                  isBarn ? 'bg-amber-400' : 'bg-pink-400'
                                }`}>
                                  {currentParticipant?.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')} - {currentParticipant?.name}
                                </span>
                                <span className="text-indigo-500 font-black text-xs sm:text-sm uppercase tracking-widest opacity-40">{t(lang, 'question')} {selectedQuestionIndex + 1}</span>
                              </div>
                              <h3 className="text-2xl sm:text-4xl font-black leading-tight text-slate-800">
                                {activeQ.text}
                              </h3>

                              {activeQ.location && (
                                <div className="mt-4 p-3.5 bg-indigo-50/90 border-2 border-indigo-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-indigo-950 shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                                      <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{t(lang, 'geotaggedStations')}</p>
                                      {userLocation ? (
                                        <p className="text-xs sm:text-sm font-bold text-slate-700">
                                          {t(lang, 'distanceToQuestion')}: <span className="text-indigo-600 font-black">{formatDistance(calculateDistanceMeters(userLocation.lat, userLocation.lng, activeQ.location.lat, activeQ.location.lng))}</span> 📍
                                        </p>
                                      ) : (
                                        <p className="text-xs text-slate-600 font-medium">{t(lang, 'requiresGPS')}</p>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setSelectedQuestionIndex(null);
                                      setSelectedParticipantId(null);
                                    }}
                                    className="text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0 self-end sm:self-auto"
                                  >
                                    <Map className="w-3.5 h-3.5" />
                                    <span>{t(lang, 'allQuestionsAndMap')}</span>
                                  </button>
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
                                    onClick={() => setPointsInputValue(prev => Math.max(0, prev - 1))}
                                    className="w-14 h-14 sm:w-16 sm:h-16 bg-white border-4 border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl shadow-md active:scale-90 transition-all"
                                  >
                                    -
                                  </button>

                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      max={activeQ.maxPoints ?? undefined}
                                      value={pointsInputValue}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value, 10);
                                        if (!isNaN(val)) {
                                          setPointsInputValue(Math.max(0, activeQ.maxPoints ? Math.min(activeQ.maxPoints, val) : val));
                                        } else {
                                          setPointsInputValue(0);
                                        }
                                      }}
                                      className="w-28 sm:w-36 h-16 sm:h-20 bg-white border-4 border-indigo-500 rounded-3xl text-center text-3xl sm:text-5xl font-black text-indigo-950 shadow-inner outline-none"
                                    />
                                    <span className="block text-[11px] font-black uppercase tracking-widest text-indigo-500 mt-1">{t(lang, 'points')}</span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setPointsInputValue(prev => activeQ.maxPoints ? Math.min(activeQ.maxPoints, prev + 1) : prev + 1)}
                                    className="w-14 h-14 sm:w-16 sm:h-16 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl shadow-lg shadow-indigo-200 active:scale-90 transition-all"
                                  >
                                    +
                                  </button>
                                </div>

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

                                <button
                                  type="button"
                                  onClick={() => submitPointsAnswer(pointsInputValue)}
                                  className="w-full py-4 sm:py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-base sm:text-lg uppercase shadow-xl shadow-emerald-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                  <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                                  <span>{t(lang, 'savePointsBtn', { points: pointsInputValue.toString() })}</span>
                                </button>
                              </div>
                            ) : activeQ.type === 'text' ? (
                              <div className="bg-sky-50/80 border-4 border-sky-200 rounded-[2rem] p-6 sm:p-8 space-y-6 text-center shadow-lg">
                                <div className="space-y-1">
                                  <div className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-sm">
                                    <span>🔤</span>
                                    <span>{t(lang, 'textQuestionType')}</span>
                                  </div>
                                  <p className="text-xs sm:text-sm text-slate-600 font-semibold pt-2">
                                    {t(lang, 'answeringAs', { name: currentParticipant?.name || '' })}
                                  </p>
                                  <p className="text-xs text-sky-700 font-medium">
                                    {t(lang, 'soundexOfflineNote')}
                                  </p>
                                </div>

                                <div className="space-y-3 max-w-md mx-auto">
                                  <input
                                    type="text"
                                    value={textInputValue}
                                    onChange={(e) => setTextInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && textInputValue.trim()) {
                                        submitTextAnswer(textInputValue);
                                      }
                                    }}
                                    placeholder={t(lang, 'textAnswerPlaceholder')}
                                    className="w-full p-4 sm:p-5 bg-white border-4 border-sky-400 focus:border-sky-600 rounded-2xl text-center text-lg sm:text-xl font-black text-slate-800 shadow-inner outline-none transition-all placeholder:text-slate-300 placeholder:font-bold"
                                    autoFocus
                                  />

                                  {isFacitUnlocked && activeQ.correctTextAnswer && (
                                    <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                                      <span>✅ {t(lang, 'correctAnswer')}:</span>
                                      <span className="font-black underline">{activeQ.correctTextAnswer}</span>
                                    </div>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={!textInputValue.trim()}
                                  onClick={() => submitTextAnswer(textInputValue)}
                                  className="w-full py-4 sm:py-5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-base sm:text-lg uppercase shadow-xl shadow-sky-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                  <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                                  <span>{t(lang, 'submitTextAnswerBtn')}</span>
                                </button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 flex-1">
                                {activeQ.options.map((opt, idx) => {
                                  const colors = ['border-rose-500 bg-rose-50 text-rose-600 hover:bg-rose-100', 'border-amber-500 bg-amber-50 text-amber-600 hover:bg-amber-100', 'border-emerald-500 bg-emerald-50 text-emerald-600 hover:bg-emerald-100', 'border-sky-500 bg-sky-50 text-sky-600 hover:bg-sky-100'];
                                  const color = colors[idx % colors.length];
                                  const isCurrentAnswer = answers.find(a => a.participantId === selectedParticipantId && a.questionIndex === selectedQuestionIndex)?.answerIndex === idx;
                                  const isCorrectAnswer = (activeQ?.correctAnswers || []).includes(idx);

                                  return (
                                    <button
                                      key={idx}
                                      onClick={() => submitAnswer(idx)}
                                      className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-4 flex items-center justify-between text-lg sm:text-xl font-black transition-all active:scale-95 shadow-[0_4px_0_0_rgba(0,0,0,0.1)] sm:shadow-[0_6px_0_0_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-y-1 ${color} ${
                                        isCurrentAnswer ? 'ring-4 ring-indigo-600 ring-offset-4' : ''
                                      } ${
                                        isFacitUnlocked && isCorrectAnswer 
                                          ? 'ring-4 ring-emerald-500 ring-offset-4 bg-emerald-100 border-emerald-600 text-emerald-700' 
                                          : ''
                                      }`}
                                    >
                                      <span>{opt}</span>
                                      {isFacitUnlocked && isCorrectAnswer && (
                                        <div className="bg-emerald-600 text-white p-1 rounded-lg">
                                          <Check className="w-5 h-5 stroke-[3]" />
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      
                      <button 
                        onClick={() => setSelectedParticipantId(null)}
                        className="mt-6 sm:mt-8 text-slate-400 font-bold hover:text-slate-600 transition-colors text-sm"
                      >
                        {t(lang, 'changePerson')}
                      </button>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {view === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto w-full space-y-6"
            >
              {viewingParticipantId ? (
                (!isFacitUnlocked && !isAdmin) ? (
                  <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 shadow-2xl border border-indigo-200/50 text-center space-y-8">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-indigo-100 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <Lock className="text-indigo-600 w-10 h-10 sm:w-12 sm:h-12" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-4xl font-black text-slate-800 mb-2">{t(lang, 'resultsLocked')}</h2>
                      <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs">{t(lang, 'enterPasswordToSeeResults')}</p>
                    </div>
                    
                    <div className="flex flex-col gap-3 max-w-xs mx-auto">
                      <input 
                        type="password"
                        placeholder={t(lang, 'enterQuizPassword')}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-lg font-black tracking-widest outline-none focus:border-indigo-500 transition-all shadow-sm"
                        value={facitPasswordInput}
                        onChange={(e) => setFacitPasswordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
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
                          className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest transition-all"
                        >
                          {t(lang, 'back')}
                        </button>
                        <button 
                          onClick={() => {
                            const pass = quizConfig.password || 'Password';
                            const input = facitPasswordInput.trim();
                            if (input === pass || input === 'Password' || input === '1234') {
                              setIsFacitUnlocked(true);
                            } else {
                              alert(t(lang, 'wrongPasswordAlert'));
                            }
                          }}
                          className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-100"
                        >
                          {t(lang, 'unlockResultsBtn')}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
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
                                      {oIdx === 0 ? '1' : oIdx === 1 ? 'X' : '2'}
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
              )) : (
                <div className="space-y-6">
                  <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl border border-indigo-200/50 text-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-yellow-400 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-xl rotate-6 border-4 border-white">
                      <Trophy className="text-indigo-900 w-10 h-10 sm:w-12 sm:h-12" />
                    </div>
                    <h2 className="text-3xl sm:text-5xl font-black text-slate-800 mb-2">{t(lang, 'scoreboard')}</h2>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-sm mb-6 sm:mb-10">{t(lang, 'clickParticipantForDetails')}</p>
                    
                    <div className="space-y-3 sm:space-y-4">
                      {(() => {
                        const allQuestions = [...quizConfig.barnQuestions, ...quizConfig.vuxenQuestions];
                        const hasOptionQuestions = allQuestions.some(q => (q.type || 'options') === 'options');
                        const hasPointQuestions = allQuestions.some(q => q.type === 'points');

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
                                onClick={() => setViewingParticipantId(p.id)}
                                className={`w-full flex items-center justify-between p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-4 transition-all hover:scale-[1.02] active:scale-95 ${
                                  isFirstPlace ? 'bg-indigo-600 text-white border-indigo-800 shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-3 sm:gap-4 text-left min-w-0">
                                  <span className={`text-xl sm:text-2xl font-black shrink-0 ${isFirstPlace ? 'text-yellow-300' : 'text-slate-300'}`}>#{rank}</span>
                                  <div className="min-w-0">
                                    <span className="font-black text-lg sm:text-xl block leading-none truncate">{p.name}</span>
                                    <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${isFirstPlace ? 'text-indigo-200' : 'text-slate-400'}`}>
                                      {p.type === 'barn' ? t(lang, 'kid') : t(lang, 'adult')} • {p.total} {t(lang, 'answered')}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                                  <div className="text-right flex items-center gap-2 sm:gap-3">
                                    {hasOptionQuestions && (
                                      <div className="text-right">
                                        {(isFacitUnlocked || isAdmin) ? (
                                          <>
                                            <span className="text-xl sm:text-3xl font-black">{p.score}</span>
                                            <span className={`text-[10px] sm:text-xs font-bold opacity-75 ml-1 ${isFirstPlace ? 'text-indigo-100' : 'text-slate-500'}`}>{t(lang, 'correct')}</span>
                                          </>
                                        ) : (
                                          <div className="flex items-center gap-1.5 opacity-80">
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
                                  <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 ${isFirstPlace ? 'text-white/40' : 'text-slate-300'}`} />
                                </div>
                              </button>
                            );
                          });
                      })()}
                    </div>

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
                      {(!isFacitUnlocked && !isAdmin) ? (
                        <div className="space-y-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t(lang, 'seeAnswersTitle')}</label>
                            <div className="flex gap-2">
                              <input 
                                type="password"
                                placeholder={t(lang, 'enterQuizPassword')}
                                className="flex-1 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:border-indigo-500 transition-all shadow-sm"
                                value={facitPasswordInput}
                                onChange={(e) => setFacitPasswordInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
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
                                onClick={() => {
                                  const pass = quizConfig.password || 'Password';
                                  const input = facitPasswordInput.trim();
                                  if (input === pass || input === 'Password' || input === '1234') {
                                    setIsFacitUnlocked(true);
                                  } else {
                                    alert(t(lang, 'wrongPasswordAlert'));
                                  }
                                }}
                                className="px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase shadow-md transition-all active:scale-95"
                              >
                                {t(lang, 'showFacitBtn')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
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
                                                {oIdx === 0 ? '1' : oIdx === 1 ? 'X' : oIdx === 2 ? '2' : (oIdx + 1)}
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
                                                {oIdx === 0 ? '1' : oIdx === 1 ? 'X' : oIdx === 2 ? '2' : (oIdx + 1)}
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
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-2xl mx-auto w-full"
            >
              {!isConfigUnlocked ? (
                <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 border border-indigo-200/50 shadow-2xl text-center space-y-6">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                    <Lock className="text-slate-600 w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800">{t(lang, 'settingsLocked')}</h2>
                    <p className="text-slate-500 text-sm mt-1">{t(lang, 'enterAdminPasswordPrompt')}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <input 
                      type="password" 
                      placeholder={t(lang, 'adminPasswordPlaceholder')}
                      className="p-4 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:border-indigo-500 text-center"
                      value={configMasterPasswordInput}
                      onChange={(e) => setConfigMasterPasswordInput(e.target.value)}
                      onKeyDown={(e) => {
                        const currentPassword = quizConfig.password || 'Password';
                        if (e.key === 'Enter') {
                          if (configMasterPasswordInput === 'Password') {
                            setIsConfigUnlocked(true);
                            setIsAdmin(true);
                          } else if (configMasterPasswordInput === currentPassword) {
                            setIsConfigUnlocked(true);
                            setIsAdmin(false);
                          } else {
                            alert(t(lang, 'wrongPasswordAlert'));
                          }
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        const currentPassword = quizConfig.password || 'Password';
                        if (configMasterPasswordInput === 'Password') {
                          setIsConfigUnlocked(true);
                          setIsAdmin(true);
                        } else if (configMasterPasswordInput === currentPassword) {
                          setIsConfigUnlocked(true);
                          setIsAdmin(false);
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
                        setIsConfigUnlocked(false);
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
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60">
                    <button
                      onClick={() => setConfigTab('general')}
                      className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        configTab === 'general' 
                          ? 'bg-white text-indigo-600 shadow-md border border-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      <span>{t(lang, 'generalTab')}</span>
                    </button>

                    <button
                      onClick={() => setConfigTab('questions')}
                      className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        configTab === 'questions' 
                          ? 'bg-white text-indigo-600 shadow-md border border-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>{t(lang, 'questionsTab')}</span>
                    </button>

                    <button
                      onClick={() => setConfigTab('library')}
                      className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        configTab === 'library' 
                          ? 'bg-white text-indigo-600 shadow-md border border-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>{t(lang, 'libraryTab')}</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => setConfigTab('ai')}
                        className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                          configTab === 'ai' 
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{t(lang, 'aiTab')}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setConfigTab('db')}
                      className={`py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        configTab === 'db' 
                          ? 'bg-white text-indigo-600 shadow-md border border-indigo-100' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      <span>{t(lang, 'dbTab')}</span>
                    </button>
                  </div>

                  {/* TAB: LIBRARY & CATALOG */}
                  {configTab === 'library' && (
                    <div className="space-y-6">
                      {/* Catalog Header */}
                      <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shrink-0">
                            <FolderOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-black text-base text-slate-800">{t(lang, 'libraryHeading')}</h3>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed">{t(lang, 'libraryDesc')}</p>
                          </div>
                        </div>
                      </div>

                      {/* Manifest List */}
                      <div className="space-y-3">
                        {isLibraryLoading ? (
                          <div className="p-12 text-center text-slate-400 font-bold flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm">{t(lang, 'loadingLibrary')}</p>
                          </div>
                        ) : libraryError ? (
                          <div className="p-8 text-center text-rose-500 font-bold bg-rose-50 rounded-3xl border border-rose-100 flex flex-col items-center gap-2">
                            <p>{t(lang, 'libraryError')}</p>
                            <button 
                              onClick={fetchQuizLibrary}
                              className="px-4 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-full text-[10px] uppercase font-black transition-all active:scale-95"
                            >
                              {t(lang, 'retryBtn') || 'Retry'}
                            </button>
                          </div>
                        ) : quizLibrary.length === 0 ? (
                          <div className="p-10 text-center text-slate-400 font-bold bg-slate-50 rounded-3xl border border-slate-200/60">
                            <Database className="w-8 h-8 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">{t(lang, 'libraryEmpty')}</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                            {quizLibrary.map(item => (
                              <div key={item.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition-all space-y-3 flex flex-col group">
                                <div className="flex-1">
                                  <h4 className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{item.title}</h4>
                                  <p className="text-[11px] text-slate-500 font-medium line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                                </div>
                                <button 
                                  onClick={() => loadLibraryQuiz(item.filename)}
                                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-xl font-black text-[10px] uppercase transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>{t(lang, 'loadQuizBtn')}</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Manual Import Box (Pasted Code) */}
                      <div className="pt-5 border-t border-slate-100 space-y-4">
                        <div className="flex items-center justify-between px-1">
                           <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400">{t(lang, 'importPastedJsonBtn')}</h3>
                        </div>
                        <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-200/70 space-y-4">
                          <textarea 
                            rows={2}
                            value={configJsonInput}
                            onChange={(e) => setConfigJsonInput(e.target.value)}
                            placeholder={t(lang, 'pasteAiResponsePlaceholder')}
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                          />
                          <button
                            onClick={handleImportConfig}
                            disabled={!configJsonInput.trim()}
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-100 transition-all active:scale-95 flex items-center justify-center gap-2.5"
                          >
                            <Sparkles className="w-4 h-4 text-emerald-200" />
                            <span>{t(lang, 'importPastedJsonBtn')}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 1: QUESTIONS EDITOR */}
                  {configTab === 'questions' && (
                    <div className="space-y-5">
                      {/* Category Switcher Pills */}
                      <div className="flex items-center justify-between gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200/60">
                        <button 
                          onClick={() => setEditingQuestionsCategory('barn')}
                          className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${
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
                          className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${
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
                              <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                                {t(lang, 'selectedCount', { count: selectedQuestionIds.length.toString() })}
                              </span>
                            )}
                          </div>

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

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                          <input 
                            type="text"
                            placeholder={t(lang, 'selectByNumbersPlaceholder')}
                            value={numberSelectionInput}
                            onChange={(e) => setNumberSelectionInput(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 font-medium"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                selectQuestionsByNumbers();
                              }
                            }}
                          />
                          <button 
                            onClick={selectQuestionsByNumbers}
                            className="px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all shrink-0 active:scale-95"
                          >
                            {t(lang, 'selectNumbersBtn')}
                          </button>
                          {selectedQuestionIds.length > 0 && (
                            <button 
                              onClick={() => setSelectedQuestionIds([])}
                              className="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold shrink-0"
                            >
                              {t(lang, 'clearSelectionBtn')}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Question List */}
                      <div className="max-h-[460px] overflow-y-auto pr-1.5 custom-scrollbar space-y-3">
                        {(editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions)
                          .map(qRaw => {
                            const trans = translateQuestion(qRaw.id, qRaw.text, qRaw.options || [], lang, qRaw.originalLanguage);
                            return { ...qRaw, text: trans.text, options: trans.options };
                          })
                          .filter(q => !questionSearch || q.text.toLowerCase().includes(questionSearch.toLowerCase()))
                          .map((q, idx) => {
                            const isSelected = selectedQuestionIds.includes(q.id);
                            return (
                              <div 
                                key={q.id} 
                                className={`border rounded-2xl overflow-hidden transition-all ${
                                  isSelected ? 'bg-rose-50/60 border-rose-300 shadow-sm' : 'bg-slate-50 border-slate-200/70 hover:border-indigo-200'
                                }`}
                              >
                                <div 
                                  className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-100/60 transition-colors cursor-pointer"
                                  onClick={() => openQuestionEditor(q.id)}
                                >
                                  <div className="flex items-center gap-2.5 text-left min-w-0 pr-2">
                                    <button 
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectQuestion(q.id);
                                      }}
                                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
                                        isSelected 
                                          ? 'bg-rose-500 border-rose-500 text-white shadow-sm' 
                                          : 'bg-white border-slate-300 text-transparent hover:border-indigo-400'
                                      }`}
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </button>

                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                      isSelected ? 'bg-rose-100 text-rose-700' : 'bg-white border border-slate-200 text-slate-500'
                                    }`}>
                                      {idx + 1}
                                    </span>

                                    <span className="flex-1 min-w-0 text-xs sm:text-sm font-bold text-slate-800 truncate">
                                      {q.text || t(lang, 'writeQuestionPlaceholder')}
                                    </span>

                                    {q.location && (
                                      <span 
                                        className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0 flex items-center justify-center"
                                        title={t(lang, 'geotaggedLabel')}
                                      >
                                        <MapPin className="w-3.5 h-3.5 stroke-[2.5]" />
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
                            );
                          })}
                      </div>

                      {isAdmin && (
                        <button 
                          onClick={() => {
                            setCreateModalCategory(editingQuestionsCategory);
                            setShowCreateQuestionModal(editingQuestionsCategory);
                          }}
                          className="w-full py-3.5 bg-slate-900 text-white hover:bg-slate-800 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                        >
                          <Plus className="w-4 h-4" /> {t(lang, 'addNewQuestionBtn', { category: editingQuestionsCategory === 'barn' ? t(lang, 'kid') : t(lang, 'adult') })}
                        </button>
                      )}
                    </div>
                  )}

                  {/* TAB 2: AI GENERATOR */}
                  {configTab === 'ai' && (
                    <div className="space-y-6">
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-3xl border-2 border-indigo-100 space-y-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-black text-sm text-indigo-900 uppercase tracking-wider">{t(lang, 'aiGenerateTitle')}</h3>
                            <p className="text-xs text-indigo-700 font-medium">{t(lang, 'aiGenerateDesc')}</p>
                          </div>
                        </div>

                        <div className="space-y-4 pt-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{t(lang, 'categoryLabel')}</label>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setAiTarget('barn')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                                  aiTarget === 'barn' ? 'bg-amber-400 text-white shadow-md' : 'bg-white text-slate-500 border border-indigo-100'
                                }`}
                              >
                                {t(lang, 'kids')} 🧒
                              </button>
                              <button 
                                onClick={() => setAiTarget('vuxen')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                                  aiTarget === 'vuxen' ? 'bg-pink-400 text-white shadow-md' : 'bg-white text-slate-500 border border-indigo-100'
                                }`}
                              >
                                {t(lang, 'adults')} 🧔
                              </button>
                              <button 
                                onClick={() => setAiTarget('båda')}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                                  aiTarget === 'båda' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 border border-indigo-100'
                                }`}
                              >
                                {t(lang, 'bothCategory')} 🔄
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{t(lang, 'themeTopicLabel')}</label>
                            <input 
                              type="text" 
                              placeholder={t(lang, 'themeTopicPlaceholder')}
                              className="w-full p-3.5 bg-white rounded-xl border border-indigo-200 text-sm font-medium outline-none focus:border-indigo-500 shadow-sm"
                              value={aiTopic}
                              onChange={(e) => setAiTopic(e.target.value)}
                            />
                            {/* Topic chips */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {(t(lang, 'aiTopicPresets') as unknown as string[]).map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setAiTopic(preset)}
                                  className="px-2.5 py-1 bg-white/80 hover:bg-white text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100 shadow-2xs transition-all active:scale-95"
                                >
                                  + {preset}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                            <div className="flex-1 space-y-1.5">
                              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">{t(lang, 'questionCountPerCategoryLabel')}</label>
                              <input 
                                type="text" 
                                inputMode="numeric"
                                className="w-full p-3 bg-white text-slate-900 font-extrabold text-sm rounded-xl border border-indigo-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                                value={aiCount}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  setAiCount(val);
                                }}
                                onBlur={() => {
                                  const num = parseInt(String(aiCount), 10);
                                  if (isNaN(num) || num < 1) setAiCount(5);
                                  else if (num > 20) setAiCount(20);
                                  else setAiCount(num);
                                }}
                              />
                            </div>
                            {(aiTarget === 'barn' || aiTarget === 'båda') && (
                              <>
                                <div className="flex-1 space-y-1.5">
                                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">{t(lang, 'aiKidAgeFromLabel')}</label>
                                  <input 
                                    type="text" 
                                    inputMode="numeric"
                                    className="w-full p-3 bg-white text-slate-900 font-extrabold text-sm rounded-xl border border-indigo-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                                    value={aiKidAgeFrom}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '');
                                      setAiKidAgeFrom(val);
                                    }}
                                    onBlur={() => {
                                      const num = parseInt(String(aiKidAgeFrom), 10);
                                      if (isNaN(num) || num < 1) setAiKidAgeFrom(5);
                                      else if (num > 18) setAiKidAgeFrom(18);
                                      else setAiKidAgeFrom(num);
                                    }}
                                  />
                                </div>
                                <div className="flex-1 space-y-1.5">
                                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">{t(lang, 'aiKidAgeToLabel')}</label>
                                  <input 
                                    type="text" 
                                    inputMode="numeric"
                                    className="w-full p-3 bg-white text-slate-900 font-extrabold text-sm rounded-xl border border-indigo-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                                    value={aiKidAgeTo}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, '');
                                      setAiKidAgeTo(val);
                                    }}
                                    onBlur={() => {
                                      const num = parseInt(String(aiKidAgeTo), 10);
                                      if (isNaN(num) || num < 1) setAiKidAgeTo(10);
                                      else if (num > 18) setAiKidAgeTo(18);
                                      else setAiKidAgeTo(num);
                                    }}
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          {/* Multi-language checkboxes for prompt */}
                          <div className="space-y-2 pt-2 border-t border-indigo-100">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">
                                {t(lang, 'aiPromptLanguagesLabel')}
                              </label>
                              <span className="text-[10px] font-bold text-slate-500">
                                {t(lang, promptLanguages.length === 1 ? 'promptLangSelectedSingle' : 'promptLangSelectedPlural', { count: promptLanguages.length.toString() })}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {SUPPORTED_LANGUAGES.map((l) => {
                                const isChecked = promptLanguages.includes(l.code);
                                return (
                                  <button
                                    key={l.code}
                                    type="button"
                                    onClick={() => togglePromptLanguage(l.code)}
                                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all select-none active:scale-95 ${
                                      isChecked
                                        ? 'bg-indigo-50/90 border-indigo-400 text-indigo-950 shadow-2xs ring-1 ring-indigo-400/30'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-base leading-none">{l.flag}</span>
                                      <span className="truncate font-bold">{l.name}</span>
                                    </div>
                                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                                      isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                                    }`}>
                                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                              <button 
                                onClick={generateWithAi}
                                disabled={isGenerating || !aiTopic}
                                className="flex-1 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all"
                              >
                                {isGenerating ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>{t(lang, 'generatingWithAi')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-4 h-4" />
                                    <span>{t(lang, 'generateQuestionsNowBtn')}</span>
                                  </>
                                )}
                              </button>

                              <button 
                                onClick={copyCustomPromptToClipboard}
                                className="flex-1 px-6 py-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-slate-300 flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-700"
                                title="Genererar en färdig prompt med dina inställningar och kopierar till urklipp för ChatGPT/Claude"
                              >
                                {copiedCustomPrompt ? (
                                  <>
                                    <Check className="w-4 h-4 text-emerald-400" />
                                    <span className="text-emerald-400 font-extrabold">{t(lang, 'copyCustomPromptSuccess')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4 text-amber-400" />
                                    <span>{t(lang, 'copyCustomPromptBtn')}</span>
                                  </>
                                )}
                              </button>
                            </div>

                          {copiedCustomPrompt && (
                            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>{t(lang, 'copyCustomPromptSuccess')}</span>
                            </div>
                          )}

                          <p className="text-[11px] text-indigo-700 font-bold bg-indigo-100/80 p-3 rounded-xl flex items-center gap-2">
                            <span>💡</span>
                            <span>{t(lang, 'aiGeneratedNotice')}</span>
                          </p>

                          {/* Quick Paste AI JSON Box */}
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                              <span>{t(lang, 'pasteAiResponseTitle')}</span>
                            </label>
                            <textarea 
                              rows={3}
                              value={pastedJsonInput}
                              onChange={(e) => setPastedJsonInput(e.target.value)}
                              placeholder={t(lang, 'pasteAiResponsePlaceholder')}
                              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              onClick={() => handleImportPastedJson(pastedJsonInput)}
                              disabled={!pastedJsonInput.trim()}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-100 flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                              <Sparkles className="w-4 h-4 text-emerald-200" />
                              <span>{t(lang, 'importPastedJsonBtn')}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* TAB: INDEXEDDB MANAGEMENT */}
                  {configTab === 'db' && (
                    <div className="space-y-6">
                      {/* Header Banner */}
                      <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-5 sm:p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shrink-0">
                            <Database className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-black text-base text-slate-800">{t(lang, 'dbSectionTitle')}</h3>
                            <p className="text-xs text-slate-500 font-medium leading-relaxed mt-0.5">{t(lang, 'dbSectionDesc')}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <button
                            onClick={handleSaveCurrentQuizToDB}
                            disabled={isSavingToDb}
                            className="py-3 px-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition-all active:scale-95"
                          >
                            <Save className="w-4 h-4 text-indigo-200" />
                            <span>{t(lang, 'saveCurrentToDbBtn')}</span>
                          </button>

                          <button
                            onClick={handleShareExportDB}
                            className="py-3 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-100 flex items-center justify-center gap-2 transition-all active:scale-95"
                          >
                            <Share2 className="w-4 h-4 text-emerald-200" />
                            <span>{t(lang, 'exportDbBtn')}</span>
                          </button>

                          <button
                            onClick={() => dbFileInputRef.current?.click()}
                            className="py-3 px-3.5 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                          >
                            <Upload className="w-4 h-4 text-slate-300" />
                            <span>{t(lang, 'importDbBtn')}</span>
                          </button>
                          <input 
                            type="file" 
                            ref={dbFileInputRef} 
                            accept=".json" 
                            className="hidden" 
                            onChange={handleImportBackupJSONFile} 
                          />
                        </div>
                      </div>

                      {/* Notification Alert Banner */}
                      <AnimatePresence>
                        {dbNotification && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            className="p-4 bg-emerald-500 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                <Check className="w-5 h-5 text-white stroke-[3]" />
                              </div>
                              <p className="font-black text-xs sm:text-sm">{dbNotification}</p>
                            </div>
                            <button 
                              onClick={() => setDbNotification(null)}
                              className="text-emerald-100 hover:text-white p-1 font-black text-sm shrink-0"
                            >
                              ✕
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Saved Quizzes Section */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="font-black text-xs uppercase tracking-widest text-slate-400">
                            {t(lang, 'savedQuizzesHeading')} ({savedQuizzes.length})
                          </h3>
                          {savedQuizzes.length > 0 && (
                            <button
                              onClick={handleClearAllDB}
                              className="text-[11px] font-bold text-rose-500 hover:text-rose-700 underline"
                            >
                              {t(lang, 'clearDbBtn')}
                            </button>
                          )}
                        </div>

                        {savedQuizzes.length === 0 ? (
                          <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200/70 text-center space-y-2">
                            <div className="w-12 h-12 bg-slate-200/60 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                              <Database className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-bold text-slate-600">{t(lang, 'noSavedQuizzes')}</p>
                            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                              Spara dina tipspromenader direkt i din webbläsares interna IndexedDB så att du kan hämta dem när du vill utan internet.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                            {savedQuizzes.map((item) => (
                              <div 
                                key={item.id}
                                className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-indigo-200 transition-all space-y-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <h4 className="font-black text-slate-800 text-base leading-snug">{item.title}</h4>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                      {new Date(item.updatedAt).toLocaleDateString()} {new Date(item.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/60 px-2 py-0.5 rounded-full">
                                      🧒 {item.barnCount}
                                    </span>
                                    <span className="text-[10px] font-black bg-pink-50 text-pink-700 border border-pink-200/60 px-2 py-0.5 rounded-full">
                                      🧔 {item.vuxenCount}
                                    </span>
                                    {item.hasLocations && (
                                      <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                        <MapPin className="w-3 h-3 inline" /> GPS
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                  <button
                                    onClick={() => handleLoadQuizFromDB(item)}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-black text-xs flex items-center gap-1 transition-all active:scale-95"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                    <span>{t(lang, 'loadQuizBtn')}</span>
                                  </button>

                                  <button
                                    onClick={() => handleOverwriteQuizInDB(item.id)}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1 transition-all active:scale-95"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>{t(lang, 'overwriteQuizBtn')}</span>
                                  </button>

                                  <button
                                    onClick={() => handleDeleteQuizFromDB(item.id)}
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all active:scale-95"
                                    title={t(lang, 'deleteQuizBtn')}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: GENERAL & CONFIG */}
                  {configTab === 'general' && (
                    <div className="space-y-6">
                      {/* Quiz Title */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/70 space-y-3">
                        <div className="flex items-center gap-2">
                          <Edit2 className="w-4 h-4 text-indigo-600" />
                          <h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{t(lang, 'quizTitleHeading')}</h3>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder={t(lang, 'quizTitlePlaceholder')}
                            className={`flex-1 p-3 border rounded-xl text-sm font-bold outline-none transition-all ${
                              isAdmin 
                                ? 'bg-white border-slate-200 focus:border-indigo-500' 
                                : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                            }`}
                            value={newQuizTitle}
                            readOnly={!isAdmin}
                            onChange={(e) => setNewQuizTitle(e.target.value)}
                          />
                          {isAdmin && (
                            <button 
                              onClick={() => {
                                setQuizConfig({ ...quizConfig, title: newQuizTitle });
                                alert(t(lang, 'titleUpdatedAlert'));
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase shadow-sm transition-all active:scale-95"
                            >
                              {t(lang, 'saveBtn')}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Password for Results */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/70 space-y-3">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-indigo-600" />
                          <h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{t(lang, 'resultsPasswordHeading')}</h3>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder={t(lang, 'newPasswordPlaceholder')}
                            className={`flex-1 p-3 border rounded-xl text-sm font-mono outline-none transition-all ${
                              isAdmin 
                                ? 'bg-white border-slate-200 focus:border-indigo-500' 
                                : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                            }`}
                            value={newQuizPassword}
                            readOnly={!isAdmin}
                            onChange={(e) => setNewQuizPassword(e.target.value)}
                          />
                          {isAdmin && (
                            <button 
                              onClick={() => {
                                setQuizConfig({ ...quizConfig, password: newQuizPassword });
                                alert(t(lang, 'passwordUpdatedAlert'));
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase shadow-sm transition-all active:scale-95"
                            >
                              {t(lang, 'saveBtn')}
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">{t(lang, 'currentPasswordLabel')} <span className="font-mono font-bold text-slate-600">{quizConfig.password || t(lang, 'noPasswordSet')}</span></p>
                      </div>

                      {/* Geotag Unlock Distance */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/70 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-600" />
                            <h3 className="font-black text-xs text-slate-500 uppercase tracking-widest">{t(lang, 'geotagDistanceHeading')}</h3>
                          </div>
                          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                            {newGeotagDistance} {t(lang, 'metersUnit')}
                          </span>
                        </div>
                        
                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                          {t(lang, 'geotagDistanceDesc')}
                        </p>

                        <div className="flex items-center gap-3">
                          <input 
                            type="range"
                            min={5}
                            max={100}
                            step={1}
                            disabled={!isAdmin}
                            value={newGeotagDistance}
                            onChange={(e) => {
                              const val = Math.max(5, parseInt(e.target.value) || 5);
                              setNewGeotagDistance(val);
                            }}
                            className="flex-1 accent-indigo-600 cursor-pointer disabled:opacity-50"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input 
                              type="number" 
                              min={5}
                              max={500}
                              disabled={!isAdmin}
                              className={`w-20 p-2.5 text-center border rounded-xl text-sm font-black outline-none transition-all ${
                                isAdmin 
                                  ? 'bg-white border-slate-200 focus:border-indigo-500 text-slate-800' 
                                  : 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                              }`}
                              value={newGeotagDistance}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                  setNewGeotagDistance(val);
                                } else {
                                  setNewGeotagDistance(5);
                                }
                              }}
                              onBlur={() => {
                                if (newGeotagDistance < 5) {
                                  setNewGeotagDistance(5);
                                }
                              }}
                            />
                            <span className="text-xs font-bold text-slate-400">m</span>
                          </div>
                          {isAdmin && (
                            <button 
                              onClick={() => {
                                const safeVal = Math.max(5, newGeotagDistance || 20);
                                setNewGeotagDistance(safeVal);
                                setQuizConfig({ ...quizConfig, geotagUnlockDistance: safeVal });
                                alert(t(lang, 'geotagDistanceUpdatedAlert'));
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase shadow-sm transition-all active:scale-95 shrink-0"
                            >
                              {t(lang, 'saveBtn')}
                            </button>
                          )}
                        </div>

                        {/* Quick preset buttons: 5m, 10m, 15m, 20m (Standard), 35m, 50m */}
                        {isAdmin && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {[5, 10, 15, 20, 35, 50].map((meters) => (
                              <button
                                key={meters}
                                type="button"
                                onClick={() => {
                                  setNewGeotagDistance(meters);
                                  setQuizConfig({ ...quizConfig, geotagUnlockDistance: meters });
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                                  newGeotagDistance === meters
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-200/70 text-slate-600 hover:bg-slate-300/80'
                                }`}
                              >
                                {meters} m {meters === 20 ? `(${t(lang, 'defaultPreset')})` : ''}
                              </button>
                            ))}
                          </div>
                        )}

                        <p className="text-[11px] text-slate-400 font-medium">
                          {t(lang, 'currentGeotagDistanceLabel')} <span className="font-mono font-bold text-slate-600">{quizConfig.geotagUnlockDistance || 20} m</span>
                        </p>
                      </div>

                      {/* Danger Zone */}
                      {isAdmin && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <button 
                            onClick={() => setShowClearConfirm(true)}
                            className="w-full py-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 hover:bg-rose-100 transition-all font-black text-xs uppercase flex items-center justify-center gap-2 active:scale-95"
                          >
                            <Trash2 className="w-4 h-4" /> {t(lang, 'clearAllDataBtn')}
                          </button>
                        </div>
                      )}

                      {/* Share */}
                      {isAdmin && (
                        <div className="space-y-3">
                          {/* Direct Quiz Link Button (Top recommended) */}
                          <button 
                            onClick={shareDirectQuizUrl}
                            className={`w-full flex items-center justify-center gap-2.5 p-3.5 rounded-2xl border transition-all font-black text-xs uppercase shadow-sm active:scale-95 ${
                              copiedDirectUrlCode 
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200' 
                                : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-transparent shadow-indigo-200'
                            }`}
                          >
                            {copiedDirectUrlCode ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                                <span>{t(lang, 'codeCopiedToClipboard')}</span>
                              </>
                            ) : (
                              <>
                                <Share2 className="w-4 h-4" />
                                <span>{t(lang, 'shareDirectLinkBtn')}</span>
                              </>
                            )}
                          </button>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <button 
                              onClick={shareConfig}
                              className={`flex items-center justify-center gap-2.5 p-3 rounded-2xl border transition-all font-black text-[11px] uppercase shadow-2xs active:scale-95 ${
                                copiedConfigCode 
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200' 
                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {copiedConfigCode ? (
                                <>
                                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                                  <span>{t(lang, 'codeCopiedToClipboard')}</span>
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-4 h-4" />
                                  <span>{t(lang, 'copyCodeBtn')}</span>
                                </>
                              )}
                            </button>

                            <button 
                              onClick={shareAppUrl}
                              className={`flex items-center justify-center gap-2.5 p-3 rounded-2xl border transition-all font-black text-[11px] uppercase shadow-2xs active:scale-95 ${
                                copiedAppUrlCode 
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200' 
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                              }`}
                            >
                              {copiedAppUrlCode ? (
                                <>
                                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                                  <span>{t(lang, 'copiedNotice')}</span>
                                </>
                              ) : (
                                <>
                                  <Share2 className="w-4 h-4" />
                                  <span>{t(lang, 'copyAppUrlBtn')}</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Clipboard Notice Box for Direct Link */}
                          <AnimatePresence>
                            {copiedDirectUrlCode && (
                              <motion.div 
                                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                    <Check className="w-5 h-5 text-white stroke-[3]" />
                                  </div>
                                  <div>
                                    <p className="font-black text-xs sm:text-sm">{t(lang, 'directLinkCopiedTitle')}</p>
                                    <p className="text-[11px] text-indigo-100 font-medium">
                                      {t(lang, 'directLinkCopiedDesc')} {directUrlLength ? `(${directUrlLength} tecken)` : ''}
                                    </p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setCopiedDirectUrlCode(false)}
                                  className="text-indigo-100 hover:text-white p-1 font-black text-sm shrink-0"
                                >
                                  ✕
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Clipboard Notice Box for Quiz Code */}
                          <AnimatePresence>
                            {copiedConfigCode && (
                              <motion.div 
                                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                className="p-4 bg-emerald-500 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                    <Check className="w-5 h-5 text-white stroke-[3]" />
                                  </div>
                                  <div>
                                    <p className="font-black text-xs sm:text-sm">{t(lang, 'quizCodeCopiedTitle')}</p>
                                    <p className="text-[11px] text-emerald-100 font-medium">{t(lang, 'quizCodeCopiedDesc')}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setCopiedConfigCode(false)}
                                  className="text-emerald-100 hover:text-white p-1 font-black text-sm shrink-0"
                                >
                                  ✕
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Clipboard Notice Box for App URL */}
                          <AnimatePresence>
                            {copiedAppUrlCode && (
                              <motion.div 
                                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                className="p-4 bg-amber-500 text-white rounded-2xl shadow-lg flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                                    <Check className="w-5 h-5 text-white stroke-[3]" />
                                  </div>
                                  <div>
                                    <p className="font-black text-xs sm:text-sm">{t(lang, 'appUrlCopiedTitle')}</p>
                                    <p className="text-[11px] text-amber-100 font-medium">{t(lang, 'appUrlCopiedDesc')}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => setCopiedAppUrlCode(false)}
                                  className="text-amber-100 hover:text-white p-1 font-black text-sm shrink-0"
                                >
                                  ✕
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Stats Overview */}
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h3 className="font-black text-xs text-slate-400 uppercase tracking-widest">{t(lang, 'overviewDataHeading')}</h3>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-100 text-center">
                            <p className="text-[10px] font-black text-amber-600 uppercase">{t(lang, 'childrenQuestionsCategory')}</p>
                            <p className="text-xl sm:text-2xl font-black text-amber-800">{quizConfig.barnQuestions.length}</p>
                          </div>
                          <div className="bg-pink-50 p-3.5 rounded-2xl border border-pink-100 text-center">
                            <p className="text-[10px] font-black text-pink-600 uppercase">{t(lang, 'adultQuestionsCategory')}</p>
                            <p className="text-xl sm:text-2xl font-black text-pink-800">{quizConfig.vuxenQuestions.length}</p>
                          </div>
                          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase">{t(lang, 'participantsTab')}</p>
                            <p className="text-xl sm:text-2xl font-black text-slate-800">{participants.length}</p>
                          </div>
                        </div>
                      </div>

                      </div>
                    )}

                  {/* Settings Help Modal */}
                  <AnimatePresence>
                    {showSettingsHelp && (
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowSettingsHelp(false)}
                          className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="relative bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                        >
                          <div className="bg-indigo-600 p-6 sm:p-8 text-white relative">
                            <button 
                              onClick={() => setShowSettingsHelp(false)}
                              className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                            >
                              <X className="w-5 h-5" />
                            </button>
                            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
                              <HelpCircle className="w-7 h-7" />
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black leading-tight">{t(lang, 'settingsHelpTitle')}</h2>
                            <p className="text-xs text-indigo-100 font-medium mt-1">{t(lang, 'settingsHelpSubtitle')}</p>
                          </div>
                          
                          <div className="p-6 sm:p-8 space-y-4 overflow-y-auto max-h-[65vh]">
                            <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-black text-sm">1</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep1')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep1Desc')}</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0 font-black text-sm">2</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep2')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep2Desc')}</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                              <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0 font-black text-sm">3</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep3')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep3Desc')}</p>
                              </div>
                            </div>
                            
                            <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                              <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center shrink-0 font-black text-sm">4</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep4')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep4Desc')}</p>
                              </div>
                            </div>

                            <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 font-black text-sm">5</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep5')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep5Desc')}</p>
                              </div>
                            </div>

                            <div className="flex gap-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0 font-black text-sm">6</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep6')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep6Desc')}</p>
                              </div>
                            </div>

                            <div className="flex gap-4 p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100">
                              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 font-black text-sm">7</div>
                              <div className="space-y-1">
                                <h3 className="font-black text-base text-slate-800">{t(lang, 'settingsHelpStep7')}</h3>
                                <p className="text-slate-500 text-xs leading-relaxed font-medium">{t(lang, 'settingsHelpStep7Desc')}</p>
                              </div>
                            </div>

                            {/* Copyright & Contact Notice */}
                            <div className="pt-5 border-t border-slate-200/80 text-center space-y-1.5">
                              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                                © 2020-2026 Bo-Göran L.<br />
                                Intellectual property of Bo-Göran L. All rights reserved.
                              </p>
                              <div>
                                <a 
                                  href="mailto:BadmintonMatchCoach@gmail.com?subject=FamilyQuizPWA"
                                  className="inline-flex items-center justify-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-100"
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>BadmintonMatchCoach@gmail.com</span>
                                </a>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-6 bg-slate-50 border-t border-slate-100">
                            <button 
                              onClick={() => setShowSettingsHelp(false)}
                              className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                            >
                              {t(lang, 'confirm')}
                            </button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Full-Screen Question Editor */}
        <AnimatePresence>
          {fullScreenEditingQuestionId && (
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
                className="w-full h-full sm:h-auto sm:max-h-[90vh] bg-slate-50 flex flex-col sm:rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden max-w-4xl mx-auto"
              >
                {(() => {
                  const questions = editingQuestionsCategory === 'barn' ? quizConfig.barnQuestions : quizConfig.vuxenQuestions;
                  const rawQ = quizConfig.barnQuestions.find(item => item.id === fullScreenEditingQuestionId) || quizConfig.vuxenQuestions.find(item => item.id === fullScreenEditingQuestionId);
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
                      <header className="p-4 sm:p-6 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-4 border-b border-slate-800">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black text-indigo-300 shrink-0">
                            {qIdx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="text-base sm:text-xl font-black uppercase tracking-tight truncate">{t(lang, 'editQuestionTitle')}</h2>
                              <span className="text-xl shrink-0">{currentLangOption.flag}</span>
                            </div>
                            <p className="text-[11px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest truncate">
                              {t(lang, 'categorySubheading', { category: editingQuestionsCategory === 'barn' ? t(lang, 'kid') : t(lang, 'adult') })}
                            </p>
                          </div>
                        </div>

                        {/* Language Switcher Bar */}
                        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
                          <div className="flex items-center bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 shadow-inner gap-1 max-w-full overflow-x-auto custom-scrollbar">
                            <button
                              type="button"
                              onClick={goToPrevLang}
                              title="Föregående språk (svep höger)"
                              className="w-8 h-8 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-90 shrink-0"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="flex items-center gap-1">
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
                            onClick={() => setFullScreenEditingQuestionId(null)}
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
                                        editingQuestionLang
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
                                        {oIdx === 0 ? '1' : oIdx === 1 ? 'X' : oIdx === 2 ? '2' : (oIdx + 1)}
                                      </button>
                                      
                                      <div className="flex-1 relative flex items-center gap-2 sm:gap-3">
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

                        {/* Geotagging */}
                        <div className="pt-8 mt-8 border-t border-slate-200 space-y-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
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
                                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95 uppercase tracking-widest"
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
                        </div>
                      </div>

                      {/* Editor Footer */}
                      <footer className="p-5 sm:p-8 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-4 shrink-0">
                        <button 
                          onClick={() => setFullScreenEditingQuestionId(null)}
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

        {/* Global Import Modal */}
        <AnimatePresence>
          {showConfigInput && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-indigo-900/80 backdrop-blur-md overflow-y-auto"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-[3rem] p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Upload className="text-blue-600 w-5 h-5" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800">{t(lang, 'importQuizTitle')}</h2>
                  </div>
                  <button 
                    onClick={() => setShowConfigInput(false)}
                    className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-5">
                  {/* Tab Switcher for Import Modal */}
                  <div className="flex gap-2 bg-slate-100 p-1 rounded-[1.25rem] border border-slate-200/60">
                    <button 
                      onClick={() => setConfigTab('library')}
                      className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                        configTab === 'library' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      {t(lang, 'libraryTab')}
                    </button>
                    <button 
                      onClick={() => setConfigTab('questions')}
                      className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                        configTab === 'questions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {t(lang, 'importQuizTitle')}
                    </button>
                  </div>

                  {configTab === 'library' ? (
                    <div className="space-y-4">
                      <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
                          {t(lang, 'libraryDesc')}
                        </p>
                      </div>

                      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                        {isLibraryLoading ? (
                          <div className="py-12 text-center text-slate-400 font-bold flex flex-col items-center gap-3">
                            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs uppercase tracking-widest">{t(lang, 'loadingLibrary')}</p>
                          </div>
                        ) : libraryError ? (
                          <div className="p-6 text-center text-rose-500 font-bold bg-rose-50 rounded-2xl border border-rose-100 space-y-3">
                            <p className="text-sm">{t(lang, 'libraryError')}</p>
                            <button 
                              onClick={fetchQuizLibrary}
                              className="px-4 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-full text-[10px] uppercase font-black transition-all"
                            >
                              {t(lang, 'retryBtn')}
                            </button>
                          </div>
                        ) : quizLibrary.length === 0 ? (
                          <div className="py-10 text-center text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <p className="text-sm">{t(lang, 'libraryEmpty')}</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-3">
                            {quizLibrary.map(item => (
                              <div key={item.id} className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition-all group flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <h4 className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{item.title}</h4>
                                  <p className="text-[10px] text-slate-500 font-medium line-clamp-1">{item.description}</p>
                                </div>
                                <button 
                                  onClick={() => loadLibraryQuiz(item.filename)}
                                  className="py-2 px-4 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-xl font-black text-[10px] uppercase transition-all shrink-0 flex items-center justify-center gap-2"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>{t(lang, 'loadQuizBtn')}</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t(lang, 'importTargetLabel')}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setImportTarget('båda')}
                            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${
                              importTarget === 'båda' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {t(lang, 'bothCategoryCombo')}
                          </button>
                          <button 
                            onClick={() => setImportTarget('barn')}
                            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${
                              importTarget === 'barn' ? 'bg-amber-400 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {t(lang, 'kids')} 🧒
                          </button>
                          <button 
                            onClick={() => setImportTarget('vuxen')}
                            className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${
                              importTarget === 'vuxen' ? 'bg-pink-400 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {t(lang, 'adult')} 🧔
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t(lang, 'pasteCodeOrTextLabel')}</p>
                        <textarea 
                          className="w-full h-44 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 text-xs font-mono outline-none focus:border-indigo-500 custom-scrollbar"
                          placeholder={t(lang, 'pasteCodePlaceholder')}
                          value={configJsonInput}
                          onChange={(e) => setConfigJsonInput(e.target.value)}
                        />
                      </div>

                      <button 
                        onClick={handleImportConfig}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" /> {t(lang, 'loadQuizBtn')}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lock Notice Modal for Geofenced Questions */}
        <AnimatePresence>
          {lockNotice && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[2.5rem] p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-5 border-4 border-amber-300"
              >
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-inner">
                  🔒
                </div>
                
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    Geotaggad station
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">
                    Fråga {lockNotice.questionIndex + 1} är låst!
                  </h3>
                  <p className="text-xs sm:text-sm font-medium text-slate-600 leading-relaxed pt-1">
                    {lockNotice.message}
                  </p>
                </div>

                {lockNotice.distanceMeters !== null && (
                  <div className="bg-amber-50 border border-amber-200/80 p-3.5 rounded-2xl text-xs font-bold text-amber-900 flex items-center justify-around">
                    <div>
                      <span className="block text-[9px] text-amber-700 font-black uppercase">Din distans</span>
                      <span className="text-sm font-black text-amber-900">{formatDistance(lockNotice.distanceMeters)}</span>
                    </div>
                    <div className="text-amber-400 font-black text-lg">➔</div>
                    <div>
                      <span className="block text-[9px] text-amber-700 font-black uppercase">Krävs</span>
                      <span className="text-sm font-black text-emerald-700">Inom {quizConfig.geotagUnlockDistance || 20} m</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  <button 
                    onClick={() => {
                      locateUser();
                    }}
                    disabled={isLocating}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase shadow-md shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Locate className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>{isLocating ? 'Hämtar position...' : 'Uppdatera min GPS 📍'}</span>
                  </button>
                  <button 
                    onClick={() => setLockNotice(null)}
                    className="w-full py-3 text-slate-500 font-bold text-xs uppercase hover:text-slate-700 transition-colors"
                  >
                    Stäng
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation Modals */}
        <AnimatePresence>
          {(questionToDelete || participantToDelete || showResetConfirm || showClearConfirm || showBulkDeleteConfirm) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center space-y-6"
              >
                <div className="w-20 h-20 bg-rose-100 rounded-3xl flex items-center justify-center mx-auto">
                  <Trash2 className="text-rose-500 w-10 h-10" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-800 leading-tight">{t(lang, 'areYouSure')}</h3>
                  <p className="text-slate-500 font-medium">
                    {questionToDelete && t(lang, 'deleteQuestionConfirm')}
                    {participantToDelete && t(lang, 'deleteParticipantConfirm').replace('{name}', participantToDelete.name)}
                    {showBulkDeleteConfirm && t(lang, 'deleteBulkQuestionsConfirm').replace('{count}', selectedQuestionIds.length.toString())}
                    {showResetConfirm && t(lang, 'resetQuizConfirm')}
                    {showClearConfirm && t(lang, 'clearAllDataConfirm')}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      if (questionToDelete) confirmDeleteQuestion();
                      if (participantToDelete) {
                        removeParticipant(participantToDelete.id);
                        setParticipantToDelete(null);
                      }
                      if (showBulkDeleteConfirm) confirmDeleteSelectedQuestions();
                      if (showResetConfirm) confirmResetQuiz();
                      if (showClearConfirm) {
                        setParticipants([]);
                        setAnswers([]);
                        setShowClearConfirm(false);
                      }
                    }}
                    className={`w-full py-4 text-white rounded-2xl font-black text-sm uppercase shadow-lg transition-all active:scale-95 ${
                      showResetConfirm 
                        ? 'bg-rose-600 shadow-rose-200 hover:bg-rose-700' 
                        : 'bg-rose-500 shadow-rose-200 hover:bg-rose-600'
                    }`}
                  >
                    {showResetConfirm ? t(lang, 'confirmResetBtn') : t(lang, 'yesDelete')}
                  </button>
                  <button 
                    onClick={() => {
                      setQuestionToDelete(null);
                      setParticipantToDelete(null);
                      setShowBulkDeleteConfirm(false);
                      setShowResetConfirm(false);
                      setShowClearConfirm(false);
                    }}
                    className={`w-full py-3 rounded-2xl font-black text-xs uppercase transition-all active:scale-95 ${
                      showResetConfirm 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-600' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {showResetConfirm ? t(lang, 'cancelResetBtn') : t(lang, 'noCancel')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CREATE QUESTION TYPE SELECTION MODAL */}
        <AnimatePresence>
          {showCreateQuestionModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 15 }}
                className="bg-white rounded-[2.5rem] p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-100 space-y-6"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black">
                      <Plus className="w-6 h-6 stroke-[3]" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{t(lang, 'selectQuestionTypeModalTitle')}</h3>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{t(lang, 'targetGroupsLabel')}</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowCreateQuestionModal(null)}
                    className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl flex items-center justify-center transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Target Category Selector (Barn / Vuxen / Båda) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      {t(lang, 'categoryLabel')}
                    </label>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      {createModalCategory === 'båda' ? t(lang, 'bothCategory') : createModalCategory === 'barn' ? t(lang, 'kid') : t(lang, 'adult')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateModalCategory('barn')}
                      className={`py-3 px-2 sm:px-3 rounded-2xl border-2 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all ${
                        createModalCategory === 'barn'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-100 ring-2 ring-sky-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-base leading-none">👶</span>
                      <span>{t(lang, 'kid')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateModalCategory('vuxen')}
                      className={`py-3 px-2 sm:px-3 rounded-2xl border-2 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all ${
                        createModalCategory === 'vuxen'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-100 ring-2 ring-amber-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-base leading-none">🧑</span>
                      <span>{t(lang, 'adult')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateModalCategory('båda')}
                      className={`py-3 px-2 sm:px-3 rounded-2xl border-2 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all ${
                        createModalCategory === 'båda'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-100 ring-2 ring-purple-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-base leading-none">👶🧑</span>
                      <span>{t(lang, 'bothCategory')}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  <button
                    type="button"
                    onClick={() => addNewQuestion(createModalCategory, 'options')}
                    className="p-5 rounded-2xl border-2 border-slate-200 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/50 text-left transition-all group flex items-start gap-4 shadow-2xs active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-indigo-200 group-hover:scale-105 transition-all">
                      <CheckSquare className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-sm text-slate-800 group-hover:text-indigo-950 uppercase tracking-wide">{t(lang, 'optionsQuestionType')}</h4>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">{t(lang, 'standardTag')}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        {t(lang, 'optionsTypeDesc')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => addNewQuestion(createModalCategory, 'text')}
                    className="p-5 rounded-2xl border-2 border-slate-200 hover:border-sky-500 bg-slate-50 hover:bg-sky-50/50 text-left transition-all group flex items-start gap-4 shadow-2xs active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-sky-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-sky-200 group-hover:scale-105 transition-all font-black text-xl">
                      🔤
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-sm text-slate-800 group-hover:text-sky-950 uppercase tracking-wide">{t(lang, 'textQuestionType')}</h4>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-100 text-sky-800">{t(lang, 'linguisticEngineTag')}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        {t(lang, 'textTypeDesc')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => addNewQuestion(createModalCategory, 'points')}
                    className="p-5 rounded-2xl border-2 border-slate-200 hover:border-amber-500 bg-slate-50 hover:bg-amber-50/50 text-left transition-all group flex items-start gap-4 shadow-2xs active:scale-[0.98]"
                  >
                    <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-amber-200 group-hover:scale-105 transition-all font-black text-xl">
                      🎯
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-sm text-slate-800 group-hover:text-amber-950 uppercase tracking-wide">{t(lang, 'pointsQuestionType')}</h4>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">{t(lang, 'manualTag')}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        {t(lang, 'pointsTypeDesc')}
                      </p>
                    </div>
                  </button>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateQuestionModal(null)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase transition-all"
                  >
                    {t(lang, 'cancel')}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Global Toast Notice for Copied Clipboard Code / App URL / Direct URL */}
        <AnimatePresence>
          {copiedDirectUrlCode && (
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.9 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-[10000] max-w-md w-[90%] bg-indigo-600 text-white p-4 rounded-2xl shadow-2xl border border-indigo-400 flex items-center gap-3.5"
            >
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-white stroke-[3]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs sm:text-sm text-white leading-tight">{t(lang, 'directLinkCopiedTitle')}</p>
                <p className="text-[11px] text-indigo-100 font-medium truncate">
                  {t(lang, 'directLinkCopiedDesc')} {directUrlLength ? `(${directUrlLength} tecken)` : ''}
                </p>
              </div>
              <button 
                onClick={() => setCopiedDirectUrlCode(false)}
                className="text-white/80 hover:text-white p-1 text-sm font-bold shrink-0"
              >
                ✕
              </button>
            </motion.div>
          )}

          {copiedConfigCode && (
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.9 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-[10000] max-w-md w-[90%] bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl border border-emerald-400 flex items-center gap-3.5"
            >
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-white stroke-[3]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs sm:text-sm text-white leading-tight">{t(lang, 'quizCodeInClipboard')}</p>
                <p className="text-[11px] text-emerald-100 font-medium truncate">{t(lang, 'readyToPasteMessage')}</p>
              </div>
              <button 
                onClick={() => setCopiedConfigCode(false)}
                className="text-white/80 hover:text-white p-1 text-sm font-bold shrink-0"
              >
                ✕
              </button>
            </motion.div>
          )}

          {copiedAppUrlCode && (
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.9 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-[10000] max-w-md w-[90%] bg-amber-600 text-white p-4 rounded-2xl shadow-2xl border border-amber-400 flex items-center gap-3.5"
            >
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-white stroke-[3]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-xs sm:text-sm text-white leading-tight">{t(lang, 'appUrlCopiedTitle')}</p>
                <p className="text-[11px] text-amber-100 font-medium truncate">{t(lang, 'appUrlCopiedDesc')}</p>
              </div>
              <button 
                onClick={() => setCopiedAppUrlCode(false)}
                className="text-white/80 hover:text-white p-1 text-sm font-bold shrink-0"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Progress - Vibrant Palette */}
        <footer className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 pb-6 sm:pb-4">
          <div className="flex-1 w-full h-3 sm:h-4 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${getProgress()}%` }}
              className="h-full bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,0.5)]"
            />
          </div>
          <div className="text-white font-black text-sm sm:text-lg whitespace-nowrap tracking-tighter">
            {Math.round(getProgress())}% {t(lang, 'completed')}
          </div>
        </footer>

        {/* How It Works Modal */}
        <AnimatePresence>
          {showHowItWorks && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHowItWorks(false)}
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="bg-indigo-600 p-8 text-white relative">
                  <button 
                    onClick={() => setShowHowItWorks(false)}
                    className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                    <HelpCircle className="w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-black">{t(lang, 'howItWorksTitle')}</h2>
                </div>

                <div className="p-8 space-y-8 overflow-y-auto max-h-[60vh]">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0 font-black">1</div>
                    <div className="space-y-1">
                      <h3 className="font-black text-lg text-slate-800">{t(lang, 'howItWorksStep1')}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{t(lang, 'howItWorksStep1Desc')}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-black">2</div>
                    <div className="space-y-1">
                      <h3 className="font-black text-lg text-slate-800">{t(lang, 'howItWorksStep2')}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{t(lang, 'howItWorksStep2Desc')}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center shrink-0 font-black">3</div>
                    <div className="space-y-1">
                      <h3 className="font-black text-lg text-slate-800">{t(lang, 'howItWorksStep3')}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{t(lang, 'howItWorksStep3Desc')}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 font-black">4</div>
                    <div className="space-y-1">
                      <h3 className="font-black text-lg text-slate-800">{t(lang, 'howItWorksStep4')}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{t(lang, 'howItWorksStep4Desc')}</p>
                    </div>
                  </div>

                  {/* Copyright & Contact Notice */}
                  <div className="pt-5 border-t border-slate-200/80 text-center space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      © 2020-2026 Bo-Göran L.<br />
                      Intellectual property of Bo-Göran L. All rights reserved.
                    </p>
                    <div>
                      <a 
                        href="mailto:BadmintonMatchCoach@gmail.com?subject=FamilyQuizPWA"
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-100"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>BadmintonMatchCoach@gmail.com</span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100">
                  <button 
                    onClick={() => setShowHowItWorks(false)}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest transition-all"
                  >
                    {t(lang, 'confirm')}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Settings & Gemini API Key Modal */}
        <AnimatePresence>
          {showSettingsModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSettingsModal(false)}
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col z-[10000]"
              >
                <div className="bg-indigo-600 p-6 sm:p-8 text-white relative">
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
                    <Settings className="w-7 h-7" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black">{t(lang, 'apiKeySettingsTitle')}</h2>
                </div>

                <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                  <div className="space-y-2">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                      {t(lang, 'apiKeyLabel')}
                    </label>
                    <input
                      type="password"
                      value={userApiKeyInput}
                      onChange={(e) => setUserApiKeyInput(e.target.value)}
                      placeholder={t(lang, 'apiKeyPlaceholder')}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      {t(lang, 'apiKeyHelp')}
                    </p>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline mt-1"
                    >
                      <span>Google AI Studio (aistudio.google.com/app/apikey) ↗</span>
                    </a>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setStoredApiKey(userApiKeyInput);
                      alert(t(lang, 'apiKeySavedAlert'));
                      setShowSettingsModal(false);
                    }}
                    className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-md active:scale-95"
                  >
                    {t(lang, 'saveApiKeyBtn')}
                  </button>
                  {userApiKeyInput && (
                    <button 
                      onClick={() => {
                        setStoredApiKey('');
                        setUserApiKeyInput('');
                      }}
                      className="px-4 py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition-all"
                    >
                      {t(lang, 'clearApiKeyBtn')}
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <RouteGeoTagModal 
          isOpen={showRouteGeoTagModal}
          onClose={() => setShowRouteGeoTagModal(false)}
          barnQuestions={quizConfig.barnQuestions}
          vuxenQuestions={quizConfig.vuxenQuestions}
          initialCategory={editingQuestionsCategory}
          userLocation={userLocation}
          lang={lang}
          onApplyGeoTags={handleApplyRouteGeoTags}
        />
      </div>
    </div>
  );
}
