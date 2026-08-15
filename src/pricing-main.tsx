import React from "react";
import { createRoot } from "react-dom/client";
import PricingPage from "./pages/PricingPage";
import "./pricing.css";

const rootEl = document.getElementById("pricing-root");
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <PricingPage />
    </React.StrictMode>
  );
}
