# BOSSMIND AGENTS.md

## SESSION START PROTOCOL (mandatory)

At the beginning of EVERY session, before responding to the user's first message, you MUST:

1. Read HARNESS_STATE.json
2. Read the last 5 entries of HARNESS_PROGRESS.md
3. State the current task and next action in one sentence
4. Wait for the user's instruction before writing any files

## RULES

- Use write_to_file or edit_file for all file writes. Never use Canvas.
- After every file write, run git status and confirm the file exists on disk.
- Commit and push every meaningful change.
- Maximum 10 files modified per session. If more are needed, split into phases.
- Never touch Stripe code, firestore.rules security, or environment secrets without explicit approval.
