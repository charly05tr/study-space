import { Allow, parse as parsePartialJson } from 'partial-json';
import {
  REVIEW_SYSTEM_INSTRUCTION,
  WRITING_REVIEW_SCHEMA,
  buildReviewPrompt,
  parseWritingReview,
} from '../prompts/writingReview';
import type { GeminiModel, PartialWritingReview, WritingReview } from '../types';

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

/** True when the failure is a cancelled request, not a real error. */
export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const send = async (path: string, key: string, init?: RequestInit): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...init?.headers, 'x-goog-api-key': key },
    });
  } catch (error) {
    // A cancelled request is not a connection problem; callers tell them apart.
    if (isAbortError(error)) throw error;
    throw new GeminiError('Could not reach Gemini. Check your internet connection.');
  }

  if (!response.ok) {
    throw new GeminiError(
      messageForStatus(response.status, await errorDetail(response)),
      response.status,
    );
  }
  return response;
};

const request = async (path: string, key: string, init?: RequestInit): Promise<unknown> =>
  (await send(path, key, init)).json();

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

interface GenerateChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: unknown; message?: unknown };
}

/** Options every streamed generation accepts; `TPartial` is what `onPartial` receives. */
export interface StreamOptions<TPartial> {
  signal?: AbortSignal;
  /** Called after each chunk with whatever the text so far parses to. */
  onPartial?: (partial: TPartial) => void;
}

/** What one structured generation needs; the transport is shared by every feature. */
export interface StructuredRequest<TResult, TPartial> extends StreamOptions<TPartial> {
  systemInstruction: string;
  /** The user message: untrusted content, already delimited by the caller. */
  prompt: string;
  /** Gemini `responseSchema` (OpenAPI subset). */
  schema: object;
  temperature: number;
  /** Turns the final text into a validated result, or throws. */
  parse: (raw: string) => TResult;
  /** Shown when Gemini refuses to answer. */
  declinedMessage: string;
  /** Shown when the answer was truncated by the output limit. */
  cutOffMessage: string;
}

/** Parses one `data:` payload; a stream can carry an error object instead of a chunk. */
const parseChunk = (payload: string): GenerateChunk => {
  let chunk: GenerateChunk;
  try {
    chunk = JSON.parse(payload) as GenerateChunk;
  } catch {
    throw new GeminiError('The AI response was not valid. Please try again.');
  }
  if (chunk.error) {
    const { code, message } = chunk.error;
    throw new GeminiError(
      messageForStatus(typeof code === 'number' ? code : 500, typeof message === 'string' ? message : ''),
    );
  }
  return chunk;
};

/** Tolerates a half-written value; returns null while the text is not yet parsable. */
const parsePartialObject = <TPartial>(text: string): TPartial | null => {
  try {
    // No `Allow.NUM`: a score cut mid-digit ("1" of 10) is dropped, not shown.
    const value: unknown = parsePartialJson(text, Allow.STR | Allow.OBJ | Allow.ARR);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as TPartial)
      : null;
  } catch {
    return null;
  }
};

/**
 * Streams one structured generation over SSE. `onPartial` receives growing
 * snapshots; the return value is the final, validated result, with the same
 * errors as a single call. A cancelled `signal` rejects with the native
 * AbortError, not a GeminiError.
 */
export const streamStructured = async <TResult, TPartial>(
  key: string,
  model: string,
  {
    systemInstruction,
    prompt,
    schema,
    temperature,
    parse,
    declinedMessage,
    cutOffMessage,
    signal,
    onPartial,
  }: StructuredRequest<TResult, TPartial>,
): Promise<TResult> => {
  const response = await send(`/${model}:streamGenerateContent?alt=sse`, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature,
      },
    }),
  });

  if (!response.body) throw new GeminiError('Gemini returned an empty response. Please try again.');

  let output = '';
  let finishReason: string | undefined;
  let blocked = false;

  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;

    const chunk = parseChunk(payload);
    if (chunk.promptFeedback?.blockReason) blocked = true;
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    output += candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    const partial = output ? parsePartialObject<TPartial>(output) : null;
    if (partial) onPartial?.(partial);
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // A network chunk can end mid-line, so keep the unfinished tail for the next read.
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line.replace(/\r$/, ''));
    }
    buffer += decoder.decode();
    handleLine(buffer.replace(/\r$/, ''));
  } catch (error) {
    // Stop downloading a body nobody will read (an abort already closed it).
    await reader.cancel().catch(() => {});
    if (isAbortError(error) || error instanceof GeminiError) throw error;
    throw new GeminiError('Could not reach Gemini. Check your internet connection.');
  } finally {
    reader.releaseLock();
  }

  if (blocked) throw new GeminiError(declinedMessage);
  if (finishReason && DECLINED_REASONS.has(finishReason)) throw new GeminiError(declinedMessage);

  if (!output) {
    throw new GeminiError(
      finishReason === 'MAX_TOKENS'
        ? cutOffMessage
        : 'Gemini returned an empty response. Please try again.',
    );
  }

  try {
    return parse(output);
  } catch (error) {
    // A truncated response is unparsable JSON; say why instead of "not valid".
    if (finishReason === 'MAX_TOKENS') throw new GeminiError(cutOffMessage);
    throw error;
  }
};

/** Low: feedback on a note should be consistent and stick to what the note says. */
const REVIEW_TEMPERATURE = 0.3;

/** Streams a writing review; see `streamStructured` for the contract. */
export const streamReviewWriting = (
  key: string,
  model: string,
  text: string,
  options: StreamOptions<PartialWritingReview> = {},
): Promise<WritingReview> =>
  streamStructured<WritingReview, PartialWritingReview>(key, model, {
    ...options,
    systemInstruction: REVIEW_SYSTEM_INSTRUCTION,
    prompt: buildReviewPrompt(text),
    schema: WRITING_REVIEW_SCHEMA,
    temperature: REVIEW_TEMPERATURE,
    parse: parseWritingReview,
    declinedMessage: 'Gemini declined to review this note.',
    cutOffMessage: 'The review was cut off. Try a shorter note or selection.',
  });

/** Readable text for any failure, whether ours or an unexpected throw. */
export const getAiErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
