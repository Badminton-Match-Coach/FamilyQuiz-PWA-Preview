import LZString from 'lz-string';
import { Participant, AnswerRecord, QuizConfig } from '../types';

export interface ParticipantAnswerPayload {
  schema: 'family-quiz-participant-answers-v1';
  quizId?: string;
  walkId?: string;
  title?: string;
  createdAt: string;
  participants: Participant[];
  answers: AnswerRecord[];
}

export const DEFAULT_PARTICIPANT_UNIQUE_ID = 'default-participant-reserved';

export const normalizeParticipantNameForCompare = (name: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]/g, '');

const reservedParticipantNames = new Set([
  'me', 'jag', 'jej', 'mig', 'you', 'du', 'i', 'ich', 'moi', 'yo', 'je', 'mi', 'io', 'mina',
  'ik', 'jeg', 'eg', 'mon', 'es', 'as', 'я', 'ya'
]);

export const isReservedParticipantName = (name: string): boolean =>
  reservedParticipantNames.has(normalizeParticipantNameForCompare(name));

const tryBase64Decode = (str: string): string | null => {
  try {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) {
      s += '=';
    }
    return atob(s);
  } catch {
    return null;
  }
};

export const xorEncryptDecrypt = (input: string, key: string): string => {
  let safeInput = input;
  try {
    safeInput = unescape(encodeURIComponent(input));
  } catch {
    safeInput = input;
  }
  let output = '';
  for (let i = 0; i < safeInput.length; i++) {
    const charCode = safeInput.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output += String.fromCharCode(charCode);
  }
  try {
    return btoa(unescape(encodeURIComponent(output)));
  } catch {
    return btoa(output);
  }
};

export const xorDecrypt = (input: string, key: string): string => {
  try {
    let text = input.trim();
    // Recursively decode in case of multi-layer URL encoding (%252B -> %2B -> +)
    for (let i = 0; i < 5 && text.includes('%'); i++) {
      try {
        const decodedUri = decodeURIComponent(text);
        if (decodedUri === text) break;
        text = decodedUri;
      } catch {
        break;
      }
    }
    // Restore '+' if replaced by space in URL query string or chat apps
    const cleaned = text.replace(/ /g, '+').replace(/\s+/g, '');
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
    } catch {
      return output;
    }
  } catch {
    return '';
  }
};

/**
 * Unwraps URL redirection services such as:
 * - Microsoft Outlook SafeLinks (safelinks.protection.outlook.com/?url=...)
 * - Proofpoint URL Defense (urldefense.proofpoint.com/v2/url?u=...)
 * - Google redirects (google.com/url?q=...)
 * - Facebook redirects (l.facebook.com/l.php?u=...)
 * - Generic redirect parameters (?url=..., &url=..., ?u=..., &target=..., &dest=...)
 */
export function unwrapRedirectUrl(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim();
  for (let i = 0; i < 4; i++) {
    const match = str.match(/[?&](?:url|u|q|target|dest|destination|link)=([^&]+)/i);
    if (match && match[1]) {
      try {
        const unwrapped = decodeURIComponent(match[1]);
        if (unwrapped && unwrapped !== str) {
          str = unwrapped;
          continue;
        }
      } catch {
        // ignore
      }
    }
    break;
  }
  return str;
}

/**
 * Encodes a ParticipantAnswerPayload into a robust, URL-safe qps code.
 */
export function encodeParticipantAnswers(payload: ParticipantAnswerPayload): string {
  const jsonStr = JSON.stringify(payload);
  const compressed = LZString.compressToEncodedURIComponent(jsonStr);
  const encrypted = xorEncryptDecrypt(compressed, '$');
  return `qps=${encodeURIComponent(encrypted)}`;
}

/**
 * Detects if the input looks like a quiz configuration instead of participant answers.
 */
export function isQuizCodeOrUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  let str = unwrapRedirectUrl(input.trim());
  if (str.includes('%23') || str.includes('%3D') || str.includes('%26')) {
    try {
      str = decodeURIComponent(str);
    } catch {
      // ignore
    }
  }
  if (str.includes('#z=') || str.includes('?z=') || str.includes('&z=') || str.startsWith('z=')) return true;
  if (str.includes('quiz=') || str.includes('?q=') || str.includes('&q=')) return true;
  if (str.includes('"vuxenQuestions"') || str.includes('"barnQuestions"')) return true;
  return false;
}

/**
 * Parses and extracts a ParticipantAnswerPayload from any raw input:
 * - Direct JSON (standard schema or raw participants/answers)
 * - Full URL (hash #qps=... or query ?qps=...)
 * - Text from SMS/chat containing a link (even if line-wrapped or containing spaces)
 * - Outlook SafeLinks or Proofpoint wrapped URLs
 * - Code string (qps=... or #qps=...)
 * - Raw encrypted string
 */
