import React from "react";
import { createRoot } from "react-dom/client";
import VideosPage from "./pages/VideosPage";
import "./pricing.css";
import "./app-shell.css";

const el = document.getElementById("videos-root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <VideosPage />
    </React.StrictMode>
  );
}
