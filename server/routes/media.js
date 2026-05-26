import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { uploadToDrive, isDriveAvailable } from '../services/DriveService.js';
import { uploadToGCS, isGCSAvailable } from '../services/GCSService.js';
import { authMiddleware } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = process.env.VERCEL
  ? '/tmp/uploads'
  : path.join(__dirname, '..', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_MIMETYPES = /^image\/(jpeg|png|gif|webp|svg\+xml|bmp|tiff)$/;

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' not allowed. Only images are accepted.`));
    }
  },
});

const router = Router();

// ── POST /media/upload ── (auth required)
// 1. multer saves file to server/uploads/ (temp)
// 2. If Google Drive credentials exist → uploads to Drive → returns Drive URL
// 3. If no credentials → falls back to local server URL
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const localFilePath = path.join(UPLOADS_DIR, req.file.filename);
  const localViewUrl = `/api/local/media/files/${req.file.filename}`;

  // Try GCS upload first (preferred — permanent, public URL)
  try {
    const gcsResult = await uploadToGCS(
      localFilePath,
      req.file.originalname,
      req.file.mimetype
    );

    if (gcsResult) {
      // GCS upload succeeded — delete local temp file
      fs.unlink(localFilePath, (err) => {
        if (err) console.warn('[media] Failed to delete temp file:', err.message);
      });

      console.log('[media] Uploaded to GCS:', gcsResult.publicUrl);

      return res.json({
        success: true,
        storage: 'gcs',
        fileName: gcsResult.fileName,
        viewUrl: gcsResult.publicUrl,
        bucket: gcsResult.bucket,
      });
    }
  } catch (err) {
    console.error('[media] GCS upload failed, trying Drive:', err.message);
  }

  // Fallback: Google Drive upload
  try {
    const driveResult = await uploadToDrive(
      localFilePath,
      req.file.originalname,
      req.file.mimetype
    );

    if (driveResult) {
      fs.unlink(localFilePath, (err) => {
        if (err) console.warn('[media] Failed to delete temp file:', err.message);
      });

      console.log('[media] Uploaded to Drive:', driveResult.fileId);

      return res.json({
        success: true,
        storage: 'drive',
        fileId: driveResult.fileId,
        fileName: driveResult.fileName,
        viewUrl: driveResult.directUrl,
        driveViewUrl: driveResult.viewUrl,
        driveFileId: driveResult.fileId,
      });
    }
  } catch (err) {
    console.error('[media] Drive upload failed, falling back to local:', err.message);
  }

  // Last fallback: local server storage (won't persist on Vercel)
  res.json({
    success: true,
    storage: 'local',
    fileId: req.file.filename,
    fileName: req.file.originalname,
    viewUrl: localViewUrl,
  });
});

// ── GET /media/files/:filename ──
// Serves locally uploaded files
router.get('/files/:filename', (req, res) => {
  const sanitized = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, sanitized);

  if (!filePath.startsWith(UPLOADS_DIR)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.sendFile(filePath);
});

// ── GET /media/status ──
// Check if Google Drive is configured
router.get('/status', (_req, res) => {
  res.json({
    gcsConfigured: isGCSAvailable(),
    gcsBucket: 'optimus-widget-media',
    driveConfigured: isDriveAvailable(),
    localUploadDir: UPLOADS_DIR,
  });
});

export default router;