export function parseParticipantAnswerPayload(rawInput: string): ParticipantAnswerPayload | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let trimmed = rawInput.trim();

  // 1. Direct JSON check
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed) {
        if (parsed.schema === 'family-quiz-participant-answers-v1') {
          return parsed;
        }
        if (Array.isArray(parsed.participants) || Array.isArray(parsed.answers)) {
          return {
            schema: 'family-quiz-participant-answers-v1',
            createdAt: new Date().toISOString(),
            quizId: parsed.quizId,
            walkId: parsed.walkId,
            title: parsed.title || parsed.config?.title,
            participants: Array.isArray(parsed.participants) ? parsed.participants : [],
            answers: Array.isArray(parsed.answers) ? parsed.answers : []
          };
        }
        if (parsed.quizState && (Array.isArray(parsed.quizState.participants) || Array.isArray(parsed.quizState.answers))) {
          return {
            schema: 'family-quiz-participant-answers-v1',
            createdAt: new Date().toISOString(),
            quizId: parsed.config?.quizId,
            walkId: parsed.walkId,
            title: parsed.config?.title || parsed.title,
            participants: Array.isArray(parsed.quizState.participants) ? parsed.quizState.participants : [],
            answers: Array.isArray(parsed.quizState.answers) ? parsed.quizState.answers : []
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Unwrap any redirect services (e.g. Outlook SafeLinks, Proofpoint, Google redirect, etc.)
  trimmed = unwrapRedirectUrl(trimmed);

  // Decode top-level URL components like %23 (#), %3D (=), %26 (&), %3F (?)
  for (let i = 0; i < 3; i++) {
    if (trimmed.includes('%23') || trimmed.includes('%26') || trimmed.includes('%3D') || trimmed.includes('%3F') || trimmed.includes('%2F') || trimmed.includes('%7C')) {
      try {
        const decoded = decodeURIComponent(trimmed);
        if (decoded && decoded !== trimmed) {
          trimmed = decoded;
          continue;
        }
      } catch {
        break;
      }
    }
    break;
  }

  // 3. Extract potential candidates
  const candidates: string[] = [];

  if (trimmed.includes('qps=')) {
    const parts = trimmed.split(/qps=/i);
    for (let i = 1; i < parts.length; i++) {
      let rawCandidate = parts[i];
      const nextAmpIndex = rawCandidate.search(/&[a-z0-9_-]+=/i);
      if (nextAmpIndex !== -1) {
        rawCandidate = rawCandidate.slice(0, nextAmpIndex);
      }
      const ampIdx = rawCandidate.indexOf('&');
      if (ampIdx !== -1) {
        rawCandidate = rawCandidate.slice(0, ampIdx);
      }
      rawCandidate = rawCandidate.replace(/^[<"'(]+|[>"')\],;.]+$/g, '').trim();
      candidates.push(rawCandidate);
      candidates.push(rawCandidate.replace(/\s+/g, ''));
    }
  } else if (trimmed.startsWith('#')) {
    const raw = trimmed.slice(1);
    candidates.push(raw);
    candidates.push(raw.replace(/\s+/g, ''));
  } else {
    candidates.push(trimmed);
    candidates.push(trimmed.replace(/\s+/g, ''));
  }

  for (let cand of candidates) {
    if (!cand) continue;
    cand = cand.replace(/^[<"'(]+|[>"')\],;.]+$/g, '').trim();

    // Try XOR decryption with key '$'
    try {
      const decrypted = xorDecrypt(cand, '$');
      if (decrypted) {
        const decompressed = LZString.decompressFromEncodedURIComponent(decrypted);
        if (decompressed) {
          const parsed = JSON.parse(decompressed);
          if (parsed && (parsed.schema === 'family-quiz-participant-answers-v1' || Array.isArray(parsed.participants) || Array.isArray(parsed.answers))) {
            return {
              schema: 'family-quiz-participant-answers-v1',
              createdAt: parsed.createdAt || new Date().toISOString(),
              quizId: parsed.quizId,
              walkId: parsed.walkId,
              title: parsed.title,
              participants: Array.isArray(parsed.participants) ? parsed.participants : [],
              answers: Array.isArray(parsed.answers) ? parsed.answers : []
            };
          }
        }
      }
    } catch {
      // ignore
    }

    // Try direct LZString decompress
    try {
      let directClean = cand;
      for (let i = 0; i < 3 && directClean.includes('%'); i++) {
        try {
          directClean = decodeURIComponent(directClean);
        } catch {
          // ignore
        }
      }
      const decompressed = LZString.decompressFromEncodedURIComponent(directClean);
      if (decompressed) {
        const parsed = JSON.parse(decompressed);
        if (parsed && (parsed.schema === 'family-quiz-participant-answers-v1' || Array.isArray(parsed.participants) || Array.isArray(parsed.answers))) {
          return {
            schema: 'family-quiz-participant-answers-v1',
            createdAt: parsed.createdAt || new Date().toISOString(),
            quizId: parsed.quizId,
            walkId: parsed.walkId,
            title: parsed.title,
            participants: Array.isArray(parsed.participants) ? parsed.participants : [],
            answers: Array.isArray(parsed.answers) ? parsed.answers : []
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Checks if incoming answers match the active quiz (by quizId, template id, or title).
 */
export function isQuizMatch(payload: ParticipantAnswerPayload, activeQuiz: QuizConfig): boolean {
  if (!payload.quizId || !activeQuiz.quizId) return true;
  if (payload.quizId === activeQuiz.quizId) return true;
  if (payload.quizId === 'default-quiz-template' || activeQuiz.quizId === 'default-quiz-template') return true;
  if (payload.title && activeQuiz.title) {
    const normPayloadTitle = normalizeParticipantNameForCompare(payload.title);
    const normActiveTitle = normalizeParticipantNameForCompare(activeQuiz.title);
    if (normPayloadTitle === normActiveTitle && normActiveTitle.length > 0) return true;
  }
  return false;
}

/**
 * Merges incoming participants and answers with base session.
 * Replaces the initial untouched default participant ("Jag" with 0 answers)
 * so incoming participants appear cleanly.
 */
export function mergeParticipantAnswers(
  baseParticipants: Participant[],
  baseAnswers: AnswerRecord[],
  incomingParticipants: Participant[],
  incomingAnswers: AnswerRecord[],
  fallbackDefaultName = 'Deltagare'
): { participants: Participant[]; answers: AnswerRecord[] } {
  // If base session only has an empty default participant with 0 answers,
  // we replace the empty default placeholder with incoming participants.
  const isBaseEmptyDefault =
    baseParticipants.length === 1 &&
    (baseParticipants[0].id === 'default-du' || baseParticipants[0].uniqueId === DEFAULT_PARTICIPANT_UNIQUE_ID) &&
    baseAnswers.length === 0;

  const targetBaseParticipants = isBaseEmptyDefault ? [] : [...baseParticipants];
  const targetBaseAnswers = isBaseEmptyDefault ? [] : [...baseAnswers];

  const uniqueIdMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  const mergedParticipants = [...targetBaseParticipants];
  const mergedAnswers = [...targetBaseAnswers];

  for (const participant of mergedParticipants) {
    if (participant.uniqueId && participant.uniqueId !== DEFAULT_PARTICIPANT_UNIQUE_ID) {
      uniqueIdMap.set(participant.uniqueId, participant.id);
    }
    const nameKey = `${normalizeParticipantNameForCompare(participant.name)}|${participant.type}`;
    if (!nameMap.has(nameKey)) nameMap.set(nameKey, participant.id);
  }

  for (const incoming of incomingParticipants) {
    // 1. Match by uniqueId if non-default
    let existingParticipantId =
      (incoming.uniqueId && incoming.uniqueId !== DEFAULT_PARTICIPANT_UNIQUE_ID && uniqueIdMap.get(incoming.uniqueId)) ||
      undefined;

    // 2. Match by normalized name + type ONLY if not a generic/reserved name like "Jag"
    const nameKey = `${normalizeParticipantNameForCompare(incoming.name)}|${incoming.type}`;
    if (!existingParticipantId && nameMap.has(nameKey)) {
      if (!isReservedParticipantName(incoming.name)) {
        existingParticipantId = nameMap.get(nameKey);
      }
    }

    const targetParticipantId = existingParticipantId || crypto.randomUUID();

    if (!existingParticipantId) {
      let finalName = (incoming.name || '').trim() || fallbackDefaultName;
      const countWithSameName = mergedParticipants.filter(
        p => normalizeParticipantNameForCompare(p.name) === normalizeParticipantNameForCompare(finalName)
      ).length;

      if (countWithSameName > 0) {
        finalName = `${finalName} (${countWithSameName + 1})`;
      }

      const newParticipant: Participant = {
        ...incoming,
        name: finalName,
        id: targetParticipantId,
        uniqueId: incoming.uniqueId || crypto.randomUUID()
      };
      mergedParticipants.push(newParticipant);
      if (newParticipant.uniqueId) {
        uniqueIdMap.set(newParticipant.uniqueId, newParticipant.id);
      }
      nameMap.set(`${normalizeParticipantNameForCompare(newParticipant.name)}|${newParticipant.type}`, newParticipant.id);
    }

    // Attach/update incoming answers for this participant
    const answersForThisParticipant = incomingAnswers.filter(a => a.participantId === incoming.id);
    for (const answer of answersForThisParticipant) {
      const existingIdx = mergedAnswers.findIndex(
        a => a.participantId === targetParticipantId && a.questionIndex === answer.questionIndex
      );
      if (existingIdx !== -1) {
        mergedAnswers[existingIdx] = { ...answer, participantId: targetParticipantId };
      } else {
        mergedAnswers.push({ ...answer, participantId: targetParticipantId });
      }
    }
  }

  return { participants: mergedParticipants, answers: mergedAnswers };
}
