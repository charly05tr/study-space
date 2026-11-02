import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, isAbortError, listModels, streamReviewWriting } from './gemini.api';

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const mockFetch = (...responses: Response[]) => {
  const fn = vi.fn();
  for (const response of responses) fn.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => vi.unstubAllGlobals());

describe('listModels', () => {
  it('keeps gemini models that can generate content, across pages', async () => {
    const fetchMock = mockFetch(
      respond({
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
        ],
        nextPageToken: 'next',
      }),
      respond({
        models: [
          { name: 'models/gemini-2.5-pro', displayName: 'Pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embed', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    );

    const models = await listModels('KEY');

    expect(models.map((m) => m.name)).toEqual(['models/gemini-2.5-flash', 'models/gemini-2.5-pro']);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=next');
  });

  it('sends the key in a header, never in the URL', async () => {
    const fetchMock = mockFetch(respond({ models: [] }));
    await listModels('SECRET');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('SECRET');
    expect(init.headers['x-goog-api-key']).toBe('SECRET');
  });

  it.each([
    [400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, /rejected this API key/],
    [403, {}, /rejected this API key/],
    [429, {}, /quota/],
    [503, {}, /unavailable/],
  ])('maps HTTP %i to a readable message', async (status, body, message) => {
    mockFetch(respond(body, status));
    await expect(listModels('K')).rejects.toThrow(message);
  });

  it('maps a network failure to a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listModels('K')).rejects.toBeInstanceOf(GeminiError);
    await expect(listModels('K')).rejects.toThrow(/Could not reach Gemini/);
  });
});

const encoder = new TextEncoder();

/** An SSE response whose body arrives as the given raw chunks. */
const sse = (chunks: string[], status = 200) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status },
  );

const event = (text: string, extra: Record<string, unknown> = {}) =>
  `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...extra }] })}\n\n`;

