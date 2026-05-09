import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="rs-app-shell">
      <main>
        <section className="rs-simple-card rs-simple-card--wide">
          <h1>Contact</h1>
          <p>
            Email:{" "}
            <a href="mailto:support@resumora.net" className="rs-shell-link">
              support@resumora.net
            </a>
          </p>
          <p>Business hours: Monday to Friday, 09:00–18:00 EST</p>
          <p>
            Enterprise partnerships:{" "}
            <a href="mailto:partnerships@resumora.net" className="rs-shell-link">
              partnerships@resumora.net
            </a>
          </p>
          <Link href="/" className="rs-link-muted">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
