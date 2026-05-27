import { Router } from 'express';
import * as SubmissionService from '../services/SubmissionService.js';
import * as BQ from '../services/BigQueryService.js';

const router = Router();

// ── GET /activity?page=1&limit=50&action=approve ──
// Reads history from submissions table (no separate activity_log)
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const actionFilter = req.query.action || undefined;

    const rows = await BQ.selectRows('submissions', {
      orderBy: 'created_at DESC',
      limit: 200,
    });

    // Flatten all history entries across submissions
    const allLogs = [];
    for (const row of (rows || [])) {
      for (const h of (row.history || [])) {
        allLogs.push({
          action: h.action,
          by: h.by || '',
          at: h.at || '',
          requestId: row.request_id,
          slug: row.slug,
          reason: h.reason || undefined,
        });
      }
    }

    // Sort by time descending
    allLogs.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    // Filter by action
    const filtered = actionFilter ? allLogs.filter(l => l.action === actionFilter) : allLogs;

    // Paginate
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);
    const total = filtered.length;

    res.json({
      logs: paged,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /activity ──
// Appends to history of a submission
router.post('/', async (req, res, next) => {
  try {
    const { action, targetId, details } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });
    if (!targetId) return res.status(400).json({ error: 'targetId (request_id) is required' });

    await SubmissionService.appendHistory(targetId, action, req.user, details || {});

    res.status(201).json({
      action,
      by: req.user.email,
      at: new Date().toISOString(),
      requestId: targetId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
