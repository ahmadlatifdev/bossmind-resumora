import React from "react";
import { createRoot } from "react-dom/client";
import StudioPage from "./pages/StudioPage";
import "./pricing.css";
import "./app-shell.css";

const el = document.getElementById("studio-root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <StudioPage />
    </React.StrictMode>
  );
}
