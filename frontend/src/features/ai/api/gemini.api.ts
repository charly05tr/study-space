import {
  REVIEW_SYSTEM_INSTRUCTION,
  WRITING_REVIEW_SCHEMA,
  buildReviewPrompt,
  parseWritingReview,
} from '../prompts/writingReview';
import type { GeminiModel, WritingReview } from '../types';

// Called straight from the browser, not through the backend: the user's key
// never touches our server.
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Carries a message that is already safe and readable to show the user. */
export class GeminiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

const errorDetail = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    const message = (body as { error?: { message?: unknown } })?.error?.message;
    return typeof message === 'string' ? message : '';
  } catch {
    return '';
  }
};

export const messageForStatus = (status: number, detail: string): string => {
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(detail))) {
    return 'Gemini rejected this API key. Check that it is correct and has access to the Gemini API.';
  }
  if (status === 429) {
    return 'Gemini quota exceeded. Wait a moment or check your plan limits in Google AI Studio.';
  }
  if (status >= 500) return 'Gemini is temporarily unavailable. Please try again later.';
  return detail
    ? `Gemini could not process the request: ${detail}`
    : 'Gemini could not process the request.';
};

const request = async (path: string, key: string, init?: RequestInit): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, 'x-goog-api-key': key },
    });
  } catch {
    throw new GeminiError('Could not reach Gemini. Check your internet connection.');
  }

  if (!response.ok) {
    throw new GeminiError(
      messageForStatus(response.status, await errorDetail(response)),
      response.status,
    );
  }
  return response.json();
};

interface RawModel {
  name?: unknown;
  displayName?: unknown;
  supportedGenerationMethods?: unknown;
}

const isUsable = (model: RawModel): model is RawModel & { name: string } =>
  typeof model.name === 'string' &&
  model.name.startsWith('models/gemini') &&
  Array.isArray(model.supportedGenerationMethods) &&
  model.supportedGenerationMethods.includes('generateContent');

/**
 * Lists the models this key can call. Doubles as the connection test: it costs
 * nothing, and it fails the same way a real review would on a bad key.
 */
export const listModels = async (key: string): Promise<GeminiModel[]> => {
  const models: GeminiModel[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);

    const page = (await request(`/models?${query}`, key)) as {
      models?: RawModel[];
      nextPageToken?: string;
    };

    for (const model of page.models ?? []) {
      if (!isUsable(model)) continue;
      models.push({
        name: model.name,
        displayName: typeof model.displayName === 'string' ? model.displayName : model.name,
      });
    }
    pageToken = page.nextPageToken || undefined;
  } while (pageToken);

  return models;
};

const DECLINED_REASONS = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION']);

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export const reviewWriting = async (
  key: string,
  model: string,
  text: string,
): Promise<WritingReview> => {
  const data = (await request(`/${model}:generateContent`, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: REVIEW_SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildReviewPrompt(text) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: WRITING_REVIEW_SCHEMA,
        temperature: 0.3,
      },
    }),
  })) as GenerateResponse;

  const declined = 'Gemini declined to review this note.';
  const cutOff = 'The review was cut off. Try a shorter note or selection.';

  if (data.promptFeedback?.blockReason) throw new GeminiError(declined);

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && DECLINED_REASONS.has(finishReason)) throw new GeminiError(declined);

  const output = candidate?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!output) {
    throw new GeminiError(
      finishReason === 'MAX_TOKENS' ? cutOff : 'Gemini returned an empty response. Please try again.',
    );
  }

  try {
    return parseWritingReview(output);
  } catch (error) {
    // A truncated response is unparsable JSON; say why instead of "not valid".
    if (finishReason === 'MAX_TOKENS') throw new GeminiError(cutOff);
    throw error;
  }
};

/** Readable text for any failure, whether ours or an unexpected throw. */
export const getAiErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
