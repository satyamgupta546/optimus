import React, { useState, useEffect, useCallback } from 'react';
import { X, Calendar, Clock, User, Loader2, Eye, Download, History, Package, ChevronDown, ChevronUp, Database } from 'lucide-react';
import { LocalApiService } from '../../services/LocalApiService';
import { useWidgetContext } from '../../context/WidgetContext';
import showToast from '../../utils/toast';
import SnapshotPreview from './SnapshotPreview';

const formatDateForInput = (d) => d.toISOString().split('T')[0];

/**
 * Convert a request snapshot (or DB widget) into canvas-ready format.
 *
 * The snapshot saved in RequestWidget is the ORIGINAL canvas widget
 * (all config fields already at top level). For DB widget records,
 * config is a JSON blob that needs spreading. This handles both shapes.
 */
function dbWidgetToCanvas(widget, snapshot) {
    const src = (snapshot && Object.keys(snapshot).length > 0) ? snapshot : widget;

    // Parse JSON strings that may come from DB records
    const pnc = typeof src.pnc === 'string' ? JSON.parse(src.pnc) : (src.pnc || {});
    const config = typeof src.config === 'string' ? JSON.parse(src.config) : (src.config || {});
    const products = typeof src.products === 'string' ? JSON.parse(src.products) : (src.products || []);

    // For masthead, resolve variant if missing
    let resolvedPnc = { ...pnc };
    if ((src.type === 'masthead') && !resolvedPnc.variant) {
        const hasCarousel = Array.isArray(config.carouselItems) && config.carouselItems.length > 0;
        const hasSecondaryField = config.view_all_redirect !== undefined
            || config.media_number !== undefined
            || config.master_key !== undefined;
        if (hasCarousel || hasSecondaryField) {
            resolvedPnc.variant = 'secondary';
        } else {
            const slug = (src.slug || src.slug_name || '').toLowerCase();
            resolvedPnc.variant = /_2nd|_sm_|_sm$|secondary/.test(slug) ? 'secondary' : 'primary';
        }
    }

    // Strip internal/transient keys that shouldn't carry over
    const { id: _id, lastModified: _lm, lastModifiedBy: _lmb, ...srcFields } = src;

    return {
        ...srcFields,       // spread ALL snapshot fields first (preserves stateProducts, background_media, etc.)
        ...config,          // then spread DB config (for DB-format widgets where config is a JSON blob)
        type: src.type || widget.type || 'unknown',
        slug_name: src.slug || src.slug_name || widget.slug || '',
        title: src.title || widget.title || '',
        titleHi: src.titleHi || widget.titleHi || '',
        status: widget.status || src.status || 'DRAFT',
        pnc: resolvedPnc,   // pnc set last so config spread can't overwrite it
        products: products,
        _fetched: true,
        _fromDB: true,
        _dbId: widget.id || src.id,
    };
}

