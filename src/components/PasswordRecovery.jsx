import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TreeDeciduous } from "lucide-react";
import { requestPasswordReset, resetPassword } from "../services/api";
export default function PasswordRecovery({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const forgot = mode === "forgot";
  const validLink = /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!forgot && location.hash)
      navigate("/reset-password", { replace: true });
  }, [forgot, location.hash, navigate]);
  async function submit(event) {
    event.preventDefault();
    if (pending.current || complete) return;
    setError("");
    setMessage("");
    if (!forgot && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    pending.current = true;
    setLoading(true);
    try {
      const result = forgot
        ? await requestPasswordReset(email.trim())
        : await resetPassword(token, password);
      if (mounted.current) {
        setMessage(result.message);
        if (!forgot) {
          setComplete(true);
          setPassword("");
          setConfirmation("");
        }
      }
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }
  return (
    <main className="ui-auth">
      <section className="ui-panel ui-auth-panel">
        <div className="app-brand">
          <TreeDeciduous size={24} aria-hidden="true" />
          DURI.AI
        </div>
        <h1>{forgot ? "Forgot password" : "Reset password"}</h1>
        <p className="ui-muted mb-4">
          {forgot
            ? "Enter the email address you used to register. Reset links expire after 15 minutes."
            : "Choose a new password for your account. You’ll log in again after resetting it."}
        </p>
        {error && (
          <p className="ui-notice ui-error mb-4" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="ui-notice mb-4" role="status">
            {message}
          </p>
        )}
        {!forgot && !validLink && (
          <p className="ui-notice ui-error mb-4" role="alert">
            This reset link is incomplete or invalid. Please request a new link.
          </p>
        )}
        {!complete && (forgot || validLink) && (
          <form className="ui-form" onSubmit={submit}>
            {forgot ? (
              <label className="ui-field" htmlFor="recovery-email">
                Email address
                <input
                  id="recovery-email"
                  type="email"
                  required
                  maxLength={200}
                  autoComplete="email"
                  disabled={loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="ui-field" htmlFor="new-password">
                  New password
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="ui-field" htmlFor="confirm-password">
                  Confirm new password
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    disabled={loading}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
                <p className="ui-muted">
                  Use at least 8 characters. Passwords can contain at most 72
                  UTF-8 bytes.
                </p>
              </>
            )}
            <button
              type="submit"
              className="ui-button primary"
              disabled={loading}
            >
              {loading
                ? forgot
                  ? "Sending…"
                  : "Resetting…"
                : forgot
                  ? "Send reset link"
                  : "Reset password"}
            </button>
          </form>
        )}
        <div className="ui-auth-links">
          <Link to="/login">Back to login</Link>
          {!forgot && !complete && (
            <Link to="/forgot-password">Request a new link</Link>
          )}
        </div>
      </section>
    </main>
  );
}
