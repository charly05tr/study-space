import { streamStructured } from '../../ai/api/gemini.api';
import type { StreamOptions } from '../../ai/api/gemini.api';
import {
  QUIZ_SCHEMA,
  QUIZ_SYSTEM_INSTRUCTION,
  buildQuizPrompt,
  parseGeneratedQuiz,
} from '../prompts/quizGeneration';
import type { GeneratedQuiz, PartialGeneratedQuiz, QuizRequest } from '../prompts/quizGeneration';

/** A little above the review's: questions should vary, but stay faithful to the source. */
const QUIZ_TEMPERATURE = 0.4;

/**
 * Asks Gemini for a quiz from the checked annotations. Called from the browser
 * with the user's own key. Resolves to a validated quiz with at least one
 * question; anything else rejects, so a half quiz is never handed on to be saved.
 */
export const streamQuizGeneration = async (
  key: string,
  model: string,
  request: QuizRequest,
  { signal, onPartial }: StreamOptions<PartialGeneratedQuiz> = {},
): Promise<GeneratedQuiz> => {
  const prompt = buildQuizPrompt(request);
  const annotationIds = new Set(request.annotations.map((annotation) => annotation.id));

  return streamStructured<GeneratedQuiz, PartialGeneratedQuiz>(key, model, {
    signal,
    onPartial,
    systemInstruction: QUIZ_SYSTEM_INSTRUCTION,
    prompt,
    schema: QUIZ_SCHEMA,
    temperature: QUIZ_TEMPERATURE,
    parse: (raw) =>
      parseGeneratedQuiz(raw, {
        count: request.count,
        types: request.types,
        annotationIds,
        fallbackTitle: request.topic.trim(),
      }),
    declinedMessage: 'Gemini declined to write a quiz from this material.',
    cutOffMessage: 'The quiz was cut off. Try asking for fewer questions.',
  });
};
