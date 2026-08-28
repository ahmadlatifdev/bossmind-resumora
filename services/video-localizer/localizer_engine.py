"""
Video Localization Engine
Fixed async event loop issues and added audio time-stretching
"""

import os
import asyncio
import edge_tts
from moviepy.editor import VideoFileClip, AudioFileClip
from pydub import AudioSegment
from pydub.effects import speedup
import tempfile
import logging
import requests
from gtts import gTTS
from deep_translator import GoogleTranslator

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import ElevenLabs for premium TTS
try:
    from elevenlabs.client import ElevenLabs
    from elevenlabs import VoiceSettings
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False
    if not hasattr(logger, '_elevenlabs_warned'):
        logger.warning("ElevenLabs not installed. Install with: pip install elevenlabs")
        logger._elevenlabs_warned = True

# Try to import Coqui TTS for high-quality local voices
try:
    from TTS.api import TTS
    COQUI_TTS_AVAILABLE = True
except ImportError:
    COQUI_TTS_AVAILABLE = False
    if not hasattr(logger, '_coqui_warned'):
        logger.warning("Coqui TTS not installed. Install with: pip install TTS")
        logger._coqui_warned = True

# Initialize HF Token (optional - only used for NLLB translation fallback)
HF_TOKEN = os.environ.get("HF_TOKEN")

# ElevenLabs API Key (from environment or set dynamically via UI)
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")
_elevenlabs_client = None
_elevenlabs_status = None


def set_elevenlabs_api_key(api_key: str):
    """Set ElevenLabs API key dynamically from UI input."""
    global ELEVENLABS_API_KEY, _elevenlabs_client, _elevenlabs_status
    ELEVENLABS_API_KEY = api_key
    _elevenlabs_client = None
    _elevenlabs_status = None

def validate_elevenlabs_api_key(api_key: str) -> tuple[bool, str]:
    """
    Validate ElevenLabs API key format and test connection.
    
    Returns:
        (is_valid, error_message)
    """
    if not api_key:
        return False, "API key is empty"
    
    # Check format: should start with "sk_" and be reasonable length
    if not api_key.startswith("sk_"):
        return False, "API key format invalid (should start with 'sk_')"
    
    if len(api_key) < 40:
        return False, f"API key too short (got {len(api_key)} chars, expected 40+)"
    
    if not ELEVENLABS_AVAILABLE:
        return False, "ElevenLabs package not installed (pip install elevenlabs)"
    
    # Test connection with a simple API call
    try:
        test_client = ElevenLabs(api_key=api_key)
        # Try to get user info - this validates the key
        user_info = test_client.user.get()
        return True, "API key valid"
    except Exception as e:
        error_str = str(e).lower()
        if "unauthorized" in error_str or "401" in error_str or "invalid" in error_str:
            return False, f"API key invalid or expired: {str(e)}"
        elif "quota" in error_str or "limit" in error_str:
            # Key is valid but quota exceeded - still valid for format
            return True, "API key valid (quota exceeded)"
        elif "network" in error_str or "connection" in error_str or "timeout" in error_str:
            return False, f"Network error: {str(e)}"
        else:
            return False, f"Connection test failed: {str(e)}"

def check_elevenlabs_quota() -> tuple[bool, str]:
    """
    Check ElevenLabs quota/credits availability.
    
    Returns:
        (has_quota, status_message)
    """
    client = _get_elevenlabs_client()
    if client is None:
        return False, "ElevenLabs client not available"
    
    try:
        user_info = client.user.get()
        if hasattr(user_info, 'subscription'):
            sub = user_info.subscription
            tier = sub.tier if hasattr(sub, 'tier') else 'N/A'
            
            # Check character limits
            if hasattr(sub, 'character_count') and hasattr(sub, 'character_limit'):
                used = sub.character_count
                limit = sub.character_limit
                remaining = limit - used
                
                if remaining <= 0:
                    return False, f"Quota exhausted: {used}/{limit} characters used"
                elif remaining < 1000:
                    return True, f"Low quota: {remaining}/{limit} characters remaining"
                else:
                    return True, f"Quota available: {remaining}/{limit} characters remaining"
            else:
                return True, f"Subscription active (tier: {tier})"
        else:
            return True, "Subscription info unavailable"
    except Exception as e:
        error_str = str(e).lower()
        if "quota" in error_str or "limit" in error_str:
            return False, f"Quota check failed: {str(e)}"
        else:
            # Non-critical error, assume quota available
            return True, f"Quota check unavailable: {str(e)}"

