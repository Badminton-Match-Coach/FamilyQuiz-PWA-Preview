import { QuizConfig } from '../types';

export interface QuizValidationResult {
  valid: boolean;
  error?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const validateQuestion = (question: unknown, index: number): string | null => {
  if (!isObject(question)) return `Fråga ${index + 1} har fel format.`;
  if (typeof question.text !== 'string' || question.text.trim().length === 0) {
    return `Fråga ${index + 1} saknar frågetext.`;
  }
  if (!Array.isArray(question.options)) return `Fråga ${index + 1} saknar svarsalternativ.`;
  const options = question.options as unknown[];

  const questionType = question.type || 'options';
  if (questionType !== 'options' && questionType !== 'text' && questionType !== 'points') {
    return `Fråga ${index + 1} har en ogiltig frågetyp.`;
  }

  // Accept both correctAnswers (array) and correctAnswer (single integer index)
  let answersList: number[] | null = null;
  if (Array.isArray(question.correctAnswers)) {
    answersList = question.correctAnswers;
  } else if (typeof question.correctAnswer === 'number') {
    answersList = [question.correctAnswer];
  }

  if (questionType !== 'text' && questionType !== 'points') {
    if (!answersList || answersList.length === 0 || answersList.some(
      answer => !Number.isInteger(answer) || answer < 0 || answer >= options.length
    )) {
      return `Fråga ${index + 1} har ogiltigt rätt svar.`;
    }
  }

  if (question.location !== undefined) {
    if (!isObject(question.location) || !Number.isFinite(question.location.lat) || !Number.isFinite(question.location.lng)) {
      return `Fråga ${index + 1} har en ogiltig position.`;
    }
  }

  return null;
};

export function validateQuizConfig(value: unknown): QuizValidationResult {
  if (!isObject(value)) return { valid: false, error: 'Quizet måste vara ett JSON-objekt.' };
  if (typeof value.title !== 'string' || value.title.trim().length === 0) {
    return { valid: false, error: 'Quizet saknar titel.' };
  }
  if (value.logoUrl !== undefined && typeof value.logoUrl !== 'string') {
    return { valid: false, error: 'Quizet har en ogiltig logotyp-länk.' };
  }
  if (!Array.isArray(value.barnQuestions) || !Array.isArray(value.vuxenQuestions)) {
    return { valid: false, error: 'Quizet måste innehålla barn- och vuxenfrågor.' };
  }
  if (value.geotagUnlockDistance !== undefined && (
    typeof value.geotagUnlockDistance !== 'number' || !Number.isFinite(value.geotagUnlockDistance) || value.geotagUnlockDistance < 5
  )) {
    return { valid: false, error: 'Quizet har ett ogiltigt geotagg-avstånd.' };
  }
  if (value.requireSequentialAnswers !== undefined && typeof value.requireSequentialAnswers !== 'boolean') {
    return { valid: false, error: 'Quizet har ett ogiltigt sekvensval.' };
  }

  for (const [index, question] of [...value.barnQuestions, ...value.vuxenQuestions].entries()) {
    const error = validateQuestion(question, index);
    if (error) return { valid: false, error };
  }

  const questionIds = new Set([...value.barnQuestions, ...value.vuxenQuestions]
    .filter(isObject)
    .map(question => question.id)
    .filter(id => typeof id === 'string'));
  for (const question of [...value.barnQuestions, ...value.vuxenQuestions]) {
    if (!isObject(question)) continue;
    if (question.followUpQuestionId !== undefined && (
      typeof question.followUpQuestionId !== 'string' || !questionIds.has(question.followUpQuestionId)
    )) {
      return { valid: false, error: 'En följdfråga pekar på en fråga som inte finns.' };
    }
    if (question.followUpMode !== undefined && !['always', 'correct', 'incorrect'].includes(String(question.followUpMode))) {
      return { valid: false, error: 'En följdfråga har ett ogiltigt visningsläge.' };
    }
  }

  return { valid: true };
}

export function assertValidQuizConfig(value: unknown): asserts value is QuizConfig {
  const result = validateQuizConfig(value);
  if (!result.valid) throw new Error(result.error || 'Ogiltigt quizformat.');
}
