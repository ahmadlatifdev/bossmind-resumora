import asyncio
import os
import edge_tts

OUT = 'artifacts/representer/voice'
os.makedirs(OUT, exist_ok=True)

# 3 short brand sentences (EN / FR / ES), professional male voices (same family the pipeline uses)
VOICES = [
    ('en', 'en-US-ChristopherNeural', "Your résumé. Your next chapter."),
    ('fr', 'fr-FR-HenriNeural', "Votre CV. Un nouveau départ."),
    ('es', 'es-ES-AlvaroNeural', "Tu currículum. Tu próximo capítulo."),
]

async def main():
    for lang, voice, text in VOICES:
        out = os.path.join(OUT, f'{lang}.mp3')
        tts = edge_tts.Communicate(text, voice, rate='-12%')
        await tts.save(out)
        print(f'{lang}: "{text}" -> {out}')

asyncio.run(main())