def _get_elevenlabs_client():
    """Lazy-load ElevenLabs client with validation and diagnostics"""
    global _elevenlabs_client, _elevenlabs_status
    
    if _elevenlabs_client is not None:
        return _elevenlabs_client
    
    if not ELEVENLABS_AVAILABLE:
        if _elevenlabs_status is None:
            logger.warning("⚠️ ElevenLabs unavailable: Package not installed. Install with: pip install elevenlabs")
            _elevenlabs_status = "not_installed"
        return None
    
    # Validate API key first
    is_valid, error_msg = validate_elevenlabs_api_key(ELEVENLABS_API_KEY)
    
    if not is_valid:
        logger.warning(f"⚠️ ElevenLabs unavailable: {error_msg}")
        _elevenlabs_status = "invalid_key"
        return None
    
    # Initialize client
    try:
        _elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        logger.info("✅ ElevenLabs client initialized")
        
        # Check quota and log status
        has_quota, quota_msg = check_elevenlabs_quota()
        if has_quota:
            logger.info(f"✅ ElevenLabs ready: {quota_msg}")
            _elevenlabs_status = "ready"
        else:
            logger.warning(f"⚠️ ElevenLabs quota issue: {quota_msg}")
            _elevenlabs_status = "quota_exceeded"
            # Still return client - let the TTS function handle quota errors
        
        # Log subscription info for debugging
        try:
            user_info = _elevenlabs_client.user.get()
            if hasattr(user_info, 'subscription'):
                sub = user_info.subscription
                tier = sub.tier if hasattr(sub, 'tier') else 'N/A'
                logger.info(f"ElevenLabs subscription tier: {tier}")
        except Exception as quota_check_error:
            logger.debug(f"Could not get subscription details (non-critical): {quota_check_error}")
            
    except Exception as e:
        error_str = str(e).lower()
        if "unauthorized" in error_str or "401" in error_str:
            logger.error(f"❌ ElevenLabs authentication failed: Invalid API key")
        elif "network" in error_str or "connection" in error_str:
            logger.error(f"❌ ElevenLabs connection failed: Network error - {str(e)}")
        else:
            logger.error(f"❌ ElevenLabs initialization failed: {str(e)}")
        _elevenlabs_status = "init_failed"
        return None
    
    return _elevenlabs_client

# Import local whisper - required for transcription
import whisper

# Cache for local whisper model (lazy-loaded)
_local_whisper_model = None

def _get_local_whisper():
    """Lazy-load local whisper model (base model ~150MB, good balance of speed/accuracy)"""
    global _local_whisper_model
    if _local_whisper_model is None:
        logger.info("Loading local Whisper model (base)... This may take a moment on first run.")
        _local_whisper_model = whisper.load_model("base")
        logger.info("✅ Local Whisper model loaded")
    return _local_whisper_model


# Cache for Coqui TTS models
_coqui_tts_models = {}

def _get_coqui_tts(language: str):
    """Lazy-load Coqui TTS model for a language"""
    global _coqui_tts_models
    
    if not COQUI_TTS_AVAILABLE:
        return None
    
    # Use a single multilingual model for all languages (more efficient)
    model_key = "multilingual"
    
    if model_key not in _coqui_tts_models:
        try:
            # Use XTTS v2 - high-quality multilingual model
            # Supports: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh, ja, hu, ko
            logger.info(f"Loading Coqui TTS multilingual model (XTTS v2)... This may take a moment on first run.")
            tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)
            _coqui_tts_models[model_key] = tts
            logger.info(f"✅ Coqui TTS model loaded")
        except Exception as e:
            logger.warning(f"Failed to load Coqui TTS model: {e}")
            return None
    
    return _coqui_tts_models.get(model_key)


async def _coqui_tts_fallback(text: str, language: str, output_file: str) -> None:
    """High-quality TTS using Coqui TTS (runs in executor)."""
    def _generate():
        tts = _get_coqui_tts(language)
        if tts is None:
            raise Exception("Coqui TTS model not available")
        
        # XTTS v2 language codes (supported languages)
        lang_codes = {
            "es": "es",  # Spanish
            "fr": "fr",  # French
            "de": "de",  # German
            "it": "it",  # Italian
            "ja": "ja",  # Japanese
            "zh": "zh",  # Chinese
            "ar": "ar",  # Arabic
            "hi": "en",  # Hindi not directly supported, use English as fallback
        }
        lang_code = lang_codes.get(language, "en")
        
        # Generate speech with XTTS v2
        # XTTS v2 requires speaker_wav for cloning, but we can use it without for basic TTS
        try:
            tts.tts_to_file(text=text, file_path=output_file, language=lang_code)
        except Exception as e:
            # If language-specific generation fails, try with English
            if lang_code != "en":
                logger.warning(f"Coqui TTS failed for {language}, trying English...")
                tts.tts_to_file(text=text, file_path=output_file, language="en")
            else:
                raise
    
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _generate)


