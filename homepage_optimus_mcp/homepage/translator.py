"""
Hindi Auto-Translator — translates English text to Hindi using Google Translate (free, no API key).
Used for: sub-cat text_hi, category text_hi, widget heading_hi, SPR heading_hi.
NOT used for: multimedia widgets.
"""

import asyncio
import urllib.request
import urllib.parse
import json

_cache = {}


async def to_hindi(text: str) -> str:
    """Translate English text to Hindi. Returns empty string if input is empty."""
    if not text or not text.strip():
        return ""

    # Check cache
    if text in _cache:
        return _cache[text]

    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = urllib.parse.urlencode({
            "client": "gtx",
            "sl": "en",
            "tl": "hi",
            "dt": "t",
            "q": text,
        })
        req = urllib.request.Request(f"{url}?{params}", headers={"User-Agent": "SAM-Bot/1.0"})
        resp = await asyncio.to_thread(lambda: urllib.request.urlopen(req, timeout=30))
        data = json.loads(resp.read())
        hindi = data[0][0][0]
        _cache[text] = hindi
        return hindi
    except Exception:
        # If translate fails, return empty — don't block widget creation
        return ""
