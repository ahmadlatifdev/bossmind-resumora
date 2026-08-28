import { useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/Login';
import VideosPage from './pages/VideosPage';
import AccountPage from './pages/AccountPage';
import {
  CANONICAL_STRIPE_PRICE_IDS,
  getExpectedCentsForPlan,
  getStripePaymentLinkForPlan,
} from './lib/plans.js';
import './v6-luxury.css';
import './app-shell.css';

/** Live Gen2 Cloud Run checkout endpoint (not a relative /api path). */
const CHECKOUT_BACKEND_URL = 'https://createcheckoutsession-lip26fm72a-uc.a.run.app';

const PLAN_ID_MAP: Record<string, string> = {
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
};

function SiteNav() {
  const { user, loading } = useAuth();

  return (
    <nav className="v6-nav grid grid-cols-[auto_1fr_auto] items-center gap-4 px-8 py-5 sticky top-0 z-40">
      <Link to="/" className="flex items-center shrink-0 justify-self-start">
        <img src="/resumora-logo.png" alt="Resumora.net" className="h-10 w-auto object-contain" />
      </Link>
      <div className="main-nav-links flex flex-1 flex-wrap justify-center items-center gap-6">
        <Link to="/" className="hover:text-[#D4AF37] transition">
          Home
        </Link>
        <a href="/pricing" className="hover:text-[#D4AF37] transition">
          Pricing
        </a>
        {!loading && user ? (
          <Link to="/video-library" className="hover:text-[#D4AF37] transition">
            Video Library
          </Link>
        ) : (
          <Link to="/login" className="hover:text-[#D4AF37] transition">
            Video Library
          </Link>
        )}
        <a href="/resume-studio" className="hover:text-[#D4AF37] transition">
          Resume Studio
        </a>
        {!loading && user ? (
          <Link to="/account" className="hover:text-[#D4AF37] transition">
            My Account
          </Link>
        ) : null}
      </div>
      {/* Spacer keeps center column visually middle with logo on the left */}
      <div className="w-[2.5rem] sm:w-[6.5rem]" aria-hidden="true" />
    </nav>
  );
}

function HomePage() {
  const [searchParams] = useSearchParams();
  const showPaywall = searchParams.get('paywall') === '1';
  // React State for the selected Stripe Price ID
  const [selectedStripePriceId, setSelectedStripePriceId] = useState<string | null>(null);

  // Handles clicking a plan card
  const handlePlanClick = (priceId: string) => {
    setSelectedStripePriceId(priceId);

    // UI Update: Remove active class from all cards, add to the clicked one
    document.querySelectorAll('.pricing-plan').forEach((el) => el.classList.remove('active'));
    const activeElement = document.getElementById(`plan-${priceId}`);
    if (activeElement) activeElement.classList.add('active');

    // UI Update: Change the checkout button text to show the selected price
    const displayPriceMap: Record<string, string> = {
      price_29: '$29',
      price_49: '$49',
      price_79: '$79',
      price_110: '$110',
    };
    const checkoutBtn = document.getElementById('checkout-button-text');
    if (checkoutBtn) {
      checkoutBtn.innerText = `Proceed to Payment (${displayPriceMap[priceId]})`;
    }
  };

  // Handles redirecting to Stripe Checkout
  const redirectToStripe = async () => {
    if (!selectedStripePriceId) {
      alert('Please select a plan first.');
      return;
    }
    // Test/sandbox guidance: Checkout "Confirm it's you" (Link) does not send real SMS/email.
    console.log(
      'Sandbox checkout: if asked for a confirmation code, type `000000` to continue testing. Real emails/SMS apply in live mode.'
    );
    try {
      const planId = PLAN_ID_MAP[selectedStripePriceId];
      const priceId =
        CANONICAL_STRIPE_PRICE_IDS[planId as keyof typeof CANONICAL_STRIPE_PRICE_IDS] ||
        selectedStripePriceId;
      const expectedCents = getExpectedCentsForPlan(planId);
      const response = await fetch(CHECKOUT_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          planId,
          priceId,
          expectedCents,
          successUrl: `${window.location.origin}/?checkout=success&plan=${encodeURIComponent(planId)}`,
          cancelUrl: `${window.location.origin}/?checkout=canceled&plan=${encodeURIComponent(planId)}`,
        }),
      });
      const session = await response.json().catch(() => ({}));
      console.log('Backend session response:', session);
      if (session.url) {
        window.location.href = session.url;
        return;
      }

      const paymentLink = getStripePaymentLinkForPlan(planId);
      if (paymentLink) {
        window.location.href = paymentLink;
        return;
      }

      alert(session.error || 'Failed to get checkout URL.');
    } catch (error) {
      console.error('Checkout Error:', error);
      try {
        const planId = PLAN_ID_MAP[selectedStripePriceId];
        const paymentLink = getStripePaymentLinkForPlan(planId);
        if (paymentLink) {
          window.location.href = paymentLink;
          return;
        }
      } catch {
        /* fall through */
      }
      alert(
        'Something went wrong. Please refresh the page and try again. If the issue persists, contact support.'
      );
    }
  };

  return (
    <div className="v6-shell min-h-screen font-sans">
      <div className="v6-mesh" aria-hidden="true" />
      <SiteNav />

      <main className="flex flex-col items-center w-full px-4 py-16">
        <section className="v6-hero-panel flex flex-col items-center">
          {showPaywall ? (
            <p className="mb-6 text-sm text-center border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 rounded-lg max-w-xl">
              Video Library requires an active subscription. Choose a plan below, then sign in.
            </p>
          ) : null}
          <h1 className="v6-heading text-4xl md:text-5xl mb-4 text-center">
            Build Your Perfect Resume
          </h1>
          <p className="v6-subhead text-lg text-center opacity-80 mb-10 max-w-2xl">
            Select a plan to see exactly what is included, then proceed to checkout.
          </p>

          <div className="v6-pricing-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full mb-12">
            {[
              { id: 'price_29', price: '$29', name: 'Basic' },
              { id: 'price_49', price: '$49', name: 'Pro' },
              { id: 'price_79', price: '$79', name: 'Business' },
              { id: 'price_110', price: '$110', name: 'Enterprise' },
            ].map((plan) => (
              <div
                key={plan.id}
                id={`plan-${plan.id}`}
                className="pricing-plan cursor-pointer border-2 border-gray-200/40 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70 rounded-2xl p-6 text-center"
                onClick={() => handlePlanClick(plan.id)}
              >
                <h3 className="text-xl font-semibold mb-2 tracking-wide">{plan.name}</h3>
                <p className="text-3xl font-bold text-[#D4AF37]">
                  {plan.price}
                  <span className="text-sm font-normal opacity-70">{' /mo'}</span>
                </p>
                <div className="mt-4 text-sm opacity-75 space-y-1">
                  <p>{'Standard Features'}</p>
                  <p>{'Priority Support'}</p>
                  <p>{'Advanced Tools'}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <button
              id="checkout-button"
              onClick={redirectToStripe}
              className="v6-cta w-full px-10 py-4 rounded-full font-bold text-lg"
            >
              <span id="checkout-button-text">{'Select a plan to continue'}</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function VideoLibraryPage() {
  return (
    <div className="v6-shell min-h-screen font-sans">
      <div className="v6-mesh" aria-hidden="true" />
      <SiteNav />
      <VideosPage />
    </div>
  );
}

function AccountShell() {
  return (
    <div className="v6-shell min-h-screen font-sans">
      <div className="v6-mesh" aria-hidden="true" />
      <SiteNav />
      <AccountPage />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute requireSubscription={false}>
            <AccountShell />
          </ProtectedRoute>
        }
      />
      <Route
        path="/video-library"
        element={
          <ProtectedRoute requireSubscription>
            <VideoLibraryPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