async def _elevenlabs_tts(text: str, language: str, output_file: str) -> None:
    """Premium TTS using ElevenLabs Voice Library (runs in executor)."""
    def _generate():
        client = _get_elevenlabs_client()
        if client is None:
            raise Exception("ElevenLabs client not available")
        
        # Map languages to ElevenLabs voice IDs from their voice library
        # Using multilingual voices that support multiple languages well
        voice_map = {
            "es": "pNInz6obpgDQGcFmaJgB",  # Adam - works well for Spanish
            "fr": "EXAVITQu4vr4xnSDxMaL",  # Bella - works well for French
            "de": "ErXwobaYiN019PkySvjV",  # Antoni - works well for German
            "it": "MF3mGyEYCl7XYWbV9V6O",  # Elli - works well for Italian
            "ja": "TxGEqnHWrfWFTfGW9XjX",  # Josh - works well for Japanese
            "zh": "VR6AewLTigWG4xSOukaG",  # Arnold - works well for Chinese
            "hi": "pNInz6obpgDQGcFmaJgB",  # Adam - fallback for Hindi
            "ar": "EXAVITQu4vr4xnSDxMaL",  # Bella - fallback for Arabic
        }
        
        # Get voice ID, default to Adam if language not mapped
        voice_id = voice_map.get(language, "pNInz6obpgDQGcFmaJgB")
        
        # Use turbo model for efficiency (fewer credits) while maintaining good quality
        # For longer texts, we'll chunk them to stay within quota limits
        model_id = "eleven_turbo_v2_5"  # Fast and credit-efficient
        
        # Use lower quality format to minimize credits (still sounds good)
        # mp3_22050_32 uses fewer credits than mp3_44100_128
        output_format = "mp3_22050_32"  # Lower credits, still good quality
        
        try:
            # Check text length - ElevenLabs uses character-based pricing
            # The error "60 credits required" for 120 chars suggests ~0.5 credits per char
            # To work within any quota limits, use small chunks
            # Note: Even with 109k+ subscription credits, there may be per-request character limits
            max_chars_per_request = 100  # Reasonable chunk size - should work with most quotas
            
            # Always chunk if text is longer than threshold to minimize per-request costs
            if len(text) > max_chars_per_request:
                logger.info(f"Text is {len(text)} chars, chunking into small pieces for ElevenLabs (max {max_chars_per_request} chars per chunk)...")
                # Split by sentences first, then by commas, then by spaces if needed
                import re
                # First try splitting by sentences
                sentences = re.split(r'([.!?]\s+)', text)
                chunks = []
                current_chunk = ""
                
                for i in range(0, len(sentences), 2):
                    sentence = sentences[i] + (sentences[i+1] if i+1 < len(sentences) else "")
                    
                    # If single sentence is too long, split by commas, then by spaces if needed
                    if len(sentence) > max_chars_per_request:
                        parts = re.split(r'([,;]\s+)', sentence)
                        for j in range(0, len(parts), 2):
                            part = parts[j] + (parts[j+1] if j+1 < len(parts) else "")
                            
                            # If part is still too long, split by spaces
                            if len(part) > max_chars_per_request:
                                words = part.split()
                                for word in words:
                                    if len(current_chunk) + len(word) + 1 > max_chars_per_request:
                                        if current_chunk:
                                            chunks.append(current_chunk.strip())
                                        current_chunk = word + " "
                                    else:
                                        current_chunk += word + " "
                            elif len(current_chunk) + len(part) > max_chars_per_request:
                                if current_chunk:
                                    chunks.append(current_chunk.strip())
                                current_chunk = part
                            else:
                                current_chunk += part
                    elif len(current_chunk) + len(sentence) > max_chars_per_request:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                        current_chunk = sentence
                    else:
                        current_chunk += sentence
                
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                logger.info(f"Split text into {len(chunks)} chunks for efficient credit usage")
                
                # Generate audio for each chunk and concatenate
                combined = AudioSegment.empty()
                for idx, chunk in enumerate(chunks):
                    logger.info(f"Generating ElevenLabs audio for chunk {idx+1}/{len(chunks)} ({len(chunk)} chars)...")
                    try:
                        chunk_audio_stream = client.text_to_speech.convert(
                            voice_id=voice_id,
                            text=chunk,
                            model_id=model_id,
                            output_format=output_format
                        )
                        # Save chunk to temp file
                        chunk_file = output_file.replace('.mp3', f'_chunk_{idx}.mp3')
                        with open(chunk_file, "wb") as f:
                            for chunk_data in chunk_audio_stream:
                                f.write(chunk_data)
                        # Validate chunk audio file
                        if not os.path.exists(chunk_file) or os.path.getsize(chunk_file) == 0:
                            raise Exception(f"Chunk {idx+1} audio file is empty or missing")
                        
                        # Load and concatenate
                        chunk_audio = AudioSegment.from_file(chunk_file)
                        if len(chunk_audio) == 0:
                            raise Exception(f"Chunk {idx+1} audio has zero duration")
                        
                        logger.debug(f"Chunk {idx+1} audio: {len(chunk_audio)}ms, {os.path.getsize(chunk_file)} bytes")
                        combined += chunk_audio
                        # Clean up temp file
                        os.remove(chunk_file)
                    except Exception as chunk_error:
                        # Enhanced error handling with specific error types
                        error_str = str(chunk_error).lower()
                        error_msg = str(chunk_error)
                        
                        # Clean up any partial files first
                        for cleanup_idx in range(idx + 1):
                            cleanup_file = output_file.replace('.mp3', f'_chunk_{cleanup_idx}.mp3')
                            if os.path.exists(cleanup_file):
                                os.remove(cleanup_file)
                        
                        # Categorize error
                        if 'quota' in error_str or 'credits' in error_str or 'limit' in error_str:
                            logger.warning(f"⚠️ ElevenLabs quota/credit limit reached on chunk {idx+1}/{len(chunks)}")
                            logger.warning(f"   Error: {error_msg}")
                            logger.info("   Falling back to alternative TTS methods...")
                            raise Exception("ElevenLabs quota exceeded") from chunk_error
                        elif 'unauthorized' in error_str or '401' in error_str or 'invalid' in error_str:
                            logger.error(f"❌ ElevenLabs authentication failed on chunk {idx+1}")
                            logger.error(f"   Error: {error_msg}")
                            logger.error("   Check your ELEVENLABS_API_KEY environment variable")
                            raise Exception("ElevenLabs authentication failed") from chunk_error
                        elif 'network' in error_str or 'connection' in error_str or 'timeout' in error_str:
                            logger.warning(f"⚠️ ElevenLabs network error on chunk {idx+1}: {error_msg}")
                            logger.info("   Falling back to alternative TTS methods...")
                            raise Exception("ElevenLabs network error") from chunk_error
                        else:
                            logger.warning(f"⚠️ ElevenLabs error on chunk {idx+1}: {error_msg}")
                            logger.info("   Falling back to alternative TTS methods...")
                            raise  # Re-raise to trigger fallback
                
                # Validate combined audio
                if len(combined) == 0:
                    raise Exception("Combined audio has zero duration")
                
                # Export combined audio
                combined.export(output_file, format="mp3")
                
                # Verify exported file
                if not os.path.exists(output_file) or os.path.getsize(output_file) == 0:
                    raise Exception("Exported audio file is empty or missing")
                
                logger.info(f"✅ Combined {len(chunks)} ElevenLabs audio chunks ({len(combined)}ms, {os.path.getsize(output_file)} bytes)")
            else:
                # Generate audio with ElevenLabs for short texts (under max_chars_per_request)
                logger.info(f"Generating ElevenLabs audio for short text ({len(text)} chars)...")
                audio_stream = client.text_to_speech.convert(
                    voice_id=voice_id,
                    text=text,
                    model_id=model_id,
                    output_format=output_format
                )
                
                # Save to file
                with open(output_file, "wb") as f:
                    bytes_written = 0
                    for chunk in audio_stream:
                        f.write(chunk)
                        bytes_written += len(chunk)
                
                # Validate saved file
                if not os.path.exists(output_file) or os.path.getsize(output_file) == 0:
                    raise Exception("Generated audio file is empty or missing")
                
                # Verify audio can be loaded and has duration
                file_size = os.path.getsize(output_file)
                try:
                    test_audio = AudioSegment.from_file(output_file)
                    audio_duration = len(test_audio)
                    if audio_duration == 0:
                        raise Exception("Generated audio has zero duration")
                    logger.info(f"✅ ElevenLabs audio generated successfully ({len(text)} chars, {audio_duration}ms, {file_size} bytes)")
                except Exception as validation_error:
                    logger.error(f"❌ Audio validation failed: {validation_error}")
                    raise Exception(f"Generated audio is invalid: {validation_error}") from validation_error
                    
        except Exception as e:
            error_str = str(e).lower()
            error_msg = str(e)
            
            # Enhanced error categorization
            if 'quota' in error_str or 'credits' in error_str or 'limit' in error_str:
                logger.warning(f"⚠️ ElevenLabs quota/credit limit reached: {error_msg}")
                logger.warning("   Note: This might be a character-based quota limit, not subscription credits.")
                logger.warning("   ElevenLabs uses character credits which may be separate from your subscription balance.")
                logger.info("   Falling back to alternative TTS methods...")
                raise Exception("ElevenLabs quota exceeded") from e
            elif 'unauthorized' in error_str or '401' in error_str or 'invalid' in error_str or 'authentication' in error_str:
                logger.error(f"❌ ElevenLabs authentication failed: {error_msg}")
                logger.error("   Check your ELEVENLABS_API_KEY environment variable")
                logger.error("   Get a valid API key from: https://elevenlabs.io/app/settings/api-keys")
                raise Exception("ElevenLabs authentication failed") from e
            elif 'network' in error_str or 'connection' in error_str or 'timeout' in error_str:
                logger.warning(f"⚠️ ElevenLabs network error: {error_msg}")
                logger.info("   Falling back to alternative TTS methods...")
                raise Exception("ElevenLabs network error") from e
            elif 'service' in error_str or 'unavailable' in error_str or '503' in error_str or '500' in error_str:
                logger.warning(f"⚠️ ElevenLabs service unavailable: {error_msg}")
                logger.info("   Falling back to alternative TTS methods...")
                raise Exception("ElevenLabs service unavailable") from e
            else:
                logger.warning(f"⚠️ ElevenLabs TTS generation failed: {error_msg}")
                logger.info("   Falling back to alternative TTS methods...")
                raise  # Re-raise to trigger fallback
    
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _generate)


