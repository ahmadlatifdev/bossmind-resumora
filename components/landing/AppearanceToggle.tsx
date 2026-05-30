"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "@/styles/luxury/appearance.module.css";

export type AppearanceMode = "light" | "dark" | "system";

const STORAGE_KEY = "resumora-appearance";

const OPTIONS: { id: AppearanceMode; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Bright workspace" },
  { id: "dark", label: "Dark", hint: "True black, low glare" },
  { id: "system", label: "System", hint: "Match OS preference" },
];

export function readStoredMode(): AppearanceMode {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

function resolveTheme(mode: AppearanceMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyAppearance(mode: AppearanceMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveTheme(mode);
  root.dataset.appearance = mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function useAppearance(defaultMode: AppearanceMode = "dark") {
  const [mode, setModeState] = useState<AppearanceMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    return readStoredMode();
  });

  useEffect(() => {
    applyAppearance(mode);
    if (mode !== "system") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: AppearanceMode) => {
    setModeState(next);
    applyAppearance(next);
  }, []);

  return { mode, setMode };
}

export function AppearanceToggle() {
  const { mode, setMode } = useAppearance("dark");
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.settingsWrap}>
      <button
        type="button"
        className={styles.settingsButton}
        aria-label="Appearance settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        ◐
      </button>

      {open ? (
        <div className={`lux-glass ${styles.settingsPanel}`} role="dialog" aria-label="Appearance">
          <p className={styles.panelTitle}>Appearance</p>
          <p className={styles.panelHint}>Light, dark, or system. Saved for this browser.</p>
          <div className={styles.themeOptions}>
            {OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`${styles.themeOption} ${mode === opt.id ? styles.themeOptionActive : ""}`}
                onClick={() => {
                  setMode(opt.id);
                  setOpen(false);
                }}
              >
                <span>
                  {opt.label}
                  <br />
                  <small style={{ color: "var(--lux-muted)", fontWeight: 400 }}>{opt.hint}</small>
                </span>
                {mode === opt.id ? <span className={styles.themeBadge}>Active</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
