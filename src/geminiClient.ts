async function getGeminiSdk(apiKey: string) {
  const { GoogleGenAI, Type } = await import('@google/genai');
  return { ai: new GoogleGenAI({ apiKey }), Type };
}

async function generateContentWithFallback(ai: any, options: { contents: any; config?: any }) {
  const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        ...options,
        model,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed, trying fallback...`, err?.message || err);
    }
  }
  throw lastError || new Error("All Gemini model fallbacks failed.");
}

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem('gemini_api_key') || ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || '';
  } catch {
    return ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || '';
  }
}

export function setStoredApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('gemini_api_key', key.trim());
    } catch (e) {
      console.warn('Unable to persist API key to localStorage', e);
    }
  }
}

export function getStoredAiUseImages(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('gemini_ai_use_images') === 'true';
  } catch {
    return false;
  }
}

export function setStoredAiUseImages(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('gemini_ai_use_images', enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Unable to persist AI image setting to localStorage', e);
    }
  }
}

export async function generateQuizClient(params: {
  topics: string;
  count: number;
  target: 'barn' | 'vuxen' | 'båda';
  lang: string;
  ageFrom?: number;
  ageTo?: number;
  apiKey?: string;
  geotagLandmarks?: boolean;
  includeImages?: boolean;
  targetLanguages?: string[];
}) {
  const apiKey = params.apiKey || getStoredApiKey();
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const { ai, Type } = await getGeminiSdk(apiKey);
  const { topics, count, target, lang, ageFrom = 5, ageTo = 10, geotagLandmarks = false, includeImages = false, targetLanguages = [] } = params;
  const currentLang = lang || 'sv';

  const isBarn = target === 'barn' || target === 'båda';
  const isVuxen = target === 'vuxen' || target === 'båda';

  const langNames: Record<string, string> = {
    sv: 'Swedish',
    fr: 'French',
    en: 'English',
    es: 'Spanish',
    de: 'German',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
    it: 'Italian',
    et: 'Estonian',
    lv: 'Latvian',
    lt: 'Lithuanian',
    uk: 'Ukrainian',
    nl: 'Dutch',
    is: 'Icelandic',
    se: 'Northern Sami'
  };
  const targetLangName = langNames[currentLang] || 'Swedish';

  let prompt = `Create a quiz with the theme "${topics}". The questions and answers MUST be in ${targetLangName}. 
  
  You MUST return valid JSON. Do NOT use "answers" as a key.
  Use the following structure for each question:
  {
    "text": "Question text",
    "options": ["Option 1", "Option 2", "Option 3"],
    "correctAnswer": 0
  }
  "correctAnswer" MUST be a 0-based integer index of the correct option in the "options" array.
  \n`;

  if (geotagLandmarks) {
    prompt += `GEOTAGGING & REAL-WORLD COORDINATES REQUIREMENT:
If the questions are about or mention specific real-world places, landmarks, monuments, museums, historical buildings, parks, stations, or geographical locations (e.g. "Eiffel Tower", "Stockholm Palace", "Big Ben", "Colosseum", "Central Park", "Skansen", "Liseberg", "Vasa Museum"):
For each such question, you MUST provide its real-world GPS coordinates:
- "latitude": float (WGS84 decimal degrees, e.g. 59.3268)
- "longitude": float (WGS84 decimal degrees, e.g. 18.0717)
- "locationName": a concise name of the landmark/location (e.g. "Stockholms slott")
If a question is general trivia without a specific physical place, set latitude to 0 and longitude to 0 or leave them null.\n`;
  }

  if (includeImages) {
    prompt += `IMAGES REQUIREMENT (FOR QUESTIONS AND ANSWERS):
You have the ability to include high-quality, illustrative images for questions and/or individual answer options:
1. Question Image ("imageUrl"): If the question is about an object, animal, flag, person, landmark, artwork, scientific diagram, or visual puzzle, provide a direct, clean image URL (e.g. from Wikimedia Commons, Unsplash direct URLs like "https://images.unsplash.com/photo-..." or reliable public web sources, or a clean SVG data URI like "data:image/svg+xml;utf8,..."). If no image is needed, set imageUrl to null or empty string.
2. Option Images ("optionImages"): When an option is visual (e.g. "Which flag belongs to Sweden?", "Which bird is an eagle?", "Select the painting by Van Gogh", shapes, colors, flags, animals), provide an array of image URLs corresponding 1-to-1 with the options array. If an option does not have an image, put null or empty string for that index.
Ensure URLs are valid and safe.\n`;
  }

  if (target === 'båda') {
    prompt += `Create a total of ${count} questions for children (approx. ${ageFrom}-${ageTo} years old) and ${count} questions for adults (more challenging).`;
  } else if (target === 'barn') {
    prompt += `Create a total of ${count} questions for children (approx. ${ageFrom}-${ageTo} years old).`;
  } else {
    prompt += `Create a total of ${count} questions for adults (challenging but fun).`;
  }

  const questionItemProperties: any = {
    text: { type: Type.STRING },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
    correctAnswer: { type: Type.INTEGER }
  };
  if (geotagLandmarks) {
    questionItemProperties.latitude = { type: Type.NUMBER };
    questionItemProperties.longitude = { type: Type.NUMBER };
    questionItemProperties.locationName = { type: Type.STRING };
  }
  if (includeImages) {
    questionItemProperties.imageUrl = { type: Type.STRING };
    questionItemProperties.optionImages = { type: Type.ARRAY, items: { type: Type.STRING } };
  }

  const properties: any = {};
  const required: string[] = [];

  if (isBarn) {
    properties.barnQuestions = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: questionItemProperties,
        required: ["text", "options", "correctAnswer"]
      }
    };
    required.push("barnQuestions");
  }

  if (isVuxen) {
    properties.vuxenQuestions = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: questionItemProperties,
        required: ["text", "options", "correctAnswer"]
      }
    };
    required.push("vuxenQuestions");
  }

  const response = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties,
        required
      }
    }
  });

  const quizData = JSON.parse(response.text || "{}");

  const mapQuestion = (q: any) => {
    const hasCoords = typeof q.latitude === 'number' && typeof q.longitude === 'number' && (Math.abs(q.latitude) > 0.0001 || Math.abs(q.longitude) > 0.0001);
    const rawImageUrl = typeof q.imageUrl === 'string' && q.imageUrl.trim() ? q.imageUrl.trim() : undefined;
    const rawOptionImages = Array.isArray(q.optionImages) && q.optionImages.some((img: any) => typeof img === 'string' && img.trim())
      ? q.optionImages.map((img: any) => typeof img === 'string' && img.trim() ? img.trim() : undefined)
      : undefined;

    return {
      ...q,
      id: Math.random().toString(36).substring(2, 9),
      options: q.options || [],
      imageUrl: rawImageUrl,
      optionImages: rawOptionImages,
      correctAnswers: [typeof q.correctAnswer === 'number' ? q.correctAnswer : 0],
      originalLanguage: currentLang,
      location: hasCoords ? {
        lat: q.latitude,
        lng: q.longitude,
        name: q.locationName || undefined
      } : undefined
    };
  };

  async function processImages(questions: any[]) {
    for (const q of questions) {
      if (q.imageUrl && q.imageUrl.startsWith("http")) {
        try {
          const response = await fetch(`/api/image-to-base64?url=${encodeURIComponent(q.imageUrl)}`);
          if (response.ok) {
            const data = await response.json();
            q.imageUrl = data.base64;
          }
        } catch (e) {
          console.error("Failed to convert image to base64", e);
        }
      }
      if (q.optionImages) {
        for (let i = 0; i < q.optionImages.length; i++) {
          if (q.optionImages[i] && q.optionImages[i].startsWith("http")) {
            try {
              const response = await fetch(`/api/image-to-base64?url=${encodeURIComponent(q.optionImages[i])}`);
              if (response.ok) {
                const data = await response.json();
                q.optionImages[i] = data.base64;
              }
            } catch (e) {
              console.error("Failed to convert image to base64", e);
            }
          }
        }
      }
    }
  }

  if (quizData.barnQuestions) {
    quizData.barnQuestions = quizData.barnQuestions.map(mapQuestion);
    await processImages(quizData.barnQuestions);
  }
  if (quizData.vuxenQuestions) {
    quizData.vuxenQuestions = quizData.vuxenQuestions.map(mapQuestion);
    await processImages(quizData.vuxenQuestions);
  }

  // If additional languages were requested, translate all generated questions upfront!
  const extraLanguages = targetLanguages.filter(l => l && l !== currentLang);
  const allGenerated = [
    ...(quizData.barnQuestions || []),
    ...(quizData.vuxenQuestions || [])
  ];

  if (extraLanguages.length > 0 && allGenerated.length > 0) {
    const questionsToTranslate = allGenerated.map(q => ({
      id: q.id,
      text: q.text,
      options: q.options || [],
      originalLanguage: currentLang
    }));

    for (const tgtLang of extraLanguages) {
      try {
        const transResult = await translateQuestionsClient(questionsToTranslate, tgtLang, apiKey);
        if (transResult.translations && Array.isArray(transResult.translations)) {
          for (const item of transResult.translations) {
            const bQ = quizData.barnQuestions?.find((bq: any) => bq.id === item.id);
            if (bQ) {
              bQ.translations = bQ.translations || {};
              bQ.translations[tgtLang] = {
                text: item.text,
                options: item.options || bQ.options
              };
            }
            const vQ = quizData.vuxenQuestions?.find((vq: any) => vq.id === item.id);
            if (vQ) {
              vQ.translations = vQ.translations || {};
              vQ.translations[tgtLang] = {
                text: item.text,
                options: item.options || vQ.options
              };
            }
          }
        }
      } catch (err) {
        console.warn(`Could not pre-translate generated questions to ${tgtLang}:`, err);
      }
    }
  }

  return quizData;
}

export async function batchTranslateQuizQuestions(params: {
  questions: Array<{ id: string; text: string; options?: string[]; originalLanguage?: string; translations?: Record<string, { text: string; options: string[] }> }>;
  targetLanguages: string[];
  apiKey?: string;
  onProgress?: (current: number, total: number, langCode: string) => void;
}) {
  const { questions, targetLanguages, apiKey = getStoredApiKey(), onProgress } = params;
  if (!apiKey) throw new Error("MISSING_API_KEY");
  if (!questions || questions.length === 0 || !targetLanguages || targetLanguages.length === 0) {
    return questions;
  }

  const updatedQuestions = JSON.parse(JSON.stringify(questions));
  const totalOperations = targetLanguages.length;
  let completedOperations = 0;

  for (const tgtLang of targetLanguages) {
    // Filter questions that need translation for this language
    const questionsToTranslate = updatedQuestions.filter((q: any) => {
      const orig = q.originalLanguage || 'sv';
      return orig !== tgtLang && (!q.translations || !q.translations[tgtLang]);
    });

    if (questionsToTranslate.length > 0) {
      try {
        const transPayload = questionsToTranslate.map((q: any) => ({
          id: q.id,
          text: q.text,
          options: q.options || [],
          originalLanguage: q.originalLanguage || 'sv'
        }));

        const result = await translateQuestionsClient(transPayload, tgtLang, apiKey);
        if (result.translations && Array.isArray(result.translations)) {
          for (const item of result.translations) {
            const targetQ = updatedQuestions.find((q: any) => q.id === item.id);
            if (targetQ) {
              targetQ.translations = targetQ.translations || {};
              targetQ.translations[tgtLang] = {
                text: item.text,
                options: item.options || targetQ.options
              };
            }
          }
        }
      } catch (err) {
        console.error(`Batch translation failed for language ${tgtLang}:`, err);
      }
    }

    completedOperations++;
    if (onProgress) {
      onProgress(completedOperations, totalOperations, tgtLang);
    }
  }

  return updatedQuestions;
}

export async function translateQuestionsClient(
  questions: Array<{ id: string; text: string; options?: string[]; originalLanguage?: string }>,
  targetLanguage: string,
  apiKeyOverride?: string
) {
  const apiKey = apiKeyOverride || getStoredApiKey();
  if (!apiKey) {
    return { translations: [] };
  }

  if (!questions || questions.length === 0) {
    return { translations: [] };
  }

  const { ai, Type } = await getGeminiSdk(apiKey);

  const prompt = `Translate the following quiz questions and options directly into target language code: "${targetLanguage}".
Each question object has an "id", "text", "originalLanguage", and optional "options".
Translate "text" and each option in "options" accurately into target language "${targetLanguage}".
Keep the exact same "id" for each question. Preserve the original meaning and order of options.`;

  const response = await generateContentWithFallback(ai, {
    contents: prompt + "\nInput Questions JSON:\n" + JSON.stringify(questions),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "text"]
            }
          }
        },
        required: ["translations"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return data;
}

/**
 * Validates a user's text answer against a target word using the Gemini Linguistic Validation Engine.
 */
export async function validateTextAnswerWithGemini(params: {
  userInput: string;
  targetWord: string;
  acceptedAlternatives?: string[];
  language?: string;
  apiKey?: string;
}): Promise<{
  match: boolean;
  confidence: number;
  detected_language: 'sv' | 'en' | 'de' | 'fr' | 'es' | 'no' | 'da' | 'fi' | 'it' | 'et' | 'lv' | 'lt' | 'uk' | 'is' | 'se' | 'nl' | 'be';
}> {
  const apiKey = params.apiKey || getStoredApiKey();
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const { ai, Type } = await getGeminiSdk(apiKey);
  const { userInput, targetWord, acceptedAlternatives = [] } = params;

  const prompt = `You are a linguistic validation engine for a multi-lingual Progressive Web App (PWA). Your job is to determine if a user's input matches a specific target word or concept, even if the user has made severe spelling or grammatical errors typical of dyslexia.

Support these European languages: Swedish, English, German, French, Spanish, Norwegian, Danish, Finnish, Italian, Estonian, Latvian, Lithuanian, Ukrainian, Icelandic, Northern Sami, Dutch, and Belgian Dutch/Flemish.

Apply the following evaluation rules to the user's input:
1. Ignore case sensitivity completely (e.g., "aba" should match "Abba").
2. Ignore missing, extra, or swapped double consonants (e.g., "aba" or "abbba" matches "Abba"; "alene" matches "alleine").
3. Ignore missing or incorrect diacritics/accents (e.g., "ee" or "e" for "é"/"è" in French, missing "umlauts" ä/ö/ü in German/Swedish, missing "ñ" or accents in Spanish, ā/č/ē/ģ/ī/ķ/ļ/ņ/š/ū/ž in Latvian, ą/č/ę/ė/į/š/ų/ū/ž in Lithuanian, ä/ö/õ/ü in Estonian, і/ї/є in Ukrainian).
4. Forgive character transpositions/swaps (e.g., "baab" instead of "barn", "teh" instead of "the").
5. Forgive phonetic substitutions common in the specific language.

Allow a general fuzziness/error margin of up to 30-35% of the target word's length.

User Input: "${userInput}"
Target Word: "${targetWord}"
${acceptedAlternatives.length > 0 ? `Accepted Alternatives: ${JSON.stringify(acceptedAlternatives)}` : ''}

CRITICAL: You must always respond in a strict, minified JSON format. Do not include any conversational text, markdown formatting (like \`\`\`json), or explanations. 

Output structure:
{
  "match": boolean,
  "confidence": float (0.0 to 1.0),
  "detected_language": "sv" | "en" | "de" | "fr" | "es" | "no" | "da" | "fi" | "it" | "et" | "lv" | "lt" | "uk"
}`;

  const response = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          match: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
          detected_language: { 
            type: Type.STRING,
            enum: ["sv", "en", "de", "fr", "es", "no", "da", "fi", "it", "et", "lv", "lt", "uk"]
          }
        },
        required: ["match", "confidence", "detected_language"]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  return {
    match: Boolean(parsed.match),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    detected_language: parsed.detected_language || 'sv'
  };
}