async def _gtts_fallback(text: str, language: str, output_file: str) -> None:
    """Last resort TTS using gTTS (runs in executor)."""
    gtts_languages = {
        "es": "es",
        "fr": "fr",
        "de": "de",
        "it": "it",
        "ja": "ja",
        "zh": "zh-CN",
        "hi": "hi",
        "ar": "ar",
        "en": "en"
    }
    lang_code = gtts_languages.get(language, "en")

    def _save():
        tts = gTTS(text=text, lang=lang_code)
        tts.save(output_file)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _save)


async def text_to_speech(text: str, language: str, output_file: str) -> None:
    """Generate speech using ElevenLabs (PRIMARY), with fallbacks to Edge TTS, Coqui TTS, and gTTS"""
    
    # Method 1: PRIMARY - ElevenLabs (Premium professional-grade TTS)
    if ELEVENLABS_AVAILABLE:
        try:
            logger.info(f"Generating TTS with ElevenLabs (premium quality) for {language}...")
            await _elevenlabs_tts(text, language, output_file)
            logger.info("✅ TTS generated via ElevenLabs (premium quality)")
            return
        except Exception as elevenlabs_error:
            logger.warning(f"ElevenLabs TTS failed: {elevenlabs_error}")
            # Continue to fallbacks
    
    # Method 2: Fallback - Edge TTS (High quality, free)
    voices = {
        "es": ["es-ES-AlvaroNeural", "es-ES-ElviraNeural"],
        "fr": ["fr-FR-HenriNeural", "fr-FR-DeniseNeural"],
        "de": ["de-DE-KillianNeural", "de-DE-KatjaNeural"],
        "it": ["it-IT-DiegoNeural", "it-IT-ElsaNeural"],
        "ja": ["ja-JP-KeitaNeural", "ja-JP-NanamiNeural"],
        "zh": ["zh-CN-YunxiNeural", "zh-CN-XiaoxiaoNeural"],
        "hi": ["hi-IN-MadhurNeural", "hi-IN-SwaraNeural"],
        "ar": ["ar-SA-HamedNeural", "ar-SA-ZariyahNeural"]
    }
    
    voice_list = voices.get(language, ["en-US-ChristopherNeural", "en-US-AriaNeural"])
    max_retries = 3
    retry_delay = 2  # seconds
    
    last_error = None
    for attempt in range(max_retries):
        for voice in voice_list:
            try:
                logger.info(f"Trying Edge TTS (attempt {attempt + 1}/{max_retries}, voice: {voice})...")
                
                # Create communicate object with timeout
                communicate = edge_tts.Communicate(text, voice)
                
                # Save with timeout protection
                try:
                    await asyncio.wait_for(
                        communicate.save(output_file),
                        timeout=60.0  # 60 second timeout
                    )
                    logger.info(f"✅ TTS generated via Edge TTS: {language} (voice: {voice})")
                    return  # Success!
                except asyncio.TimeoutError:
                    logger.warning(f"TTS timeout for voice {voice}, trying next...")
                    continue
                except Exception as e:
                    error_msg = str(e)
                    last_error = e  # Capture the error
                    # Check if it's a 403 or connection error
                    if "403" in error_msg or "Invalid response status" in error_msg:
                        logger.warning(f"Edge TTS 403/connection error with voice {voice}: {e}")
                        # Wait before trying next voice
                        await asyncio.sleep(retry_delay)
                        continue
                    else:
                        raise  # Re-raise if it's a different error
                        
            except Exception as e:
                last_error = e  # Always capture the error
                error_msg = str(e)
                if "403" in error_msg or "Invalid response status" in error_msg:
                    logger.warning(f"Edge TTS error (attempt {attempt + 1}): {e}")
                    if attempt < max_retries - 1:
                        # Exponential backoff
                        wait_time = retry_delay * (2 ** attempt)
                        logger.info(f"Waiting {wait_time}s before retry...")
                        await asyncio.sleep(wait_time)
                        continue
                else:
                    # For other errors, try next voice immediately
                    continue
    
    # Method 3: Fallback - Coqui TTS (high-quality local neural TTS)
    if COQUI_TTS_AVAILABLE:
        try:
            logger.warning("Edge TTS failed. Trying Coqui TTS (high-quality local)...")
            await _coqui_tts_fallback(text, language, output_file)
            logger.info("✅ TTS generated via Coqui TTS (high quality)")
            return
        except Exception as coqui_error:
            logger.warning(f"Coqui TTS failed: {coqui_error}")
            last_error = last_error or coqui_error
    
    # Method 4: Last resort - gTTS (mechanical but reliable)
    try:
        logger.warning("Falling back to gTTS (mechanical quality)...")
        await _gtts_fallback(text, language, output_file)
        logger.info("✅ TTS generated via gTTS fallback")
        return
    except Exception as fallback_error:
        logger.error(f"gTTS fallback failed: {fallback_error}")
        last_error = last_error or fallback_error

    error_details = str(last_error) if last_error else "Unknown error (all TTS methods failed)"
    error_msg = (
        f"Failed to generate TTS with all methods (ElevenLabs, Edge TTS, Coqui TTS, gTTS). "
        f"Last error: {error_details}. "
        f"This might be due to network issues or TTS service unavailability."
    )
    logger.error(error_msg)
    raise Exception(error_msg)


