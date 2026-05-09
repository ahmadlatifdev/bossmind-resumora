import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function RegisterPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = {
      email: String(fd.get("email") || ""),
      password: String(fd.get("password") || ""),
      displayName: String(fd.get("displayName") || ""),
    };
    const res = await fetch("/api/engagement/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error === "email_in_use" ? "That email is already registered." : data.error || "Registration failed.");
      return;
    }
    setMessage("Account created.");
    router.push("/dashboard");
  }

  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card">
          <h1>Register</h1>
          <p>Create an account to sync likes, saves, and follows across sessions.</p>
          <form className="rs-form-grid" onSubmit={onSubmit}>
            <input className="rs-input" name="displayName" type="text" placeholder="Full name" autoComplete="name" />
            <input className="rs-input" name="email" type="email" placeholder="Email" autoComplete="email" required />
            <input
              className="rs-input"
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <button className="rs-btn-primary" type="submit">
              Create account
            </button>
          </form>
          {error ? (
            <p role="alert" style={{ color: "#f0a8a8", marginTop: "0.75rem", fontSize: "0.9rem" }}>
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" style={{ color: "#7dd4a0", marginTop: "0.75rem", fontSize: "0.9rem" }}>
              {message}
            </p>
          ) : null}
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