/**
 * Finds exact GPS coordinates and place name for a question or place query using Gemini.
 */
export async function findLocationCoordinatesWithGemini(
  textOrPlace: string,
  apiKeyOverride?: string
): Promise<{ lat: number; lng: number; name: string } | null> {
  const apiKey = apiKeyOverride || getStoredApiKey();
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const { ai, Type } = await getGeminiSdk(apiKey);
  const prompt = `Identify the real-world place, landmark, building, park, museum, city, or location mentioned or referred to in the following text/question.
Find its precise real-world GPS coordinates (WGS84 decimal latitude and longitude) and a clean place name.

Text/Question: "${textOrPlace}"

If a specific location or landmark can be identified, provide its coordinates. If the text has no connection to any physical place on Earth, return found: false.`;

  const response = await generateContentWithFallback(ai, {
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          found: { type: Type.BOOLEAN },
          name: { type: Type.STRING },
          latitude: { type: Type.NUMBER },
          longitude: { type: Type.NUMBER }
        },
        required: ["found"]
      }
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  if (parsed.found && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number' && (Math.abs(parsed.latitude) > 0.0001 || Math.abs(parsed.longitude) > 0.0001)) {
    return {
      lat: parsed.latitude,
      lng: parsed.longitude,
      name: parsed.name || textOrPlace.substring(0, 40)
    };
  }
  return null;
}
