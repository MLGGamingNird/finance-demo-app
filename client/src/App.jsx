import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { API_URL, apiFetch } from './lib/api';
import { TransactionForm } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
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

function Dashboard({ session }) {
  const token = session.access_token;
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadingSlow = useSlowNotice(loading);

  async function loadTransactions() {
    setTransactions(await apiFetch('/api/transactions', { token }));
  }

  useEffect(() => {
    Promise.all([apiFetch('/api/categories', { token }), apiFetch('/api/transactions', { token })])
      .then(([cats, txns]) => {
        setCategories(cats);
        setTransactions(txns);
      })
      .catch(() => setError('Failed to load transactions'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Errors propagate so the form can show field-level messages.
  async function handleSave(payload) {
    if (editing) {
      await apiFetch(`/api/transactions/${editing.id}`, { token, method: 'PATCH', body: payload });
      setEditing(null);
    } else {
      await apiFetch('/api/transactions', { token, method: 'POST', body: payload });
    }
    await loadTransactions();
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
      await loadTransactions();
    } catch {
      setError('Failed to delete transaction');
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Transactions</h1>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Log out
        </button>
      </header>

      <TransactionForm
        key={editing?.id ?? 'new'}
        categories={categories}
        transaction={editing}
        onSubmit={handleSave}
        onCancel={() => setEditing(null)}
      />

      {loadingSlow && <WakingNotice />}
      {error && <p className="error">{error}</p>}

      <TransactionList
        transactions={transactions}
        categories={categories}
        loading={loading}
        editingId={editing?.id}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
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