def transcribe_audio(audio_path: str) -> str:
    """Transcribe audio using local Whisper model (primary method)"""
    try:
        logger.info("Transcribing audio with local Whisper...")
        
        # Use local Whisper as the primary and only method
        # This is more reliable than cloud APIs which are frequently unavailable
        model = _get_local_whisper()
        result = model.transcribe(audio_path)
        text = result.get("text", "").strip()
        
        if text:
            logger.info(f"✅ Transcribed: {len(text)} characters")
            return text
        else:
            logger.warning("Whisper returned empty transcription")
            return "Error identifying speech."
        
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return "Error identifying speech."


def translate_text(text: str, target_lang: str) -> str:
    """Translate text using deep-translator (primary) with NLLB API fallback"""
    
    # Don't translate error messages or empty text
    if text == "Error identifying speech." or not text.strip():
        return text
    
    try:
        logger.info(f"Translating to {target_lang}...")
        
        # Method 1: Primary - deep-translator (local, reliable, no API key needed)
        try:
            # Map language codes for deep-translator
            translator_lang_map = {
                "es": "es",
                "fr": "fr",
                "de": "de",
                "it": "it",
                "ja": "ja",
                "zh": "zh-CN",  # Chinese simplified
                "hi": "hi",
                "ar": "ar"
            }
            translator_target = translator_lang_map.get(target_lang, target_lang)
            translator = GoogleTranslator(source='en', target=translator_target)
            translated = translator.translate(text)
            
            if translated and translated != text and translated.strip():
                logger.info(f"✅ Translated via deep-translator: {len(translated)} characters")
                return translated.strip()
            else:
                logger.warning("deep-translator returned empty or same text")
        except Exception as e:
            logger.warning(f"deep-translator failed: {e}")
        
        # Method 2: Fallback - NLLB via HF API (only if HF_TOKEN is available)
        if HF_TOKEN:
            try:
                # NLLB language codes mapping
                nllb_codes = {
                    "es": "spa_Latn",
                    "fr": "fra_Latn",
                    "de": "deu_Latn",
                    "it": "ita_Latn",
                    "ja": "jpn_Jpan",
                    "zh": "zho_Hans",
                    "hi": "hin_Deva",
                    "ar": "arb_Arab"
                }
                tgt_lang = nllb_codes.get(target_lang, "spa_Latn")
                
                api_url = "https://router.huggingface.co/hf-inference/models/facebook/nllb-200-distilled-600M"
                headers = {
                    "Authorization": f"Bearer {HF_TOKEN}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "inputs": text,
                    "parameters": {"src_lang": "eng_Latn", "tgt_lang": tgt_lang}
                }
                response = requests.post(api_url, headers=headers, json=payload, timeout=30)
                
                if response.status_code == 200:
                    data = response.json()
                    translated = ""
                    if isinstance(data, list) and data:
                        translated = data[0].get("translation_text", "")
                    elif isinstance(data, dict):
                        translated = data.get("translation_text", "")
                    
                    translated = (translated or "").strip()
                    if translated and translated != text:
                        logger.info(f"✅ Translated via NLLB: {len(translated)} characters")
                        return translated
                    else:
                        logger.warning("NLLB returned empty or same text")
                else:
                    logger.warning(f"NLLB translation returned {response.status_code}: {response.text[:100]}")
            except requests.exceptions.Timeout:
                logger.warning("NLLB translation timed out")
            except Exception as e:
                logger.warning(f"NLLB translation failed: {e}")
        else:
            logger.debug("HF_TOKEN not set, skipping NLLB translation fallback")
        
        # Last resort: return original text with warning
        logger.error("All translation methods failed, using original text")
        return text
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text  # Return original if translation fails


