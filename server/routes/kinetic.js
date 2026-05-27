import { Router } from 'express';
import * as SubmissionService from '../services/SubmissionService.js';
import { isAvailable } from '../services/BigQueryService.js';
import * as WidgetData from '../services/WidgetDataService.js';

const router = Router();

// ── GET /kinetic/health ──
router.get('/health', (_req, res) => {
  res.json({
    available: isAvailable(),
    backend: 'bigquery',
    timestamp: new Date().toISOString(),
  });
});

// ── GET /kinetic/history ──
router.get('/history', async (req, res, next) => {
  try {
    const { startDate, endDate, status } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const requests = await SubmissionService.fetchRequests(req.env, { status });
    const rows = [];
    for (const r of requests) {
      for (const rw of r.requestWidgets) {
        rows.push({
          ...rw.widget,
          pnc: rw.pnc,
          hierarchy: rw.hierarchy,
          request_id: r.id,
          status: r.status,
          submitted_by: r.submittedBy,
        });
      }
    }

    res.json({ rows, count: rows.length, source: 'bigquery' });
  } catch (err) { next(err); }
});

// ── GET /kinetic/search-widgets?q=... ──
router.get('/search-widgets', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'q (search query) is required' });
    }

    const widgets = await WidgetData.listWidgets(req.env, { slug: q.trim() });
    res.json({ rows: widgets, count: widgets.length, source: 'bigquery' });
  } catch (err) { next(err); }
});

// ── GET /kinetic/catalog/batch?codes=104303,104304,... ──
router.get('/catalog/batch', async (req, res, next) => {
  try {
    if (!WidgetData.isMetabaseAvailable()) {
      return res.json({ products: {}, source: 'metabase', available: false });
    }

    const codesParam = req.query.codes || '';
    const codes = codesParam.split(',').map(c => c.trim()).filter(Boolean);

    if (codes.length === 0) {
      return res.json({ products: {}, count: 0, source: 'metabase' });
    }

    const results = await WidgetData.batchProducts(codes);
    res.json({ products: results, count: Object.keys(results).length, source: 'metabase' });
  } catch (err) { next(err); }
});

// ── POST /kinetic/deploy-sync ──
router.post('/deploy-sync', async (req, res, next) => {
  try {
    if (req.user.role !== 'CHECKER' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only CHECKER or SUPER_ADMIN can deploy' });
    }

    const { widgets } = req.body;
    if (!Array.isArray(widgets) || widgets.length === 0) {
      return res.status(400).json({ error: 'widgets array is required' });
    }

    let synced = 0;

    for (const w of widgets) {
      if (!w.requestId) {
        return res.status(400).json({ error: 'requestId is required for each widget' });
      }
      if (!w.widgetId) {
        return res.status(400).json({ error: 'widgetId is required for each widget' });
      }

      // Verify request is APPROVED before deploying
      const request = await SubmissionService.fetchRequestById(w.requestId, req.env);
      if (!request) {
        return res.status(404).json({ error: `Request ${w.requestId} not found` });
      }
      if (request.status !== 'APPROVED') {
        return res.status(400).json({ error: `Cannot deploy request in ${request.status} status. Must be APPROVED.` });
      }

      await SubmissionService.syncDeploy(w.widgetId, w.slugs || {}, req.user, req.env, w.requestId);
      synced++;
    }

    res.json({ synced, source: 'bigquery' });
  } catch (err) { next(err); }
});

export default router;
