# Skill: Stripe-Refund-Summary

Use when an admin asks for a refund status summary or owner briefing.

## Workflow

1. Use only provided refund / Stripe aggregate context (no invented amounts).
2. Separate pending requests vs completed refunds.
3. Flag risk items (repeat refunds, missing payment intent) without exposing secret IDs.
4. Recommend at most three next admin actions.

## Hard rules

- Never print `sk_live_`, `whsec_`, `pk_live_`, or raw `price_` values.
- Never invent revenue or customer PII.
- Reply in the requested language (EN / FR / ES).
