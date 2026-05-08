import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Success() {
  const router = useRouter();
  const { session_id } = router.query;
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    if (session_id) {
      fetch(/api/verify-session?session_id=)
        .then(res => res.json())
        .then(data => setStatus(data.valid ? 'success' : 'invalid'));
    }
  }, [session_id]);

  return (
    <div style={{ textAlign: 'center', padding: '60px' }}>
      {status === 'success' && <h1>✅ Payment successful! Your luxury resume service is now active.</h1>}
      {status === 'invalid' && <h1>⚠️ Invalid session. Please contact support.</h1>}
      {status === 'verifying' && <h1>Verifying your payment...</h1>}
    </div>
  );
}
