import { useContext, useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TreeDeciduous } from "lucide-react";
import { registerFarmer } from "../services/api";
import { AuthContext } from "../services/AuthContext";

export default function AuthScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const mode = location.pathname === "/register" ? "register" : "login";
  const [username, setUsername] = useState(location.state?.username || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const successMessage = location.state?.message || "";
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function handleRegister(e) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setError("");
    setLoading(true);
    try {
      const result = await registerFarmer({
        full_name: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        phone_number: phoneNumber.trim(),
      });
      if (mounted.current)
        navigate("/login", {
          replace: true,
          state: { message: result.message, username: username.trim() },
        });
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  }
  async function handleLogin(e) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
      if (mounted.current) navigate("/dashboard", { replace: true });
    } catch (err) {
      if (mounted.current) setError(err.message);
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
        <h1>{mode === "register" ? "Create your account" : "Login"}</h1>
        {error && (
          <p className="ui-notice ui-error mb-4" role="alert">
            {error}
          </p>
        )}
        {successMessage && (
          <p className="ui-notice mb-4" role="status">
            {successMessage}
          </p>
        )}
        <form
          className="ui-form"
          onSubmit={mode === "register" ? handleRegister : handleLogin}
        >
          {mode === "register" && (
            <>
              <label className="ui-field" htmlFor="full-name">
                Full name
                <input
                  id="full-name"
                  maxLength={200}
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="ui-field" htmlFor="register-username">
                Username
                <input
                  id="register-username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={50}
                  pattern="[A-Za-z0-9._\-]{3,50}"
                  title="3–50 letters, numbers, dots, underscores, or hyphens"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="ui-field" htmlFor="phone-number">
                Phone number
                <input
                  id="phone-number"
                  maxLength={20}
                  minLength={7}
                  title="Phone number with at least 7 digits"
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </label>
            </>
          )}
          {mode === "register" ? (
            <label className="ui-field" htmlFor="email">
              Email address
              <input
                id="email"
                maxLength={200}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          ) : (
            <label className="ui-field" htmlFor="username">
              Username
              <input
                id="username"
                autoComplete="username"
                required
                maxLength={50}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
          )}
          <label className="ui-field" htmlFor="password">
            Password
            <input
              id="password"
              minLength={mode === "register" ? 8 : undefined}
              maxLength={128}
              title={mode === "register" ? "Use 8–128 characters" : undefined}
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="ui-button primary" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "register"
                ? "Register"
                : "Login"}
          </button>
        </form>
        <div className="ui-auth-links">
          {mode === "login" ? (
            <>
              <button
                disabled={loading}
                onClick={() => {
                  navigate("/register");
                }}
              >
                Register
              </button>
              <button
                disabled={loading}
                onClick={() => {
                  navigate("/forgot-password");
                }}
              >
                Forgot password?
              </button>
              <button
                disabled={loading}
                onClick={() => navigate("/", { replace: true })}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              disabled={loading}
              onClick={() => {
                navigate("/login", { replace: true });
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
