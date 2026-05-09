import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card">
          <h1>Login</h1>
          <p>Access your Resumora workspace and premium deliverables.</p>
          <form className="rs-form-grid" onSubmit={(e) => e.preventDefault()}>
            <input className="rs-input" type="email" placeholder="Email" autoComplete="email" required />
            <input className="rs-input" type="password" placeholder="Password" autoComplete="current-password" required />
            <button className="rs-btn-primary" type="submit">
              Continue
            </button>
          </form>
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
