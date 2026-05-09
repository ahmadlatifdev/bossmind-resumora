import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Privacy Policy</h1>
        <p>
          Resumora processes personal data strictly for account management, service delivery,
          and improvement of your job-search outcomes.
        </p>
        <p>
          Uploaded resumes and supporting files are stored securely and accessed only by
          authorized consultants assigned to your order.
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
