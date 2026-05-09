import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function SuccessPage() {
  const router = useRouter();

  const { session_id } = router.query;

  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (session_id) {
      fetch(`/api/verify-session?session_id=${session_id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            setStatus('success');
          } else {
            setStatus('invalid');
          }
        })
        .catch(() => {
          setStatus('error');
        });
    }
  }, [session_id]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#0b1120',
        color: '#ffffff',
        padding: '20px',
        fontFamily: 'Arial',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          width: '100%',
          background: '#111827',
          borderRadius: '20px',
          padding: '40px',
          textAlign: 'center',
          border: '1px solid #1f2937',
        }}
      >
        {status === 'loading' && (
          <>
            <h1>Verifying Payment...</h1>
            <p>Please wait while we confirm your payment session.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1>Payment Successful</h1>

            <p>
              Thank you for choosing Resumora.
            </p>

            <p>
              Your payment has been verified successfully.
            </p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <h1>Invalid Session</h1>

            <p>
              We could not verify this payment session.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1>Verification Error</h1>

            <p>
              Something went wrong while verifying your payment.
            </p>
          </>
        )}
      </div>
    </div>
  );
}