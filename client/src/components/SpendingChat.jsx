import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

const SUGGESTIONS = [
  'Where did most of my money go this month?',
  'Am I on track with my budgets?',
  'How does this month compare to last month?',
];

// Models sometimes use **bold** despite being asked for plain text. Render
// just that, as React elements, so no HTML from the model is ever injected.
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

// The API accepts the last 12 messages; older turns are dropped.
const MAX_HISTORY = 12;

export function SpendingChat({ token }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text) {
    const question = text.trim();
    if (!question || sending) return;

    const next = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError(null);
    setSending(true);

    try {
      const { reply } = await apiFetch('/api/chat', {
        token,
        method: 'POST',
        body: { messages: next.slice(-MAX_HISTORY) },
      });
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message);
      // Put the question back so it can be retried.
      setMessages(messages);
      setInput(question);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat">
      <div className="section-header">
        <h2>Ask about your spending</h2>
        {messages.length > 0 && (
          <button type="button" className="link" onClick={() => setMessages([])} disabled={sending}>
            Clear
          </button>
        )}
      </div>

      <div className="chat-card">
        {messages.length === 0 ? (
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={sending}>
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="chat-log" ref={logRef} aria-live="polite">
            {messages.map((m, i) => (
              <p key={i} className={`chat-message ${m.role}`}>
                {m.role === 'assistant' ? renderInline(m.content) : m.content}
              </p>
            ))}
            {sending && <p className="chat-message assistant pending">Thinking…</p>}
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label className="grow">
            <span className="sr-only">Your question</span>
            <input
              type="text"
              placeholder="e.g. What did I spend on groceries?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              disabled={sending}
            />
          </label>
          <button type="submit" disabled={sending || !input.trim()}>
            Ask
          </button>
        </form>
        <p className="chat-disclaimer">AI answers can be wrong and aren't financial advice.</p>
      </div>
    </section>
  );
}
