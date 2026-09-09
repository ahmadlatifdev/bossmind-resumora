# Premium Interview Series v1

Enterprise education library foundation for Resumora (BossMind global client interface).

| #   | Video ID                  | Title (EN)                                     | Duration | Scripts                           |
| --- | ------------------------- | ---------------------------------------------- | -------- | --------------------------------- |
| 1   | `vid-resume-to-interview` | Resume-to-Interview Mastery (ATS Optimization) | ≤8:00    | [01](./01-resume-to-interview.md) |
| 2   | `vid-star-behavioral`     | Behavioral & STAR Method Excellence            | ≤8:00    | [02](./02-star-behavioral.md)     |
| 3   | `vid-situational-async`   | Situational & Asynchronous Interview Strategy  | ≤8:00    | [03](./03-situational-async.md)   |
| 4   | `vid-global-career`       | Multi-Language & Global Career Positioning     | ≤8:00    | [04](./04-global-career.md)       |

**Languages:** EN, FR, ES (Admin Video Asset Manager language buttons).  
**Playback placeholders:** public MDN / W3Schools MP4s until private `gs://resumora-videos` masters are approved.  
**TTV prompts:** [ttv-prompts.json](./ttv-prompts.json) for Veo / HeyGen / script-based studios.  
**Catalog SSoT (Functions):** `functions/interviewSeriesCatalog.js`  
**Client library:** `src/lib/videoLibrary.js`

## Production path (chosen)

**Script-based production** (this PR): ship full EN/FR/ES scripts + catalog wiring + playable demos.  
Generate 12 final 1080p masters offline (4 topics × 3 langs), then replace `url_mp4_en|fr|es` in Firestore / catalog. Veo/HeyGen optional later — do not block the library on them.

## Tier note

Public pricing remains Free / Pro (+ Advanced / Enterprise plan cards as configured). This series is the **education-videos** package for a future Enterprise / white-label / team-collaboration tier — fields `series_tier`, `white_label_ready`, `team_collab_ready` are already on catalog docs.
