import React, { useState } from 'react';

const PLAN_ID_MAP: Record<string, string> = {
  price_29: 'basic',
  price_49: 'balanced',
  price_79: 'professional',
  price_110: 'advanced',
};

function App() {
  // React State for the selected Stripe Price ID
  const [selectedStripePriceId, setSelectedStripePriceId] = useState<string | null>(null);

  // Handles clicking a plan card
  const handlePlanClick = (priceId: string) => {
    setSelectedStripePriceId(priceId);

    // UI Update: Remove active class from all cards, add to the clicked one
    document.querySelectorAll('.pricing-plan').forEach(el => el.classList.remove('active'));
    const activeElement = document.getElementById(`plan-${priceId}`);
    if (activeElement) activeElement.classList.add('active');

    // UI Update: Change the checkout button text to show the selected price
    const displayPriceMap: Record<string, string> = {
      'price_29': '$29', 'price_49': '$49', 'price_79': '$79', 'price_110': '$110'
    };
    const checkoutBtn = document.getElementById('checkout-button-text');
    if (checkoutBtn) {
      checkoutBtn.innerText = `Proceed to Payment (${displayPriceMap[priceId]})`;
    }
  };

  // Handles redirecting to Stripe Checkout
  const redirectToStripe = async () => {
    if (!selectedStripePriceId) {
      alert("Please select a plan first.");
      return;
    }
    try {
      const planId = PLAN_ID_MAP[selectedStripePriceId];
      const response = await fetch(
        'https://us-central1-resumora-live.cloudfunctions.net/createCheckoutSession',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, priceId: selectedStripePriceId })
        }
      );
      const session = await response.json();
      if (session.url) {
        window.location.href = session.url;
      } else {
        alert(session.error || "Failed to get checkout URL.");
      }
    } catch (error) {
      console.error("Stripe Checkout Error:", error);
      alert("Something went wrong. Please refresh the page and try again. If the issue persists, contact support.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-black dark:bg-black dark:text-zinc-50 font-sans">
      
      {/* ====== NAVBAR ====== */}
      <nav className="flex items-center justify-between px-8 py-5 bg-white border-b border-gray-200 dark:bg-black dark:border-gray-800">
        <div className="main-nav-links flex flex-row items-center gap-6">
          <a href="/" className="hover:text-blue-600 transition">Home</a>
          <a href="/pricing" className="hover:text-blue-600 transition">Pricing</a>
          <a href="/video-library" className="hover:text-blue-600 transition">Video Library</a>
          <a href="/resume-studio" className="hover:text-blue-600 transition">Resume Studio</a>
          <a href="/reset-password" className="hover:text-blue-600 transition">Reset password</a>
        </div>
        <a href="/" className="flex items-center"><img src="/resumora-logo.png" alt="Resumora.net" className="h-8 w-auto object-contain" /></a>
      </nav>

      {/* ====== MAIN HERO & PRICING SECTION ====== */}
      <main className="flex flex-col items-center w-full max-w-6xl mx-auto py-20 px-4">
        <h1 className="text-4xl font-bold mb-4 text-center">Build Your Perfect Resume</h1>
        <p className="text-lg text-center text-zinc-600 dark:text-zinc-400 mb-10 max-w-2xl">
          Select a plan to see exactly what is included, then continue to secure Stripe Checkout.
        </p>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full mb-12">
          {[
            { id: 'price_29', price: '$29', name: 'Basic' },
            { id: 'price_49', price: '$49', name: 'Pro' },
            { id: 'price_79', price: '$79', name: 'Business' },
            { id: 'price_110', price: '$110', name: 'Enterprise' }
          ].map((plan) => (
            <div 
              key={plan.id} 
              id={`plan-${plan.id}`} 
              className="pricing-plan cursor-pointer border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-2xl p-6 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200 hover:shadow-lg" 
              onClick={() => handlePlanClick(plan.id)}
            >
              <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {plan.price}<span className="text-sm font-normal text-zinc-500">{' /mo'}</span>
              </p>
              <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                <p>{'Standard Features'}</p>
                <p>{'Priority Support'}</p>
                <p>{'Advanced Tools'}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer & Checkout Button */}
        <div className="flex flex-col items-center gap-6 w-full max-w-md">
          <div className="text-sm text-zinc-500 text-center px-4 py-2 border border-yellow-500/30 bg-yellow-500/5 rounded-lg">
            {'Selecting a plan never changes another plan\'s price or features.'}
          </div>
          <button 
            id="checkout-button" 
            onClick={redirectToStripe} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-full font-bold text-lg transition-colors shadow-lg"
          >
            <span id="checkout-button-text">{'Select a plan to continue'}</span>
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
