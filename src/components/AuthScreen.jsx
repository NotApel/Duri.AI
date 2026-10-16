// src/components/AuthScreen.jsx
import { useState } from "react";
import { TreeDeciduous } from "lucide-react";
import { registerFarmer, loginFarmer } from "../services/api";

export default function AuthScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState("login"); // 'login' | 'register' | 'recover'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Handle registration
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await registerFarmer({
        full_name: fullName,
        email,
        password_hash: password,
        phone_number: phoneNumber,
      });

      setSuccessMessage("Account created successfully! Please login.");
      setTimeout(() => {
        setMode("login");
        setFullName("");
        setPhoneNumber("");
        setPassword("");
        setEmail("");
      }, 2000);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginFarmer(email, password);
      setSuccessMessage("Login successful!");
      // Call the onLoginSuccess prop to navigate to dashboard
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ui-auth">
      <section className="ui-panel ui-auth-panel">
        <div className="app-brand">
          <TreeDeciduous size={24} aria-hidden="true" />
          DURI.AI
        </div>
        <h1>
          {mode === "register"
            ? "Create your account"
            : mode === "recover"
              ? "Password recovery"
              : "Sign in"}
        </h1>
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
        {mode === "recover" ? (
          <p className="ui-notice">
            Password recovery is not connected yet. Please contact your project
            administrator.
          </p>
        ) : (
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
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </label>
                <label className="ui-field" htmlFor="phone-number">
                  Phone number
                  <input
                    id="phone-number"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="ui-field" htmlFor="email">
              Email address
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="ui-field" htmlFor="password">
              Password
              <input
                id="password"
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
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>
        )}
        <div className="ui-auth-links">
          {mode === "login" ? (
            <>
              <button
                onClick={() => {
                  setMode("register");
                  setError("");
                  setSuccessMessage("");
                }}
              >
                Create account
              </button>
              <button
                onClick={() => {
                  setMode("recover");
                  setError("");
                  setSuccessMessage("");
                }}
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMode("login");
                setError("");
                setSuccessMessage("");
              }}
            >
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