def adjust_audio_duration(audio_path: str, target_duration_ms: int, output_path: str) -> bool:
    """
    Adjust audio duration to match video using time-stretching.
    
    Args:
        audio_path: Input audio file
        target_duration_ms: Target duration in milliseconds
        output_path: Output audio file
        
    Returns:
        Success boolean
    """
    try:
        logger.info(f"Adjusting audio duration to {target_duration_ms}ms...")
        
        # Load audio
        audio = AudioSegment.from_file(audio_path)
        current_duration = len(audio)
        
        if current_duration == 0:
            logger.error("Audio has zero duration")
            return False
        
        # Calculate speed ratio (how much to speed up/slow down)
        # If current is 10s and target is 8s, we need to speed up by 10/8 = 1.25x
        speed_ratio = current_duration / target_duration_ms
        
        logger.info(f"Current audio: {current_duration}ms, target: {target_duration_ms}ms, ratio: {speed_ratio:.2f}x")
        
        # Apply speed change (limit to reasonable range to avoid distortion)
        # Only adjust if ratio is between 0.7 and 1.5 (more conservative to avoid corruption)
        if 0.7 <= speed_ratio <= 1.5:
            try:
                # Use speedup function - it handles both speeding up and slowing down
                adjusted = speedup(audio, playback_speed=speed_ratio)
                
                # Verify adjusted duration is reasonable (should be close to target)
                adjusted_duration = len(adjusted)
                if adjusted_duration == 0:
                    logger.error("Adjusted audio has zero duration")
                    return False
                
                # Check if adjusted duration is reasonable (within 30% of target)
                duration_diff = abs(adjusted_duration - target_duration_ms) / target_duration_ms
                if duration_diff > 0.3:
                    logger.warning(f"Adjusted duration ({adjusted_duration}ms) too far from target ({target_duration_ms}ms), using original")
                    audio.export(output_path, format="mp3", bitrate="128k")
                    return True
                
                # Export with proper parameters
                adjusted.export(output_path, format="mp3", bitrate="128k")
                
                # Verify output file exists and has reasonable size
                if not os.path.exists(output_path):
                    logger.error("Adjusted audio file was not created")
                    return False
                
                output_size = os.path.getsize(output_path)
                input_size = os.path.getsize(audio_path)
                
                # Check if output is suspiciously small (less than 20% of input)
                if output_size < input_size * 0.2:
                    logger.warning(f"Adjusted audio file too small ({output_size} bytes vs {input_size} bytes), using original")
                    audio.export(output_path, format="mp3", bitrate="128k")
                    return True
                
                logger.info(f"✅ Audio adjusted: {current_duration}ms → {adjusted_duration}ms ({speed_ratio:.2f}x, {output_size} bytes)")
                return True
            except Exception as adjust_error:
                logger.warning(f"Audio adjustment failed: {adjust_error}, using original")
                audio.export(output_path, format="mp3", bitrate="128k")
                return True
        else:
            logger.warning(f"Speed ratio {speed_ratio:.2f}x out of safe range (0.7-1.5), using original audio")
            # Just copy original audio
            audio.export(output_path, format="mp3", bitrate="128k")
            return True
            
    except Exception as e:
        logger.error(f"Audio adjustment failed: {e}")
        # Try to copy original as fallback
        try:
            audio = AudioSegment.from_file(audio_path)
            audio.export(output_path, format="mp3", bitrate="128k")
            logger.warning("Using original audio as fallback")
            return True
        except:
            return False


