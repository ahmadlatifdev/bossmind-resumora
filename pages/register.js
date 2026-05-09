import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card">
          <h1>Register</h1>
          <p>Create your account to access premium Resumora services.</p>
          <form className="rs-form-grid" onSubmit={(e) => e.preventDefault()}>
            <input className="rs-input" type="text" placeholder="Full name" autoComplete="name" required />
            <input className="rs-input" type="email" placeholder="Email" autoComplete="email" required />
            <input className="rs-input" type="password" placeholder="Password" autoComplete="new-password" required />
            <button className="rs-btn-primary" type="submit">
              Create account
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
