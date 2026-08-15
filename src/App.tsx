import { useState } from 'react';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import {
  CANONICAL_STRIPE_PRICE_IDS,
  getExpectedCentsForPlan,
  getStripePaymentLinkForPlan,
} from './lib/plans.js';
import './v6-luxury.css';

/** Live Gen2 Cloud Run / Firebase Functions checkout endpoint (not a relative /api path). */
const CHECKOUT_BACKEND_URL = 'https://createcheckoutsession-lip26fm72a-uc.a.run.app';

const PLAN_ID_MAP: Record<string, string> = {
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
};

function AppShell() {
  const { resolved, toggle } = useTheme();
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
      console.log(session);
      if (session.url) {
        window.location.href = session.url;
        return;
      }

      // Reliable fallback when Cloud Function is IAM/CORS blocked.
      const paymentLink = getStripePaymentLinkForPlan(planId);
      if (paymentLink) {
        window.location.href = paymentLink;
        return;
      }

      alert(session.error || 'Failed to get checkout URL.');
    } catch (error) {
      console.error('Stripe Checkout Error:', error);
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

      {/* ====== NAVBAR ====== */}
      <nav className="v6-nav flex items-center justify-between px-8 py-5 sticky top-0 z-40">
        <div className="main-nav-links flex flex-row items-center gap-6">
          <a href="/" className="hover:text-[#D4AF37] transition">
            Home
          </a>
          <a href="/pricing" className="hover:text-[#D4AF37] transition">
            Pricing
          </a>
          <a href="/video-library" className="hover:text-[#D4AF37] transition">
            Video Library
          </a>
          <a href="/resume-studio" className="hover:text-[#D4AF37] transition">
            Resume Studio
          </a>
          <a href="/reset-password" className="hover:text-[#D4AF37] transition">
            Reset password
          </a>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="v6-theme-btn"
            onClick={toggle}
            aria-label="Toggle light and dark theme"
          >
            {resolved === 'dark' ? 'Light' : 'Dark'}
          </button>
          <a href="/" className="flex items-center">
            <img
              src="/resumora-logo.png"
              alt="Resumora.net"
              className="h-10 w-auto object-contain"
            />
          </a>
        </div>
      </nav>

      {/* ====== MAIN HERO & PRICING SECTION ====== */}
      <main className="flex flex-col items-center w-full px-4 py-16">
        <section className="v6-hero-panel flex flex-col items-center">
          <h1 className="v6-heading text-4xl md:text-5xl mb-4 text-center">
            Build Your Perfect Resume
          </h1>
          <p className="v6-subhead text-lg text-center opacity-80 mb-10 max-w-2xl">
            Select a plan to see exactly what is included, then continue to secure Stripe Checkout.
          </p>

          {/* Pricing Cards Grid */}
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

          {/* Disclaimer & Checkout Button */}
          <div className="flex flex-col items-center gap-6 w-full max-w-md">
            <div className="text-sm opacity-70 text-center px-4 py-2 border border-[#D4AF37]/30 bg-[#D4AF37]/5 rounded-lg">
              {"Selecting a plan never changes another plan's price or features."}
            </div>
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

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
