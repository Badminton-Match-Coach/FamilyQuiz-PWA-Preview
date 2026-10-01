/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Language } from './i18n';

export type UserType = 'barn' | 'vuxen';

export interface Participant {
  id: string;
  uniqueId: string; // Stable ID for merging answers across multiple imports
  name: string;
  type: UserType;
}

export interface Location {
  lat: number;
  lng: number;
  name?: string;
  hideOnMap?: boolean;
}

export type QuestionType = 'options' | 'points' | 'text';

export interface Question {
  id: string;
  text: string;
  imageUrl?: string; // Image for the question (URL or Data URL)
  type?: QuestionType;
  options: string[];
  optionImages?: string[]; // Image per option (URL or Data URL)
  correctAnswers: number[]; // Indices of the correct options for 'options'
  correctTextAnswer?: string; // Correct text answer for 'text' type (e.g. "Stockholm")
  acceptedTextAnswers?: string[]; // Optional alternative accepted answers (e.g. ["Sthlm", "Hufvudstaden"])
  maxPoints?: number; // Optional max points for points questions
  followUpQuestionId?: string;
  followUpMode?: 'always' | 'correct' | 'incorrect';
  location?: Location;
  hideLocationOnMap?: boolean; // When true: question position is hidden from participants on the map (treasure hunt)
  originalLanguage?: Language; // Language code when created (e.g. 'sv', 'fr', 'en', 'es')
  translations?: Record<string, { text: string; options: string[]; correctTextAnswer?: string }>;
}

export interface QuizConfig {
  quizId: string;
  title: string;
  logoUrl?: string;
  password?: string;
  geotagUnlockDistance?: number; // Distance in meters to unlock geotagged questions (default: 20m, min: 5m)
  requireSequentialAnswers?: boolean; // Questions must be answered in sequence order
  textMatchStrictness?: 'strict' | 'normal' | 'lenient'; // Soundex / spelling tolerance level for free text answers
  barnQuestions: Question[];
  vuxenQuestions: Question[];
}

export interface QuizMetadata {
  id: string;
  title: string;
  description?: string;
  filename?: string;
  barnCount?: number;
  vuxenCount?: number;
  language?: string;
  timeLimit?: number;
  catalogBaseUrl?: string;
  resolvedUrl?: string;
}

export interface AnswerRecord {
  participantId: string;
  questionIndex: number;
  answerIndex?: number;
  textAnswer?: string;
  pointsScored?: number;
  isCorrect?: boolean;
  timestamp: number;
}

export interface SavedQuizRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  barnCount: number;
  vuxenCount: number;
  hasLocations: boolean;
  quizConfig: QuizConfig;
  quizState?: {
    participants: Participant[];
    answers: AnswerRecord[];
  };
}
