import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Terms of Service</h1>
        <p>
          By using Resumora, you agree to receive digital career services delivered through
          our platform, including resume writing, profile optimization, and coaching packages.
        </p>
        <p>
          Service timelines begin after required client files are submitted. Premium packages
          include revision windows as detailed in your selected plan.
        </p>
        <Link href="/" style={styles.link}>Back to home</Link>
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#090f23", color: "#f8f5ee", padding: "20px", fontFamily: "Inter, Segoe UI, Arial, sans-serif" },
  card: { maxWidth: "840px", margin: "0 auto", border: "1px solid rgba(212,175,55,.35)", borderRadius: "16px", padding: "24px", background: "rgba(8,17,41,.8)" },
  link: { color: "#f4ddb0", display: "inline-block", marginTop: "12px" },
};
