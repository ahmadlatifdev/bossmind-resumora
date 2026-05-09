import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function SuccessPage() {
  const router = useRouter();
  const { session_id } = router.query;

  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (session_id) {
      fetch(`/api/verify-session?session_id=${session_id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            setStatus("success");
          } else {
            setStatus("invalid");
          }
        })
        .catch(() => {
          setStatus("error");
        });
    }
  }, [session_id]);

  return (
    <div className="rs-app-shell">
      <main className="rs-simple-card" style={{ textAlign: "center" }}>
        {status === "loading" && (
          <>
            <h1>Verifying payment</h1>
            <p>Please wait while we confirm your payment session.</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1>Payment successful</h1>
            <p>Thank you for choosing Resumora.</p>
            <p>Your payment has been verified successfully.</p>
            <Link href="/" className="rs-link-muted">
              Return home
            </Link>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1>Invalid session</h1>
            <p>We could not verify this payment session.</p>
            <Link href="/" className="rs-link-muted">
              Return home
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <h1>Verification error</h1>
            <p>Something went wrong while verifying your payment.</p>
            <Link href="/" className="rs-link-muted">
              Return home
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
