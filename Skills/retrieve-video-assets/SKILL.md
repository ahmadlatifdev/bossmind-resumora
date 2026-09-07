# Skill: retrieve-video-assets

Use when the operator asks to **list**, **manage**, or **inspect the video library / assets**.

## Workflow

1. Call the Resumora `videocatalog` service (`GET /api/video/catalog` or Cloud Run `videocatalog`).
2. For each video, report **title**, **status**, and **bucket path** only.
3. Prefer `python skills/retrieve-video-assets/video_toolkit.py` locally, or the Node skill `skill:retrieve-video-assets` via Hermes toolRouter.

## Hard rules

- Never invent catalog rows.
- Never print Stripe secrets, admin passwords, or webhook secrets.
- Do **not** route these requests to `video-script-gen` (script outline skill).

## Triggers

- library, video library, manage videos, video assets, catalog, list videos, bucket path
