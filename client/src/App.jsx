import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { API_URL, apiFetch } from './lib/api';
import { TransactionForm } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
import { MonthPicker } from './components/MonthPicker';
import { SummaryCards } from './components/SummaryCards';
import { BudgetList } from './components/BudgetList';
import { SpendingChat } from './components/SpendingChat';
import { currentMonth } from './lib/month';

// Recharts is the biggest dependency, so it loads after the dashboard renders.
const Charts = lazy(() => import('./components/Charts'));
import './App.css';

// The API sleeps on Render's free tier, so a cold request can take 30-60s.
// Returns true once `pending` has lasted long enough to be worth explaining.
function useSlowNotice(pending, delayMs = 3000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending, delayMs]);

  return slow;
}

function WakingNotice() {
  return (
    <p className="notice">
      Waking up the server… this can take up to a minute on the free hosting tier.
    </p>
  );
}

function AuthForm() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState('login');
  const [error, setError] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const demoSlow = useSlowNotice(demoLoading);

  // Start waking the API while the user is still on the login screen.
  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => {});
  }, []);

  async function handleDemo() {
    setError(null);
    setDemoLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/demo/session`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const { access_token, refresh_token } = await res.json();
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
    } catch {
      setError('Could not start the demo. Please try again.');
      setDemoLoading(false);
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'signup' : 'login');
    setStep('email');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  }

  function handleEmailNext(e) {
    e.preventDefault();
    setError(null);
    setStep('password');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const action =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error } = await action;
    if (error) setError(error.message);
  }

  if (step === 'email') {
    return (
      <form onSubmit={handleEmailNext} className="auth-form">
        <h1>Finance Demo</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <button type="submit">Next</button>
        <button type="button" className="link" onClick={switchMode}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
        </button>
        <div className="divider">or</div>
        <button type="button" className="secondary" onClick={handleDemo} disabled={demoLoading}>
          {demoLoading ? 'Starting demo…' : 'Try the demo — no sign-up'}
        </button>
        {demoSlow && <WakingNotice />}
        {error && <p className="error">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h1>Finance Demo</h1>
      <p className="step-email">{email}</p>
      <div className="password-field">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoFocus
        />
      </div>
      {mode === 'signup' && (
        <div className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
      )}
      <button type="button" className="link" onClick={() => setShowPassword((v) => !v)}>
        {showPassword ? 'Hide password' : 'Show password'}
      </button>
      <button type="submit">{mode === 'login' ? 'Log in' : 'Sign up'}</button>
      <button type="button" className="link" onClick={() => setStep('email')}>
        Back
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

const TRANSACTIONS_PAGE_SIZE = '15';

// Runs `load` whenever deps change and ignores responses from stale runs,
// so flipping quickly between months can't show the wrong month's data.
function useApiData(load, deps, onError) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let current = true;
    load()
      .then((result) => current && setData(result))
      .catch((err) => current && onError(err));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}

function Dashboard({ session }) {
  const token = session.access_token;
  const [month, setMonth] = useState(currentMonth);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  // Bumped after any write so the dependent queries refetch.
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  // A 401 means the session is gone, such as an expired demo sandbox, so go
  // back to the login screen instead of showing an error.
  const showLoadError = (err) => {
    if (err?.status === 401) supabase.auth.signOut();
    else setError('Something went wrong loading your data. Please refresh.');
  };

  const categories = useApiData(() => apiFetch('/api/categories', { token }), [token], showLoadError);
  const budgets = useApiData(() => apiFetch('/api/budgets', { token }), [token, version], showLoadError);
  const summary = useApiData(
    () => apiFetch(`/api/summary?month=${month}`, { token }),
    [token, month, version],
    showLoadError,
  );
  const trend = useApiData(
    () => apiFetch(`/api/summary/trend?end=${month}&months=6`, { token }),
    [token, month, version],
    showLoadError,
  );
  // Each first page remembers its own query, so "Load more" continues that
  // query even while a newly picked month or filter is still loading.
  const firstPage = useApiData(
    () => {
      const params = new URLSearchParams({ month, limit: TRANSACTIONS_PAGE_SIZE });
      if (categoryFilter) params.set('category_id', categoryFilter);
      return apiFetch(`/api/transactions?${params}`, { token }).then((page) => ({ ...page, params }));
    },
    [token, month, categoryFilter, version],
    showLoadError,
  );
  // Pages fetched with "Load more" belong to the first page they extend, so a
  // new month, filter or edit (a new first page) discards them.
  const [morePages, setMorePages] = useState({ after: null, items: [], nextCursor: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const extra =
    morePages.after === firstPage ? morePages : { after: firstPage, items: [], nextCursor: firstPage?.next_cursor };
  const transactions = firstPage && [...firstPage.items, ...extra.items];

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(firstPage.params);
      params.set('cursor', extra.nextCursor);
      const page = await apiFetch(`/api/transactions?${params}`, { token });
      setMorePages({ after: firstPage, items: [...extra.items, ...page.items], nextCursor: page.next_cursor });
    } catch {
      setError('Failed to load more transactions');
    } finally {
      setLoadingMore(false);
    }
  }

  const loading = transactions === null || categories === null;
  const loadingSlow = useSlowNotice(loading);

  // Errors propagate so the form can show field-level messages.
  async function handleSave(payload) {
    if (editing) {
      await apiFetch(`/api/transactions/${editing.id}`, { token, method: 'PATCH', body: payload });
      setEditing(null);
    } else {
      await apiFetch('/api/transactions', { token, method: 'POST', body: payload });
    }
    refresh();
  }

  function handleEdit(transaction) {
    setEditing(transaction);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(transaction) {
    setError(null);
    try {
      await apiFetch(`/api/transactions/${transaction.id}`, { token, method: 'DELETE' });
      if (editing?.id === transaction.id) setEditing(null);
      refresh();
    } catch {
      setError('Failed to delete transaction');
    }
  }

  async function handleSaveBudgets(changes) {
    try {
      await Promise.all(
        changes.map(({ categoryId, amount }) =>
          amount === null
            ? apiFetch(`/api/budgets/${categoryId}`, { token, method: 'DELETE' })
            : apiFetch(`/api/budgets/${categoryId}`, { token, method: 'PUT', body: { amount } }),
        ),
      );
    } finally {
      // Some writes may have landed even if one failed.
      refresh();
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Finance Demo</h1>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Log out
        </button>
      </header>
      {session.user.app_metadata?.demo && (
        <p className="sandbox-note">This is your own demo sandbox. Nobody else sees your changes, and it's deleted after 24 hours.</p>
      )}

      {loadingSlow && <WakingNotice />}
      {error && <p className="error">{error}</p>}

      <MonthPicker month={month} onChange={setMonth} />
      <SummaryCards summary={summary} />

      <Suspense fallback={<p className="empty">Loading charts…</p>}>
        <Charts summary={summary} trend={trend} categories={categories ?? []} />
      </Suspense>

      <BudgetList
        categories={categories ?? []}
        budgets={budgets ?? []}
        summary={summary}
        onSave={handleSaveBudgets}
      />

      <SpendingChat token={token} />

      <section className="transactions">
        <div className="section-header">
          <h2>Transactions</h2>
          <label>
            <span className="sr-only">Filter by category</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {['expense', 'income'].map((kind) => (
                <optgroup key={kind} label={kind === 'expense' ? 'Expenses' : 'Income'}>
                  {(categories ?? [])
                    .filter((c) => c.kind === kind)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
              <option value="none">Uncategorized</option>
            </select>
          </label>
        </div>

        <TransactionForm
          key={editing?.id ?? 'new'}
          categories={categories ?? []}
          transaction={editing}
          onSubmit={handleSave}
          onCancel={() => setEditing(null)}
        />

        <TransactionList
          transactions={transactions ?? []}
          categories={categories ?? []}
          loading={loading}
          emptyMessage={categoryFilter ? 'No matching transactions this month' : 'No transactions this month'}
          editingId={editing?.id}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
        {!loading && extra.nextCursor && (
          <button type="button" className="secondary load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return session ? <Dashboard session={session} /> : <AuthForm />;
}

export default App;
