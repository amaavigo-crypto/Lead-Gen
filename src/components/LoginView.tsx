import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { signIn, requestPasswordReset, friendlyAuthError } from '../services/authService';
import './LoginView.css';

interface LoginViewProps {
  isFirebaseActive: boolean;
  initialError?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ initialError }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const email = identifier.trim();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(friendlyAuthError(err));
      setIsLoading(false);
    }
  };

  const handleForgot = async () => {
    setError(null);
    setInfo(null);
    const email = identifier.trim();
    if (!email) {
      setError('Enter your email above first, then click "Forgot password".');
      return;
    }
    try {
      await requestPasswordReset(email);
    } catch {
      // Use the same response either way to avoid revealing which emails have accounts.
    }
    setInfo('If an account exists for that email, a reset link has been sent.');
  };

  return (
    <main className="av-login-page">
      <div className="av-login-orb av-login-orb-one" />
      <div className="av-login-orb av-login-orb-two" />
      <div className="av-login-layout">
        <section className="av-login-story">
          <header className="av-login-brand-row">
            <a href="/" className="av-login-brand" aria-label="Amaavigo home">
              <img src="/amaavigo-logo.png" alt="Amaavigo" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
              <span>amaavigo</span>
            </a>
            <span className="av-login-secure"><ShieldCheck size={13} /> SECURE WORKSPACE</span>
          </header>

          <div className="av-login-story-copy">
            <span className="av-login-kicker"><Sparkles size={14} /> THE LEAD-TO-REVENUE WORKSPACE</span>
            <h1>Good to have you back.<br /><span>Let's move work forward.</span></h1>
            <p>Lead capture, customer conversations, AI assistance and campaigns—connected in one place, ready for your team.</p>
            <div className="av-login-proof">
              <span><Check size={13} /> Keep customer context connected</span>
              <span><Check size={13} /> Bring AI and people together</span>
              <span><Check size={13} /> Keep every next step visible</span>
            </div>
          </div>

          <div className="av-login-product">
            <div className="av-login-product-head">
              <div><span className="av-login-product-mark">A</span><b>Workspace overview</b></div>
              <span className="av-login-sample-pill">ILLUSTRATIVE PREVIEW</span>
            </div>
            <div className="av-login-product-body">
              <aside className="av-login-mini-nav">
                <span className="is-active"><Workflow size={13} /> Overview</span>
                <span><MessageCircle size={13} /> Inbox</span>
                <span><Users size={13} /> CRM</span>
                <span><Zap size={13} /> AI Agent</span>
              </aside>
              <div className="av-login-mini-main">
                <div className="av-login-mini-greeting"><small>YOUR WORKSPACE</small><b>Everything in motion.</b></div>
                <div className="av-login-mini-metrics">
                  <div><small>New leads</small><b>128</b><span>Sample activity</span></div>
                  <div><small>Conversations</small><b>42</b><span>Across channels</span></div>
                  <div><small>Next actions</small><b>16</b><span>Ready to review</span></div>
                </div>
                <div className="av-login-mini-activity">
                  <div><span className="av-mini-avatar">AK</span><span><b>New WhatsApp enquiry</b><small>AI response prepared · just now</small></span><i /></div>
                  <div><span className="av-mini-avatar is-blue">IP</span><span><b>Demo request received</b><small>Lead context added · 4 min ago</small></span><i /></div>
                  <div><span className="av-mini-avatar is-violet">SM</span><span><b>Campaign draft ready</b><small>Waiting for approval · 12 min ago</small></span><i /></div>
                </div>
              </div>
            </div>
          </div>

          <footer className="av-login-story-foot"><span>CAPTURE</span><i /><span>CONVERSE</span><i /><span>QUALIFY</span><i /><span>GROW</span></footer>
        </section>

        <section className="av-login-form-side">
          <div className="av-login-form-card">
            <a href="/" className="av-login-mobile-brand"><span>A</span> amaavigo</a>
            <div className="av-login-form-heading">
              <span className="av-login-form-icon"><Lock size={17} /></span>
              <span className="av-login-eyebrow">YOUR WORKSPACE IS WAITING</span>
              <h2>Welcome back.</h2>
              <p>Sign in to continue to your Amaavigo workspace.</p>
            </div>

            {info && <div className="av-login-alert is-info"><ShieldCheck size={15} /><span>{info}</span></div>}
            {error && <div className="av-login-alert is-error"><AlertCircle size={15} /><span>{error}</span></div>}

            <form onSubmit={handleSubmit} className="av-login-form">
              <label htmlFor="av-login-email">Work email</label>
              <div className="av-login-input-wrap">
                <Mail size={16} />
                <input
                  id="av-login-email"
                  type="email"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div className="av-login-password-label">
                <label htmlFor="av-login-password">Password</label>
                <button type="button" onClick={handleForgot}>Forgot password?</button>
              </div>
              <div className="av-login-input-wrap">
                <Lock size={16} />
                <input
                  id="av-login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button type="button" className="av-login-toggle-password" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button type="submit" disabled={isLoading} className="av-login-submit">
                {isLoading ? 'Verifying credentials…' : 'Sign in to workspace'}
                {!isLoading && <ArrowRight size={16} />}
              </button>
            </form>

            <div className="av-login-security-note"><ShieldCheck size={15} /><span>Your sign-in is protected. Workspace access follows your assigned role and permissions.</span></div>
            <div className="av-login-form-divider"><span>AMAAVIGO WORKSPACE</span></div>
            <a href="/" className="av-login-back-link"><ArrowUpRight size={14} /> Back to the website</a>
            <p className="av-login-legal">
              <a href="/terms">Terms</a><i /> <a href="/privacy">Privacy</a><i /> <a href="/dpa">DPA</a><i /> <a href="/aup">Acceptable Use</a>
            </p>
          </div>
          <p className="av-login-side-note">One connected workspace for the work that moves your business forward.</p>
        </section>
      </div>
    </main>
  );
};
