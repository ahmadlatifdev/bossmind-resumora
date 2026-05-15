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
npm run resumora:support:mail:verify
npm run resumora:support:ai:arch-lock -- --i-understand-external-ops-manual --notes="Gmail+n8n live; human approval on legal; auto-send pricing/status only"
```

`resumora:support:mail:verify` resolves **MX / SPF / DMARC / common DKIM selectors** for `RESUMORA_MAIL_DOMAIN` (default `resumora.net`), writes `windows-heal/reports/resumora-support-mail-verification-*.json`, and (when `NEON_DATABASE_URL` is set) locks **`resumora_support_mail_verification`** in `last_confirmed_checkpoint` plus `event_log` row `support_mail.verification_report`. It does **not** send mail or toggle Workspace auto-reply.

## Duplicate / loop prevention (n8n + Neon)

1. Before sending an auto-reply, n8n calls **`POST /api/orchestration/support-mail-dedupe`** with JSON `{ "messageId": "<Gmail RFC822 Message-ID>", "threadId": "..." }` and header **`Authorization: Bearer $BOSSMIND_SUPPORT_WEBHOOK_SECRET`** (or fallback orchestration secret).
2. Response `{ "sendAutoReply": true }` means this worker **won** the idempotency claim; `{ "duplicate": true }` means **do not send** (replay / double trigger).

## Branded templates (copy into n8n or Workspace canned response)

- **`config/resumora-support-branded-reply-templates.json`** — EN/FR acknowledgment text and attachment policy notes.

## Verification checklist (operator)

- [ ] `npm run resumora:support:mail:verify` — DNS band pass/warn; JSON report under `windows-heal/reports/`.
- [ ] Gmail API healthy; **support@** receives and sends test (Workspace / n8n).
- [ ] n8n calls dedupe API before send; **no duplicate sends** on replay.
- [ ] Emergency stop (`BOSSMIND_SUPPORT_AI_EMERGENCY_STOP`) tested.
- [ ] Refund/legal path **never** auto-sent without human.
- [ ] EN/FR (and AR if enabled) reply smoke tests.
- [ ] Neon rows appear per `eventTypes` in JSON.

## References

- `config/resumora-ai-support-mail-architecture.json`
- `pages/api/orchestration/support-mail-dedupe.js`
- `pages/api/support-intake.js` (site chat acknowledgment — separate from Gmail)
- `docs/BOSSMIND_CAPITAL_CORE_STACK.md` (general n8n + AI governance patterns)
