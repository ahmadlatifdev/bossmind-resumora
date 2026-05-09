import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>Support</h1>
          <p>Priority support is included on Elite plans.</p>
          <p>Submit requests at support@resumora.net with your account email and order ID.</p>
          <p>Average first response time: under two hours for premium clients.</p>
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
