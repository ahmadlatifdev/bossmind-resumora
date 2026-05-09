import Link from "next/link";

export default function RegisterPage() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Register</h1>
        <p>Create your account to access premium Resumora services.</p>
        <form style={styles.form} onSubmit={(e) => e.preventDefault()}>
          <input style={styles.input} type="text" placeholder="Full name" required />
          <input style={styles.input} type="email" placeholder="Email" required />
          <input style={styles.input} type="password" placeholder="Password" required />
          <button style={styles.button} type="submit">
            Create account
          </button>
        </form>
        <Link href="/" style={styles.link}>
          Back to home
        </Link>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#090f23",
    color: "#f8f5ee",
    padding: "16px",
    fontFamily: "Inter, Segoe UI, Arial, sans-serif",
  },
  card: {
    width: "min(520px, 100%)",
    border: "1px solid rgba(212,175,55,.35)",
    borderRadius: "16px",
    padding: "26px",
    background: "rgba(8,17,41,.8)",
  },
  form: { display: "grid", gap: "10px", marginTop: "14px" },
  input: {
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid rgba(212,175,55,.35)",
    background: "#101a3d",
    color: "#f8f5ee",
  },
  button: {
    marginTop: "6px",
    padding: "11px 14px",
    borderRadius: "10px",
    border: "1px solid #d4af37",
    background: "linear-gradient(120deg,#d4af37,#f4ddb0)",
    color: "#08112d",
    fontWeight: 700,
    cursor: "pointer",
  },
  link: { color: "#f4ddb0", marginTop: "14px", display: "inline-block" },
};
