// Minimal client for Groq's OpenAI-compatible chat completions API.
// Every failure becomes an AiUnavailableError so callers can fall back
// instead of failing the user's request.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq retires models regularly; check GET /openai/v1/models if calls start
// failing with 404s, and override with env vars rather than code changes.
export const MODELS = {
  // Small and fast, with higher free-tier limits: used per transaction.
  fast: process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b',
  // Better answers for the chat assistant.
  chat: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b',
};

export class AiUnavailableError extends Error {
  constructor(message, { rateLimited = false } = {}) {
    super(message);
    this.rateLimited = rateLimited;
  }
}

export function aiEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

// gpt-oss models reason before answering, and those tokens count toward
// maxTokens, so limits need headroom beyond the visible reply.
export async function chatCompletion({
  model = MODELS.chat,
  messages,
  json = false,
  maxTokens = 1000,
  temperature = 0.2,
  reasoningEffort = 'low',
  timeoutMs = 15000,
}) {
  if (!aiEnabled()) throw new AiUnavailableError('AI features are not configured');

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: reasoningEffort }),
        ...(json && { response_format: { type: 'json_object' } }),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AiUnavailableError(err.name === 'TimeoutError' ? 'AI request timed out' : 'AI request failed');
  }

  if (res.status === 429) throw new AiUnavailableError('AI rate limit reached', { rateLimited: true });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`Groq request failed (${res.status}):`, detail.slice(0, 500));
    throw new AiUnavailableError(`AI request failed (${res.status})`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
