import { Question, Location, QuestionType } from '../types';
import { Language, t } from '../i18n';
import { registerQuestionTranslation } from '../translationCache';

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export function calculatePathDistance(points: Location[]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calculateDistanceMeters(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return total;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function robustParseQuizJson(rawInput: string): any {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let clean = rawInput.trim();

  // 1. Strip markdown fences
  clean = clean.replace(/```(?:json|text|markdown)?\s*/gi, '').replace(/```\s*$/gi, '').replace(/```/g, '').trim();

  // 2. Extract substring between outer { } or [ ] if surrounded by explanatory text
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = clean.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = clean.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    clean = clean.substring(startIdx, endIdx + 1);
  }

  // 3. Clean trailing commas in objects and arrays
  const sanitized = clean.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(sanitized);
  } catch (e1) {
    try {
      return JSON.parse(clean);
    } catch (e2) {
      // 4. Try repairing truncated JSON (if AI stopped due to token limit)
      try {
        let repaired = sanitized;
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;

        // Remove trailing incomplete property if cut off
        repaired = repaired.replace(/,\s*("[^"]*"?\s*:?\s*[^,}\]]*)$/, '');

        for (let i = 0; i < (openBrackets - closeBrackets); i++) repaired += ']';
        for (let i = 0; i < (openBraces - closeBraces); i++) repaired += '}';
        return JSON.parse(repaired);
      } catch (e3) {
        return null;
      }
    }
  }
}

export function formatImportedQuestion(q: any, idx: number, lang: Language = 'sv'): Question {
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

  let locationObj: Location | undefined = undefined;
  if (q.location && typeof q.location.lat === 'number' && typeof q.location.lng === 'number') {
    locationObj = {
      lat: Number(q.location.lat),
      lng: Number(q.location.lng),
      name: q.location.name ? String(q.location.name) : undefined,
      hideOnMap: !!q.location.hideOnMap
    };
  } else if (typeof q.latitude === 'number' && typeof q.longitude === 'number' && (Math.abs(q.latitude) > 0.0001 || Math.abs(q.longitude) > 0.0001)) {
    locationObj = {
      lat: Number(q.latitude),
      lng: Number(q.longitude),
      name: q.locationName ? String(q.locationName) : (q.name ? String(q.name) : undefined)
    };
  } else if (typeof q.lat === 'number' && typeof q.lng === 'number' && (Math.abs(q.lat) > 0.0001 || Math.abs(q.lng) > 0.0001)) {
    locationObj = {
      lat: Number(q.lat),
      lng: Number(q.lng),
      name: q.locationName ? String(q.locationName) : (q.name ? String(q.name) : undefined)
    };
  }

  const imageUrl = typeof q.imageUrl === 'string' && q.imageUrl.trim() ? q.imageUrl.trim() : (typeof q.image === 'string' && q.image.trim() ? q.image.trim() : undefined);
  const optionImages = Array.isArray(q.optionImages) ? q.optionImages.map((img: any) => typeof img === 'string' && img.trim() ? img.trim() : undefined) : undefined;

  return {
    id: qId,
    text,
    imageUrl,
    type: (q.type === 'points' || q.type === 'text' || q.type === 'options') ? (q.type as QuestionType) : 'options',
    options,
    optionImages,
    correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [typeof q.correctAnswer === 'number' ? q.correctAnswer : 0],
    correctTextAnswer: typeof q.correctTextAnswer === 'string' ? q.correctTextAnswer : undefined,
    acceptedTextAnswers: Array.isArray(q.acceptedTextAnswers) ? q.acceptedTextAnswers.map(String) : undefined,
    maxPoints: typeof q.maxPoints === 'number' ? q.maxPoints : undefined,
    followUpQuestionId: typeof q.followUpQuestionId === 'string' ? q.followUpQuestionId : undefined,
    followUpMode: q.followUpMode === 'correct' || q.followUpMode === 'incorrect' ? q.followUpMode : 'always',
    originalLanguage: origLang,
    translations: translationsObj,
    location: locationObj,
    hideLocationOnMap: !!q.hideLocationOnMap
  };
}

export function parseQuizText(text: string): Question[] {
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

    if (optionMatch && currentQuestion) {
      currentQuestion.options.push(optionMatch[2].trim());
      continue;
    }

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
}
