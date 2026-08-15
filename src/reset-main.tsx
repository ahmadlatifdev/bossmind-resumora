import React from "react";
import { createRoot } from "react-dom/client";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import "./pricing.css";
import "./app-shell.css";

const el = document.getElementById("reset-root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <ResetPasswordPage />
    </React.StrictMode>
  );
}