describe('streamReviewWriting', () => {
  const review = {
    language: 'English',
    scores: { grammar: 9, vocabulary: 8, topicMastery: 7 },
    strengths: ['Clear'],
    issues: [],
    summary: 'Fine.',
  };
  const json = JSON.stringify(review);

  it('streams from the SSE endpoint with JSON output and the key in a header', async () => {
    const fetchMock = mockFetch(sse([event(json)]));

    expect(await streamReviewWriting('SECRET', 'models/gemini-2.5-flash', 'some note')).toEqual(review);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(String(url)).not.toContain('SECRET');
    expect(init.headers['x-goog-api-key']).toBe('SECRET');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('sends the instructions as systemInstruction, not in the user content', async () => {
    const fetchMock = mockFetch(sse([event(json)]));
    await streamReviewWriting('K', 'models/x', 'my note');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toMatch(/writing tutor/);
    expect(body.contents[0].parts[0].text).toBe('<note>\nmy note\n</note>');
  });

  it('joins events and lines split across network chunks, with growing partials', async () => {
    const stream = [event(json.slice(0, 30)), event(json.slice(30, 80)), event(json.slice(80))].join('');
    // Chunk boundaries land mid-line, not on event boundaries.
    mockFetch(sse([stream.slice(0, 17), stream.slice(17, 120), stream.slice(120)]));
    const onPartial = vi.fn();

    expect(await streamReviewWriting('K', 'models/x', 't', { onPartial })).toEqual(review);

    expect(onPartial.mock.calls.length).toBeGreaterThan(1);
    expect(onPartial.mock.calls[0][0].language).toBe('English');
    expect(onPartial.mock.calls[0][0].summary).toBeUndefined();
    expect(onPartial.mock.calls.at(-1)?.[0].summary).toBe('Fine.');
  });

  it('handles CRLF line endings and a multi-byte character split across chunks', async () => {
    const accented = { ...review, summary: 'Muy bien, información útil.' };
    const bytes = encoder.encode(event(JSON.stringify(accented)).replace(/\n/g, '\r\n'));
    const cut = bytes.findIndex((b) => b > 127) + 1; // inside the first multi-byte char
    mockFetch(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, cut));
            controller.enqueue(bytes.slice(cut));
            controller.close();
          },
        }),
      ),
    );

    expect(await streamReviewWriting('K', 'models/x', 't')).toEqual(accented);
  });

  it('never shows a score that is still being written', async () => {
    mockFetch(sse([event('{"scores":{"grammar":9,"vocabulary":1'), event('0,"topicMastery":5}}')]));
    const onPartial = vi.fn();
    await streamReviewWriting('K', 'models/x', 't', { onPartial });

    expect(onPartial.mock.calls.some(([p]) => p.scores?.vocabulary === 1)).toBe(false);
    expect(onPartial.mock.calls.at(-1)?.[0].scores).toEqual({
      grammar: 9,
      vocabulary: 10,
      topicMastery: 5,
    });
  });

  it('reports a blocked prompt', async () => {
    mockFetch(sse([`data: ${JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })}\n\n`]));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/declined to review this note/);
  });

  it.each(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION'])(
    'reports a %s finish reason as declined',
    async (finishReason) => {
      mockFetch(sse([`data: ${JSON.stringify({ candidates: [{ finishReason }] })}\n\n`]));
      await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/declined to review/);
    },
  );

  it('reports a truncated response when MAX_TOKENS leaves unparsable JSON', async () => {
    mockFetch(sse([event('{"language":', { finishReason: 'MAX_TOKENS' })]));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/cut off/);
  });

  it('still parses a MAX_TOKENS response that is complete JSON', async () => {
    mockFetch(sse([event(json, { finishReason: 'MAX_TOKENS' })]));
    expect(await streamReviewWriting('K', 'models/x', 't')).toEqual(review);
  });

  it('fails readably on an empty response', async () => {
    mockFetch(sse([]));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/empty response/);
  });

  it('surfaces an error event sent mid-stream', async () => {
    mockFetch(
      sse([event(json.slice(0, 10)), `data: ${JSON.stringify({ error: { code: 429, message: 'x' } })}\n\n`]),
    );
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/quota/);
  });

  it('fails readably when the connection drops mid-stream', async () => {
    mockFetch(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(event(json.slice(0, 10))));
            controller.error(new TypeError('network error'));
          },
        }),
      ),
    );
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/Could not reach Gemini/);
  });

  it.each([
    [403, {}, /rejected this API key/],
    [429, {}, /quota/],
    [503, {}, /unavailable/],
  ])('maps HTTP %i to a readable message', async (status, body, message) => {
    mockFetch(respond(body, status));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(message);
  });

  it('maps a network failure to a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toBeInstanceOf(GeminiError);
  });

  it('propagates an abort as AbortError, not as a GeminiError', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(stream) {
                stream.enqueue(encoder.encode(event(json.slice(0, 10))));
                init.signal?.addEventListener('abort', () =>
                  stream.error(new DOMException('Aborted', 'AbortError')),
                );
              },
            }),
          ),
        ),
      ),
    );

    const error = await streamReviewWriting('K', 'models/x', 't', {
      signal: controller.signal,
      onPartial: () => controller.abort(),
    }).catch((e: unknown) => e);

    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(GeminiError);
  });

  it('propagates an abort that rejects the fetch itself', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    const error = await streamReviewWriting('K', 'models/x', 't').catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
  });

  it('parses a final data line that has no trailing newline', async () => {
    mockFetch(sse([event(json).trimEnd()]));
    expect(await streamReviewWriting('K', 'models/x', 't')).toEqual(review);
  });

  it('maps a 401 on the stream endpoint to the key message', async () => {
    mockFetch(respond({ error: { message: 'unauthenticated' } }, 401));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/rejected this API key/);
  });

  it('maps a 429 with an error body on the stream endpoint to the quota message', async () => {
    mockFetch(respond({ error: { message: 'Resource exhausted' } }, 429));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/quota/);
  });

  it('reports SAFETY after partial output as declined', async () => {
    mockFetch(sse([event(json.slice(0, 20)), event('', { finishReason: 'SAFETY' })]));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toThrow(/declined to review/);
  });

  it('fails readably on malformed JSON in an SSE payload', async () => {
    mockFetch(sse(['data: {not json\n\n']));
    await expect(streamReviewWriting('K', 'models/x', 't')).rejects.toBeInstanceOf(GeminiError);
  });

  it('cancels the body when onPartial throws', async () => {
    const cancel = vi.fn();
    mockFetch(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(event(json.slice(0, 10))));
          },
          cancel,
        }),
      ),
    );
    await expect(
      streamReviewWriting('K', 'models/x', 't', {
        onPartial: () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(cancel).toHaveBeenCalled();
  });
});
