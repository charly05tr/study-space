import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, listModels, reviewWriting } from './gemini.api';

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

describe('reviewWriting', () => {
  const review = {
    language: 'English',
    scores: { grammar: 9, vocabulary: 8, topicMastery: 7 },
    strengths: [],
    issues: [],
    summary: 'Fine.',
  };

  it('requests JSON output and parses the candidate text', async () => {
    const fetchMock = mockFetch(
      respond({ candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }] }),
    );

    expect(await reviewWriting('K', 'models/gemini-2.5-flash', 'some note')).toEqual(review);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/models/gemini-2.5-flash:generateContent');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('sends the instructions as systemInstruction, not in the user content', async () => {
    const fetchMock = mockFetch(
      respond({ candidates: [{ content: { parts: [{ text: JSON.stringify(review) }] } }] }),
    );
    await reviewWriting('K', 'models/x', 'my note');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toMatch(/writing tutor/);
    expect(body.contents[0].parts[0].text).toBe('<note>\nmy note\n</note>');
  });

  it('reports a blocked prompt', async () => {
    mockFetch(respond({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(reviewWriting('K', 'models/x', 't')).rejects.toThrow(/declined to review this note/);
  });

  it.each(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'RECITATION'])(
    'reports a %s finish reason as declined',
    async (finishReason) => {
      mockFetch(respond({ candidates: [{ finishReason }] }));
      await expect(reviewWriting('K', 'models/x', 't')).rejects.toThrow(/declined to review/);
    },
  );

  it('reports a truncated response when MAX_TOKENS leaves unparsable JSON', async () => {
    mockFetch(
      respond({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"language":' }] } }],
      }),
    );
    await expect(reviewWriting('K', 'models/x', 't')).rejects.toThrow(/cut off/);
  });

  it('still parses a MAX_TOKENS response that is complete JSON', async () => {
    mockFetch(
      respond({
        candidates: [
          { finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(review) }] } },
        ],
      }),
    );
    expect(await reviewWriting('K', 'models/x', 't')).toEqual(review);
  });

  it('fails readably on an empty response', async () => {
    mockFetch(respond({ candidates: [] }));
    await expect(reviewWriting('K', 'models/x', 't')).rejects.toThrow(/empty response/);
  });
});