async def process_video_async(video_path: str, target_lang: str = "es") -> tuple:
    """
    Main async pipeline: Video -> Audio -> Text -> Trans-Text -> Audio -> Video
    
    Returns:
        (output_path, original_text, translated_text)
    """
    
    temp_dir = tempfile.mkdtemp()
    audio_path = os.path.join(temp_dir, "extracted_audio.mp3")
    tts_path = os.path.join(temp_dir, "tts_audio.mp3")
    adjusted_audio_path = os.path.join(temp_dir, "adjusted_audio.mp3")
    output_video_path = os.path.join(temp_dir, f"output_{target_lang}.mp4")
    
    video = None
    new_audio = None
    
    try:
        logger.info(f"Starting video localization to {target_lang}...")
        
        # 1. Extract Audio
        video = VideoFileClip(video_path)
        video_duration_ms = int(video.duration * 1000)
        video.audio.write_audiofile(audio_path, verbose=False, logger=None)
        logger.info(f"✅ Audio extracted ({video.duration:.1f}s)")
        
        # 2. Transcribe
        original_text = transcribe_audio(audio_path)
        
        # 3. Translate
        translated_text = translate_text(original_text, target_lang)
        
        # 4. Generate TTS
        # Split long text into chunks to avoid rate limiting
        if len(translated_text) > 500:
            logger.info(f"Text is long ({len(translated_text)} chars), splitting into chunks...")
            # Split by sentences if possible
            import re
            sentences = re.split(r'([.!?]\s+)', translated_text)
            chunks = []
            current_chunk = ""
            for i in range(0, len(sentences), 2):
                sentence = sentences[i] + (sentences[i+1] if i+1 < len(sentences) else "")
                if len(current_chunk) + len(sentence) > 500:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                    current_chunk = sentence
                else:
                    current_chunk += sentence
            if current_chunk:
                chunks.append(current_chunk.strip())
            
            # Generate TTS for each chunk and concatenate
            chunk_files = []
            for idx, chunk in enumerate(chunks):
                chunk_file = os.path.join(temp_dir, f"tts_chunk_{idx}.mp3")
                await text_to_speech(chunk, target_lang, chunk_file)
                chunk_files.append(chunk_file)
            
            # Concatenate audio chunks
            combined = AudioSegment.empty()
            for chunk_file in chunk_files:
                chunk_audio = AudioSegment.from_file(chunk_file)
                combined += chunk_audio
            combined.export(tts_path, format="mp3")
            logger.info(f"✅ Combined {len(chunks)} TTS chunks")
        else:
            await text_to_speech(translated_text, target_lang, tts_path)
        
        # 5. Validate TTS audio file before processing
        if not os.path.exists(tts_path):
            raise Exception(f"TTS audio file not found: {tts_path}")
        
        file_size = os.path.getsize(tts_path)
        if file_size == 0:
            raise Exception(f"TTS audio file is empty: {tts_path}")
        
        # Basic validation - just check file exists and has content
        logger.info(f"✅ TTS audio file ready: {file_size} bytes")
        
        # 5. Adjust audio duration to match video (with validation)
        # First, check original audio duration
        try:
            original_audio = AudioSegment.from_file(tts_path)
            original_duration_ms = len(original_audio)
            logger.info(f"Original TTS audio duration: {original_duration_ms}ms, target: {video_duration_ms}ms")
            
            # Only adjust if there's a significant difference (>20%)
            duration_diff = abs(original_duration_ms - video_duration_ms) / video_duration_ms
            if duration_diff > 0.2:
                success = adjust_audio_duration(tts_path, video_duration_ms, adjusted_audio_path)
                
                # Validate adjusted audio before using it
                if success and os.path.exists(adjusted_audio_path):
                    adjusted_size = os.path.getsize(adjusted_audio_path)
                    original_size = os.path.getsize(tts_path)
                    
                    # Verify adjusted audio duration is reasonable (within 50% of target)
                    try:
                        test_audio = AudioSegment.from_file(adjusted_audio_path)
                        adjusted_duration_ms = len(test_audio)
                        
                        # Check if adjusted duration is reasonable (at least 50% of target, max 150%)
                        if adjusted_duration_ms >= video_duration_ms * 0.5 and adjusted_duration_ms <= video_duration_ms * 1.5:
                            audio_to_use = adjusted_audio_path
                            logger.info(f"✅ Using adjusted audio: {adjusted_duration_ms}ms (target: {video_duration_ms}ms), {adjusted_size} bytes")
                        else:
                            logger.warning(f"⚠️ Adjusted audio duration ({adjusted_duration_ms}ms) not reasonable for target ({video_duration_ms}ms), using original")
                            audio_to_use = tts_path
                    except Exception as validation_error:
                        logger.warning(f"⚠️ Could not validate adjusted audio: {validation_error}, using original")
                        audio_to_use = tts_path
                else:
                    logger.warning("⚠️ Audio adjustment failed, using original")
                    audio_to_use = tts_path
            else:
                logger.info(f"Audio duration close enough ({duration_diff*100:.1f}% difference), using original")
                audio_to_use = tts_path
        except Exception as e:
            logger.warning(f"⚠️ Could not check audio duration: {e}, using original")
            audio_to_use = tts_path
        
        logger.info(f"✅ Final audio to use: {os.path.getsize(audio_to_use)} bytes")
        
        # 6. Merge audio with video - validate audio file first
        if not os.path.exists(audio_to_use) or os.path.getsize(audio_to_use) == 0:
            raise Exception(f"Audio file for merging is missing or empty: {audio_to_use}")
        
        logger.info(f"Merging audio ({os.path.getsize(audio_to_use)} bytes) with video...")
        new_audio = AudioFileClip(audio_to_use)
        
        # Verify audio clip is valid and has reasonable duration
        audio_duration = new_audio.duration
        if audio_duration == 0:
            logger.error(f"❌ Audio clip has zero duration")
            raise Exception("Audio clip has zero duration - cannot merge with video")
        
        # CRITICAL: If audio is much shorter than video, it will be mostly silent
        # Fall back to original TTS audio if adjusted one is too short
        if audio_duration < video.duration * 0.3:
            logger.warning(f"⚠️ Audio duration ({audio_duration:.2f}s) is too short for video ({video.duration:.2f}s)")
            logger.warning("   This would create a mostly silent video. Trying original TTS audio...")
            
            # Try original TTS audio
            if audio_to_use != tts_path and os.path.exists(tts_path):
                new_audio.close()
                try:
                    new_audio = AudioFileClip(tts_path)
                    audio_duration = new_audio.duration
                    if audio_duration > video.duration * 0.3:
                        logger.info(f"✅ Using original TTS audio: {audio_duration:.2f}s")
                    else:
                        logger.error(f"❌ Original TTS audio also too short: {audio_duration:.2f}s")
                        raise Exception(f"TTS audio too short ({audio_duration:.2f}s) for video ({video.duration:.2f}s)")
                except Exception as e:
                    logger.error(f"❌ Could not use original TTS audio: {e}")
                    raise Exception(f"Cannot create video with valid audio: {e}")
            else:
                raise Exception(f"Audio too short ({audio_duration:.2f}s) for video ({video.duration:.2f}s) - would be mostly silent")
        
        logger.info(f"✅ Audio clip loaded: {audio_duration:.2f}s (video: {video.duration:.2f}s)")
        final_video = video.set_audio(new_audio)
        
        # 7. Write output
        logger.info("Writing output video...")
        final_video.write_videofile(
            output_video_path,
            codec='libx264',
            audio_codec='aac',
            verbose=False,
            logger=None
        )
        
        logger.info(f"✅ Video localization complete!")
        return output_video_path, original_text, translated_text
        
    except Exception as e:
        logger.error(f"Pipeline Error: {e}")
        return None, str(e), "Error"
        
    finally:
        # Cleanup
        if video: video.close()
        if new_audio: new_audio.close()


