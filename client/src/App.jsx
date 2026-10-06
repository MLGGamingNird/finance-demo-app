import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL;

function AuthForm() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState('login');
  const [error, setError] = useState(null);

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
  const [transactions, setTransactions] = useState([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);

  async function loadTransactions() {
    const res = await fetch(`${API_URL}/api/transactions`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      setError('Failed to load transactions');
      return;
    }
    setTransactions(await res.json());
  }

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${API_URL}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ description, amount: Number(amount) }),
    });
    if (!res.ok) {
      setError('Failed to add transaction');
      return;
    }
    setDescription('');
    setAmount('');
    loadTransactions();
  }

  return (
    <div className="dashboard">
      <header>
        <h1>Transactions</h1>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Log out
        </button>
      </header>

      <form onSubmit={handleAdd} className="add-form">
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <button type="submit">Add</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="transaction-list">
        {transactions.map((t) => (
          <li key={t.id}>
            <span>{t.description}</span>
            <span>{Number(t.amount).toFixed(2)}</span>
          </li>
        ))}
        {transactions.length === 0 && <li className="empty">No transactions yet</li>}
      </ul>
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
