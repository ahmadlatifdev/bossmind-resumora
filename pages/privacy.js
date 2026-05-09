import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>Privacy policy</h1>
          <p>
            Resumora processes personal data strictly for account management, service delivery, and improving your
            job-search outcomes.
          </p>
          <p>
            Uploaded resumes and supporting files are stored securely and accessed only by authorized consultants assigned
            to your order.
          </p>
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
