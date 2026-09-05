# Master Admin — post-audit test plan

Run on `https://resumora.net/admin/master` after the audit branch is deployed (or local `npm run build` + preview with admin APIs).

## Prep

1. Unlock with admin password.
2. Open DevTools Network (optional) — filter `/api/admin`.

## Checklist

| #   | Action                                    | Expected                                                                                                      |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Click **Refresh**                         | After ~400ms slow path, “Refreshing…” then “Dashboard data refreshed.” Cards update without full page reload. |
| 2   | Click **Run system heal**                 | Browser confirm appears; Cancel does nothing. OK → success notice or clear error.                             |
| 3   | Click **System Health**                   | Navigates to heal page; no language switcher.                                                                 |
| 4   | Orchestration: select a card              | Card highlights; hash updates.                                                                                |
| 5   | Click **Open Hermes Chat** on ElegancyArt | Scrolls to Hermes Chat; dropdown shows ElegancyArt.                                                           |
| 6   | Click **Visit** on Resumora               | Opens `https://resumora.net` in new tab.                                                                      |
| 7   | Confirm no Pause/Resume control           | Note explains catalog-only.                                                                                   |
| 8   | AI Agents: **Load insights**              | Text or friendly error if Hermes down; metrics update when online.                                            |
| 9   | Toggle Hermes Client Chat                 | Notice enabled/disabled; checkbox persists after Refresh.                                                     |
| 10  | Hermes Chat: change project               | Header updates; prior messages for other project retained when switching back.                                |
| 11  | Hermes Chat: Send                         | Typing line appears; reply shows with engine (`hermes` or `gemini`).                                          |
| 12  | Hermes Chat: **Clear chat**               | Clears active project thread only.                                                                            |
| 13  | Reload page                               | Selected project restored from session.                                                                       |
| 14  | Tasks: **Refresh tasks**                  | “Tasks list updated.” or error.                                                                               |
| 15  | **Create sample LOG_LEVEL task**          | New pending task appears.                                                                                     |
| 16  | ACK then **Mark applied**                 | Status transitions; optional deploy link if workflow ran.                                                     |
| 17  | Toggle **Allow auto-deploy**              | On/off notice; survives Refresh.                                                                              |
| 18  | Financials: Refresh                       | Totals/cards or 404 until Functions deployed.                                                                 |
| 19  | Nav: Financials / Users / Settings        | Smooth scroll to section.                                                                                     |
| 20  | NOIR LUXE                                 | Opens standalone HTML; Master Admin theme unchanged.                                                          |
| 21  | Tablet ~1024px                            | No horizontal page scroll; buttons usable.                                                                    |
| 22  | Keyboard                                  | Tab through Refresh/Heal/Open Hermes Chat/Send; Enter activates.                                              |

## Failures to escalate

- Heal without confirm dialog.
- Visit opens wrong domain.
- Send shows secrets or crashes silently.
- Pause/Resume that stops Cloud Run (must not exist).