const WidgetHistory = ({ onClose }) => {
    const { addWidget } = useWidgetContext();
    const [date, setDate] = useState(formatDateForInput(new Date()));
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewId, setPreviewId] = useState(null);
    const [expandedRequests, setExpandedRequests] = useState(new Set());

    const fetchData = useCallback(async (d) => {
        setLoading(true);
        try {
            // Fetch from both BigQuery and Kinetic in parallel
            const [dbResult, kineticResult] = await Promise.allSettled([
                LocalApiService.getRequestsByDate(d),
                LocalApiService.getKineticHistory({ startDate: d, endDate: d }),
            ]);

            const dbRequests = dbResult.status === 'fulfilled' ? dbResult.value : [];

            // Merge Kinetic rows as supplementary data (BigQuery is authoritative)
            const kineticRows = kineticResult.status === 'fulfilled' ? (kineticResult.value?.rows || []) : [];

            // Group Kinetic rows by request_id to form pseudo-request objects
            const dbRequestIds = new Set(dbRequests.map(r => r.id));
            const kineticByRequest = {};
            for (const row of kineticRows) {
                if (dbRequestIds.has(row.request_id)) continue; // already in BigQuery
                if (!kineticByRequest[row.request_id]) {
                    kineticByRequest[row.request_id] = {
                        id: row.request_id,
                        status: row.status,
                        createdAt: row.dt,
                        submitter: { email: row.submitted_by, name: row.submitted_by?.split('@')[0] },
                        type: 'Homepage Update',
                        _source: 'kinetic',
                        requestWidgets: [],
                    };
                }
                kineticByRequest[row.request_id].requestWidgets.push({
                    id: `${row.request_id}_${row.widget_id}`,
                    widget: {
                        id: row.widget_id,
                        type: row.widget_type,
                        slug: row.slug,
                        title: row.title,
                    },
                    snapshot: row.snapshot ? (typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot) : null,
                });
            }

            // Tag BigQuery requests
            const taggedDb = dbRequests.map(r => ({ ...r, _source: 'bigquery' }));
            const mergedRequests = [...taggedDb, ...Object.values(kineticByRequest)];

            setRequests(mergedRequests);
            setExpandedRequests(new Set(mergedRequests.map(r => r.id)));
        } catch (err) {
            console.error('Failed to fetch history:', err);
            showToast.error('Failed to load history');
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (date) fetchData(date);
    }, [date, fetchData]);

    const setQuickDate = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        setDate(formatDateForInput(d));
    };

    const setThisWeek = () => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        setDate(formatDateForInput(d));
    };

    const handleLoadToCanvas = (widget, snapshot) => {
        const canvasWidget = dbWidgetToCanvas(widget, snapshot);
        addWidget(canvasWidget);
        showToast.success(`Loaded "${canvasWidget.slug_name || canvasWidget.title}" to canvas`);
    };

    const toggleExpand = (requestId) => {
        setExpandedRequests(prev => {
            const next = new Set(prev);
            next.has(requestId) ? next.delete(requestId) : next.add(requestId);
            return next;
        });
    };

    const formatTime = (iso) => {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const formatDisplayDate = (dateStr) => {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'APPROVED': return 'bg-green-100 text-green-700';
            case 'PENDING': return 'bg-yellow-100 text-yellow-700';
            case 'REJECTED': return 'bg-red-100 text-red-700';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    const totalWidgets = requests.reduce((sum, r) => sum + (r.requestWidgets?.length || 0), 0);

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-sm border-l border-slate-200 z-50 flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Calendar size={18} className="text-slate-500" />
                            <div>
                                <h2 className="text-sm font-bold text-slate-800">Widget History</h2>
                                <p className="text-[11px] text-slate-400 mt-0.5">Browse submitted widgets by date</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Date Controls */}
                <div className="p-3 border-b border-slate-200 bg-white shrink-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <label className="text-[11px] font-semibold text-slate-400">Date:</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="px-2.5 py-1 text-[13px] rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300 focus:border-slate-300"
                        />
                        <div className="flex gap-1.5">
                            <button
                                onClick={() => setQuickDate(0)}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${date === formatDateForInput(new Date())
                                    ? 'bg-slate-800 border-slate-800 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setQuickDate(-1)}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Yesterday
                            </button>
                            <button
                                onClick={setThisWeek}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                This Week
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <Loader2 size={32} className="animate-spin mb-3" />
                            <span className="text-sm">Loading history...</span>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <History size={40} className="mb-3 text-slate-300" />
                            <h4 className="font-semibold text-slate-600 mb-1">No Submissions Found</h4>
                            <p className="text-sm">No widgets were submitted on {formatDisplayDate(date)}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-slate-500 mb-4 text-center">
                                {requests.length} submission{requests.length !== 1 ? 's' : ''} &middot; {totalWidgets} widget{totalWidgets !== 1 ? 's' : ''} on {formatDisplayDate(date)}
                            </p>

                            <div className="space-y-3">
                                {requests.map(req => {
                                    const isExpanded = expandedRequests.has(req.id);
                                    const widgetCount = req.requestWidgets?.length || 0;
                                    const submitter = req.submitter?.name || req.submitter?.email?.split('@')[0] || 'unknown';

                                    return (
                                        <div key={req.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-200 transition-all">
                                            {/* Request Header — always visible */}
                                            <button
                                                onClick={() => toggleExpand(req.id)}
                                                className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-slate-50 transition-colors"
                                            >
                                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                                                    <Package size={16} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[13px] font-bold text-slate-800">
                                                            {widgetCount} Widget{widgetCount !== 1 ? 's' : ''}
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getStatusBadge(req.status)}`}>
                                                            {req.status}
                                                        </span>
                                                        {req._source === 'kinetic' && (
                                                            <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-cyan-50 text-cyan-600 flex items-center gap-0.5">
                                                                <Database size={8} />
                                                                Kinetic
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-0.5">
                                                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                            <User size={10} />
                                                            {submitter}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Time — prominent on the right */}
                                                <div className="text-right shrink-0">
                                                    <div className="text-[13px] font-bold text-indigo-600 flex items-center gap-1">
                                                        <Clock size={12} />
                                                        {formatTime(req.createdAt)}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                        {req.type || 'Homepage Update'}
                                                    </div>
                                                </div>

                                                <div className="shrink-0 text-slate-400">
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </div>
                                            </button>

                                            {/* Widgets inside this request */}
                                            {isExpanded && req.requestWidgets?.length > 0 && (
                                                <div className="border-t border-slate-100 bg-slate-50/50 divide-y divide-slate-100">
                                                    {req.requestWidgets.map((rw) => {
                                                        const w = rw.widget || {};
                                                        const snap = (rw.snapshot && Object.keys(rw.snapshot).length > 0) ? rw.snapshot : null;
                                                        const widgetType = w.type || snap?.type || '';
                                                        const slug = w.slug || snap?.slug || snap?.slug_name || '';
                                                        const title = w.title || snap?.title || '';
                                                        const isPreview = previewId === rw.id;

                                                        return (
                                                            <div key={rw.id} className="px-3 py-2.5">
                                                                <div className="flex items-center gap-3">
                                                                    {/* Widget info */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <code className="text-xs font-bold text-slate-700 truncate">
                                                                                {slug || 'untitled'}
                                                                            </code>
                                                                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-200 text-slate-500 uppercase shrink-0">
                                                                                {widgetType}
                                                                            </span>
                                                                        </div>
                                                                        {title && (
                                                                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{title}</p>
                                                                        )}
                                                                    </div>

                                                                    {/* Actions */}
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <button
                                                                            onClick={() => setPreviewId(isPreview ? null : rw.id)}
                                                                            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${isPreview
                                                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                                            }`}
                                                                        >
                                                                            <Eye size={11} />
                                                                            Preview
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleLoadToCanvas(w, snap || { ...rw.config, pnc: rw.pnc, hierarchy: rw.hierarchy })}
                                                                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                                                        >
                                                                            <Download size={11} />
                                                                            Load to Canvas
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {/* Inline Preview */}
                                                                {isPreview && (
                                                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                                                        <SnapshotPreview
                                                                            snapshot={{
                                                                                type: widgetType,
                                                                                title,
                                                                                ...(snap || {}),
                                                                                ...(typeof snap?.config === 'string' ? JSON.parse(snap.config) : (snap?.config || {})),
                                                                                ...(typeof rw.config === 'string' ? JSON.parse(rw.config) : (rw.config || {})),
                                                                            }}
                                                                            label={slug}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 p-3 bg-white shrink-0 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                        {requests.length} submission{requests.length !== 1 ? 's' : ''} &middot; {totalWidgets} widget{totalWidgets !== 1 ? 's' : ''}
                    </p>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-[13px]"
                    >
                        Close
                    </button>
                </div>
            </div>
        </>
    );
};

export default WidgetHistory;
