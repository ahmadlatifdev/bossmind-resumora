# Resumora — AI support mail automation (Gmail + n8n + Neon)

**Mailbox:** [support@resumora.net](mailto:support@resumora.net)

This document is the **safe professional architecture** for hands-free *operations* once credentials exist. **Nothing in Git connects Gmail or runs n8n**; that happens on **Google Workspace**, **n8n**, and **Railway** (or equivalent) with secrets outside the repo.

## Locked policy source

- **`config/resumora-ai-support-mail-architecture.json`** — routing, languages, guardrails, Neon event names, kill-switch env names.

## Stack roles (non-overlapping)

| Layer | Role |
|-------|------|
| **Gmail Workspace** | System of record for inbound/outbound mail, labels, spam, attachments, audit trail. |
| **n8n** | Triggers, branching, idempotency, Gmail API nodes, human approval gates, scheduling, alerts. |
| **DeepSeek** | Classification, urgency, language detection, structured JSON (not sole customer-facing copy on sensitive paths). |
| **ChatGPT (OpenAI)** | Polished draft **after** routing + policy; blocked from auto-send on refund/legal/payment routes. |
| **Neon** | Append-only `event_log` + optional ticket rows for thread state, dedupe keys, sentiment, status (written by n8n or a small worker). |
| **BossMind (this repo)** | Policy JSON, deploy gates, anti-leak rules, **Neon audit lock** after go-live (`npm run resumora:support:ai:arch-lock`). |

## Gmail → n8n (safe connection)

1. **Google Cloud project** (Workspace admin): enable **Gmail API** (and **Pub/Sub** if using push).  
2. **OAuth** or **domain-wide delegation** only with least privilege; store refresh tokens in **n8n credentials** or **Secret Manager**, never in git.  
3. Prefer **dedicated service account** + **delegation to support@resumora.net** over personal OAuth where policy allows.  
4. **n8n** Gmail trigger: poll or push; set **IP allowlist** / **webhook HMAC** if using inbound webhooks from Google.

## Triggers (implemented in n8n, not here)

- New mail, replies (thread id), attachments (scan first), urgency classifier, spam path — see JSON `gmailTriggers`.

## AI routing (implemented in n8n)

- Pricing / resume status: **auto-send allowed** only if `BOSSMIND_SUPPORT_AI_AUTO_SEND=1` and not `BOSSMIND_SUPPORT_AI_EMERGENCY_STOP=1`.  
- Interview: **draft + human approval**.  
- Refund / legal / payment: **human only**; optional auto-ack “we received your message” if counsel approves wording.  
- VIP: label + approval queue.  
- Spam: **archive, no reply** (avoid loops).

## Multilingual

- **EN / FR** first; **AR** optional fallback per JSON.  
- n8n should branch templates and model prompts by `language_guess`.

## Neon memory

- Use `project_key` **`resumora`** (or dedicated schema with RLS if you split workloads).  
- Emit events listed in JSON `neonPayloadShape.eventTypes`; dedupe by **Gmail `Message-Id`**.

## Dashboard / control plane

- **Primary:** n8n (switches, approval sub-workflow, metrics).  
- **Resumora Next.js admin UI** is **not** part of this delivery (protected product surface); add only after explicit product approval.

## Chrome / “Ahmed master profile”

- Mail automation is **server-side**; it does **not** require merging Chrome profiles. Keep **workspace Chrome** separate from personal (operator choice).

## Lock architecture in Neon (audit)

After Gmail + n8n + Neon are verified in production:

```bash
npm run resumora:support:ai:arch-lock -- --i-understand-external-ops-manual --notes="Gmail+n8n live; human approval on legal; auto-send pricing/status only"
```

Requires `NEON_DATABASE_URL`. Writes `task_state`, `event_log`, and `last_confirmed_checkpoint` for **`resumora_ai_support_mail_stack`**.

## Verification checklist (operator)

- [ ] Gmail API healthy; **support@** receives and sends test.  
- [ ] n8n flows active; **no duplicate sends** on replay.  
- [ ] Emergency stop webhook tested.  
- [ ] Refund/legal path **never** auto-sent without human.  
- [ ] EN/FR (and AR if enabled) reply smoke tests.  
- [ ] Neon rows appear per `eventTypes` in JSON.

## References

- `config/resumora-ai-support-mail-architecture.json`  
- `pages/api/support-intake.js` (site chat acknowledgment — separate from Gmail)  
- `docs/BOSSMIND_CAPITAL_CORE_STACK.md` (general n8n + AI governance patterns)