def process_video_sync(video_path: str, target_lang: str = "es") -> tuple:
    """
    Synchronous wrapper for async video processing.
    Handles event loop creation safely.
    
    Returns:
        (output_path, original_text, translated_text)
    """
    try:
        # Try to get existing event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're already in an async context, create a new loop
            import nest_asyncio
            nest_asyncio.apply()
            return loop.run_until_complete(process_video_async(video_path, target_lang))
        else:
            # No running loop, safe to use asyncio.run()
            return asyncio.run(process_video_async(video_path, target_lang))
    except RuntimeError:
        # No event loop exists, create one
        return asyncio.run(process_video_async(video_path, target_lang))


# Convenience alias for backward compatibility
def process_video(video_path: str, target_lang: str = "es") -> tuple:
    """
    Main entry point for video localization.
    Wrapper around process_video_sync for convenience.
    
    Returns:
        (output_path, original_text, translated_text)
    """
    return process_video_sync(video_path, target_lang)


# ==========================
# Startup Validation
# ==========================
# Validate ElevenLabs on module import
def _validate_elevenlabs_on_startup():
    """Validate ElevenLabs on module import."""
    global ELEVENLABS_AVAILABLE, _elevenlabs_status
    logger.info("Initializing Video Localization Engine...")
    
    if not ELEVENLABS_AVAILABLE:
        logger.info("ElevenLabs not installed. Using open source models (EdgeTTS, Coqui, gTTS)")
        _elevenlabs_status = "not_installed"
        return
    
    if ELEVENLABS_API_KEY:
        is_valid, message = validate_elevenlabs_api_key(ELEVENLABS_API_KEY)
        if is_valid:
            logger.info("ElevenLabs API key found and validated")
            _elevenlabs_status = "ready"
        else:
            logger.info(f"ElevenLabs API key not valid. Using open source models: {message}")
            _elevenlabs_status = "invalid_key"
    else:
        logger.info("No ElevenLabs API key found. Using open source models (EdgeTTS, Coqui, gTTS)")
        logger.info("Add your API key in the UI for premium voice quality")
        _elevenlabs_status = "no_key"

# Run validation on import
_validate_elevenlabs_on_startup()
