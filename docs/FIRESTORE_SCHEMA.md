# Firestore collections (Resumora client)

## users
- user_id, name, email, cell, language, created_at

## videos
- video_id, title_EN, title_FR, title_ES, description_EN, description_FR, description_ES
- duration (300), url_mp4_en/fr/es, thumbnail, order

## user_downloads
- user_id, video_id, downloaded_at, language
- Client enforces max 5; mirrors to this collection when rules allow

## user_plans
- user_id, plan_type, amount, status, created_at

Client code in `src/lib/userAccess.js` writes `user_downloads` when Firestore rules permit, and always keeps a localStorage mirror for anonymous clients.
