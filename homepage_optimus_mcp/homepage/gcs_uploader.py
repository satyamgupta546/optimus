"""
GCS Uploader — Upload images to Google Cloud Storage bucket.
Bucket: gs://optimus-widget-media (project: apna-mart-data)
Public URL: https://storage.googleapis.com/optimus-widget-media/{path}

Same bucket used by Optimus frontend (server/services/GCSService.js).
"""

from google.cloud import storage
import time
import math

BUCKET_NAME = "optimus-widget-media"
PROJECT_ID = "apna-mart-data"

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = storage.Client(project=PROJECT_ID)
    return _client


def upload_image(image_bytes: bytes, filename: str = "", content_type: str = "image/jpeg", folder: str = "mcp") -> str:
    """Upload image bytes to GCS. Returns public URL.

    Args:
        image_bytes: Raw image bytes
        filename: Optional filename (auto-generated if empty)
        content_type: MIME type
        folder: GCS folder prefix (default: mcp/)

    Returns: Public URL string, or empty string on failure
    """
    try:
        client = _get_client()
        bucket = client.bucket(BUCKET_NAME)

        if not filename:
            timestamp = int(time.time() * 1000)
            random_part = math.floor(time.time() * 1000) % 1000000
            ext = ".jpg" if "jpeg" in content_type else ".png" if "png" in content_type else ".jpg"
            filename = f"{timestamp}-{random_part}{ext}"

        gcs_path = f"{folder}/{filename}"
        blob = bucket.blob(gcs_path)
        blob.upload_from_string(image_bytes, content_type=content_type)

        public_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{gcs_path}"
        return public_url
    except Exception as e:
        print(f"[GCS] Upload failed: {e}")
        return ""
