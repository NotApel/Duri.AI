import React, { useState } from 'react';

export default function AuthScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'recover'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Basic Input Validation Formats
    if (!email.includes('@')) {
      setError('Please provide a valid orchard administrator email.');
      return;
    }
    if (mode !== 'recover' && password.length < 6) {
      setError('Credentials must be at least 6 characters long.');
      return;
    }

    if (mode === 'login') {
      // Mocking Backend Endpoint Validation
      if (email === 'admin@duri.ai' && password === 'password') {
        onLoginSuccess();
      } else {
        setError('Invalid farm credentials. Use admin@duri.ai / password');
      }
    } else if (mode === 'register') {
      setSuccessMessage('Account registration request submitted to cloud gateway!');
      setTimeout(() => setMode('login'), 2000);
    } else if (mode === 'recover') {
      setSuccessMessage('Reset voucher dispatched safely to your recovery terminal.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
      {/* Decorative ambient blurred backgrounds */}
      <div className="absolute top-[-20%] left-[-20%] w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-96 h-96 rounded-full bg-blue-500/10 blur-3xl"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl z-10">
        <div className="text-center mb-8">
          <span className="text-4xl block mb-2">🌳</span>
          <h2 className="text-3xl font-black text-white tracking-tight">DURI.AI</h2>
          <p className="text-sm text-slate-400 mt-1">Self-Learning Durian Harvest System</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs mb-4 font-medium flex items-center gap-2">
            ⚠️ {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs mb-4 font-medium flex items-center gap-2">
            ✅ {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Orchard Operator Name</label>
              <input 
                type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                placeholder="e.g., Ah Boon"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Terminal Email Target</label>
            <input 
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
              placeholder="admin@duri.ai"
            />
          </div>

          {mode !== 'recover' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Security Code Token</label>
              <input 
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                placeholder="••••••••"
              />
            </div>
          )}

          <button 
            type="submit" 
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-3 rounded-xl shadow-lg transition mt-6"
          >
            {mode === 'login' ? 'Access Control System' : mode === 'register' ? 'Register Network Profile' : 'Dispatch Recovery Ticket'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800/60 flex flex-wrap justify-between text-xs text-slate-400 gap-2">
          {mode === 'login' ? (
            <>
              <button onClick={() => setMode('register')} className="hover:text-emerald-400 transition font-medium">Create Account</button>
              <button onClick={() => setMode('recover')} className="hover:text-emerald-400 transition font-medium">Forgot Security Token?</button>
            </>
          ) : (
            <button onClick={() => setMode('login')} className="w-full text-center hover:text-emerald-400 transition font-medium">Return to Access Login</button>
          )}
        </div>
      </div>
    </div>
  );
}