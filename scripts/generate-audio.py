import os
import re
from google.cloud import texttospeech

client = texttospeech.TextToSpeechClient()

scripts = {
    "01-resume-to-interview": "docs/interview-series/01-resume-to-interview.md",
    "02-star-behavioral": "docs/interview-series/02-star-behavioral.md",
    "03-situational-async": "docs/interview-series/03-situational-async.md",
    "04-global-career": "docs/interview-series/04-global-career.md"
}

languages = {
    "en": {"code": "en-US", "voice": "en-US-Chirp3-HD-Charon"},
    "fr": {"code": "fr-FR", "voice": "fr-FR-Chirp3-HD-Charon"},
    "es": {"code": "es-ES", "voice": "es-ES-Chirp3-HD-Charon"}
}

os.makedirs("audio", exist_ok=True)


def text_chunks(text, max_bytes=4500):
    words = text.split()
    chunk = []
    size = 0
    for word in words:
        word_size = len(word.encode("utf-8")) + (1 if chunk else 0)
        if chunk and size + word_size > max_bytes:
            yield " ".join(chunk)
            chunk = []
            size = 0
        chunk.append(word)
        size += word_size
    if chunk:
        yield " ".join(chunk)

for script_name, file_path in scripts.items():
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(r'#.*\n', '', content)
    content = re.sub(r'\*\*.*?\*\*', '', content)
    content = re.sub(r'\[.*?\]', '', content)
    content = re.sub(r'## Production Notes.*', '', content, flags=re.DOTALL)
    content = re.sub(r'\n{2,}', '\n', content)
    content = content.strip()
    for lang, config in languages.items():
        print(f"Synthesizing {script_name} in {lang}...", flush=True)
        voice = texttospeech.VoiceSelectionParams(language_code=config["code"], name=config["voice"])
        audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3, speaking_rate=0.85, pitch=0.0)
        audio_content = b"".join(
            client.synthesize_speech(
                input=texttospeech.SynthesisInput(text=chunk),
                voice=voice,
                audio_config=audio_config,
            ).audio_content
            for chunk in text_chunks(content)
        )
        output_file = f"audio/{script_name}-{lang}.mp3"
        with open(output_file, 'wb') as out:
            out.write(audio_content)
        print(f"  Saved: {output_file}", flush=True)

print("\nAll audio files generated.")

