/**
 * GCSService — Google Cloud Storage upload for widget media.
 *
 * Bucket: gs://optimus-widget-media (project: apna-mart-data, region: asia-south1)
 * Public read: allUsers have objectViewer access
 * Public URL: https://storage.googleapis.com/optimus-widget-media/{filename}
 *
 * Uses Application Default Credentials (gcloud auth / service account).
 */

import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

const BUCKET_NAME = 'optimus-widget-media';
const PROJECT_ID = 'apna-mart-data';

let storage;
try {
    const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credJson) {
        const credentials = JSON.parse(credJson);
        storage = new Storage({ projectId: PROJECT_ID, credentials });
    } else {
        storage = new Storage({ projectId: PROJECT_ID });
    }
} catch (err) {
    console.warn('[GCS] Failed to initialize Storage client:', err.message);
    storage = null;
}

/**
 * Upload a local file to GCS bucket.
 * @param {string} localFilePath - Full path to local file
 * @param {string} originalName - Original filename for reference
 * @param {string} mimeType - File MIME type
 * @returns {object|null} { publicUrl, fileName, bucket } or null on failure
 */
export async function uploadToGCS(localFilePath, originalName, mimeType) {
    if (!storage) {
        console.warn('[GCS] Storage client not available');
        return null;
    }

    try {
        const ext = path.extname(originalName) || path.extname(localFilePath) || '.png';
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1e9);
        const gcsFileName = `widgets/${timestamp}-${random}${ext}`;

        const bucket = storage.bucket(BUCKET_NAME);

        await bucket.upload(localFilePath, {
            destination: gcsFileName,
            metadata: {
                contentType: mimeType,
                cacheControl: 'public, max-age=31536000',
            },
        });

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;

        console.log(`[GCS] Uploaded: ${originalName} → ${publicUrl}`);

        return {
            publicUrl,
            fileName: gcsFileName,
            bucket: BUCKET_NAME,
            originalName,
        };
    } catch (err) {
        console.error('[GCS] Upload failed:', err.message);
        return null;
    }
}

/**
 * Check if GCS is available and configured.
 */
export function isGCSAvailable() {
    return storage !== null;
}
