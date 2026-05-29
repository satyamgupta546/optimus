import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Eye, RefreshCw, FileText, ChevronDown, ChevronUp, X, Loader2, User, AlertCircle, MessageSquare, Rocket, MapPin } from 'lucide-react';
import { useWidgetContext } from '../../context/WidgetContext';
import { useAuth } from '../../context/AuthContext';
import { LocalApiService } from '../../services/LocalApiService';
import { getCsrfToken } from '../../Backend/ApiClient';
import MapToPageModal from './MapToPageModal';
import toast from 'react-hot-toast';

// Normalize API response shape to the UI shape the component expects
const normalizeRequest = (r) => ({
    id: r.id,
    user: r.submitter?.email || 'Unknown',
    type: r.type || 'Homepage Update',
    status: r.status,
    date: r.createdAt,
    rejectionReason: r.rejectionReason || '',
    headerWidgets: r.headerWidgets || {},
    widgets: (r.requestWidgets || []).map(rw => {
        const w = rw.widget || {};
        const config = rw.config || {};
        return {
            id: w.id || rw.widgetId,
            type: w.type || '',
            slug: w.slug || '',
            title: w.title || '',
            titleHi: w.titleHi || '',
            pnc: rw.pnc || {},
            ...config,
            products: rw.products || [],
            hierarchy: rw.hierarchy || {},
            sortOrder: rw.sortOrder ?? 0,
            _dbId: rw.widgetId,
        };
    }),
});

// Helper: Format relative time
const getRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

// Status Badge Component with icons and animations
const StatusBadge = ({ status }) => {
    const config = {
        PENDING: {
            bg: 'bg-amber-50',
            border: 'border-amber-300',
            text: 'text-amber-700',
            icon: Clock,
            label: 'Pending',
            pulse: true
        },
        APPROVED: {
            bg: 'bg-emerald-50',
            border: 'border-emerald-300',
            text: 'text-emerald-700',
            icon: CheckCircle,
            label: 'Complete',
            pulse: false
        },
        REJECTED: {
            bg: 'bg-red-50',
            border: 'border-red-300',
            text: 'text-red-700',
            icon: XCircle,
            label: 'Rejected',
            pulse: false
        }
    };

    const cfg = config[status] || config.PENDING;
    const Icon = cfg.icon;

    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.pulse ? 'animate-pulse' : ''}`}>
            <Icon size={10} />
            {cfg.label}
        </span>
    );
};

// Avatar Component
const UserAvatar = ({ name, size = 'md' }) => {
    const sizeClasses = {
        sm: 'w-7 h-7 text-[10px]',
        md: 'w-8 h-8 text-xs'
    };
    const initial = name?.charAt(0)?.toUpperCase() || '?';
    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500'];
    const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;

    return (
        <div className={`${sizeClasses[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-bold shadow-sm`}>
            {initial}
        </div>
    );
};

const RequestQueue = ({ onClose, onApprove, onReject }) => {
    const { setWidgets, setHeaderWidgets } = useWidgetContext();
    const { user, logout } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); // Track which request is being actioned

    const currentUser = user || { role: 'MAKER', email: 'guest' };
    const isMaker = currentUser.role === 'MAKER';

    const [viewMode, setViewMode] = useState(isMaker ? 'ALL' : 'PENDING');
    const [expandedReqs, setExpandedReqs] = useState(new Set());
    const [selectedWidgets, setSelectedWidgets] = useState({});
    const [selectedHeaderWidgets, setSelectedHeaderWidgets] = useState({}); // Track header widget selection
    const [deployResults, setDeployResults] = useState({}); // Per-widget deploy results by req.id
    // Feature 9: Rejection reason dialog
    const [rejectDialog, setRejectDialog] = useState(null); // { req } when open
    const [rejectReason, setRejectReason] = useState('');
    // Map to Page dialog
    const [mapToPageDialog, setMapToPageDialog] = useState(null); // { reqId, slugs[] } when open

    const toggleExpand = (reqId) => {
        setExpandedReqs(prev => {
            const next = new Set(prev);
            if (next.has(reqId)) next.delete(reqId);
            else next.add(reqId);
            return next;
        });
    };

    const toggleWidgetSelection = (reqId, index) => {
        setSelectedWidgets(prev => {
            const currentSet = prev[reqId] || new Set();
            const nextSet = new Set(currentSet);
            if (nextSet.has(index)) nextSet.delete(index);
            else nextSet.add(index);
            return { ...prev, [reqId]: nextSet };
        });
    };

    const toggleHeaderWidgetSelection = (reqId, key) => {
        setSelectedHeaderWidgets(prev => {
            const currentSet = prev[reqId] || new Set();
            const nextSet = new Set(currentSet);
            if (nextSet.has(key)) nextSet.delete(key);
            else nextSet.add(key);
            return { ...prev, [reqId]: nextSet };
        });
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            // Fetch from local backend; pass status filter when viewing a specific tab
            const params = {};
            if (!isMaker && viewMode === 'PENDING') params.status = 'PENDING';

            const raw = await LocalApiService.getRequests(params);
            const data = raw.map(normalizeRequest);

            let filtered = [];

            if (isMaker) {
                // Filter by user first
                let userRequests = data.filter(r => r.user && r.user.toLowerCase() === currentUser.email.toLowerCase());

                if (viewMode === 'PENDING') {
                    filtered = userRequests.filter(r => r.status === 'PENDING');
                } else if (viewMode === 'APPROVED') {
                    filtered = userRequests.filter(r => r.status === 'APPROVED');
                } else if (viewMode === 'REJECTED') {
                    filtered = userRequests.filter(r => r.status === 'REJECTED');
                } else {
                    filtered = userRequests;
                }
            } else {
                filtered = data;
            }

            const sorted = [...filtered];
            setRequests(sorted);

            const initialSelection = {};
            const initialHeaderSelection = {};
            sorted.forEach(req => {
                if (req.widgets && req.widgets.length > 0) {
                    initialSelection[req.id] = new Set(req.widgets.map((_, i) => i));
                }
                // Initialize header widgets as selected
                const headerSet = new Set();
                if (req.headerWidgets?.primaryMasthead && req.headerWidgets.primaryMasthead.enabled !== false) {
                    headerSet.add('primaryMasthead');
                }
                if (req.headerWidgets?.secondaryMasthead && req.headerWidgets.secondaryMasthead.enabled === true) {
                    headerSet.add('secondaryMasthead');
                }
                if (headerSet.size > 0) {
                    initialHeaderSelection[req.id] = headerSet;
                }
            });
            setSelectedWidgets(initialSelection);
            setSelectedHeaderWidgets(initialHeaderSelection);
        } catch (e) {
            console.error("Failed to fetch requests", e);
            toast.error('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [viewMode]);

    const handleView = (req) => {
        console.log('[RequestQueue] handleView - Full request:', req);
        console.log('[RequestQueue] handleView - headerWidgets:', req.headerWidgets);

        let restored = false;
        if (req.widgets) {
            setWidgets(req.widgets);
            restored = true;
        }
        if (req.headerWidgets) {
            console.log('[RequestQueue] Setting headerWidgets:', JSON.stringify(req.headerWidgets, null, 2));
            setHeaderWidgets(req.headerWidgets);
            restored = true;
        }

        if (restored) {
            toast.success(`Previewing ${req.user}'s request`, { icon: '👁️' });
        } else {
            toast.error('No widget data in this request');
        }
    };

    const handleApprove = async (req) => {
        const selectedIndices = selectedWidgets[req.id] || new Set();
        const selectedHeaders = selectedHeaderWidgets[req.id] || new Set();

        // Check if at least one widget (regular or header) is selected
        if (selectedIndices.size === 0 && selectedHeaders.size === 0) {
            toast.error('Please select at least one widget to approve');
            return;
        }

        setActionLoading(req.id);
        try {
            // Build list of selected widget IDs for partial approval
            const selectedWidgetIds = (req.widgets || [])
                .filter((_, i) => selectedIndices.has(i))
                .map(w => w.id)
                .filter(Boolean);

            await LocalApiService.approveRequest(req.id, selectedWidgetIds.length > 0 ? selectedWidgetIds : undefined);

            toast.success('Approved! Auto-deploying...', { duration: 2000 });
            onApprove?.(req.id);
            fetchRequests();

            // Auto-deploy after approve
            await handleDeploy({ ...req, status: 'APPROVED' });
        } catch (error) {
            console.error('Approve error:', error);
            if (error.status === 423 || error.response?.status === 423) {
                toast.error('An approval is already in progress, please wait a moment');
            } else {
                toast.error(`Failed to approve: ${error.message}`);
            }
        } finally {
            setActionLoading(null);
        }
    };

    // Feature 9: Open rejection dialog instead of directly rejecting
    const handleRejectClick = (req) => {
        setRejectReason('');
        setRejectDialog({ req });
    };

    const handleRejectConfirm = async () => {
        if (!rejectDialog) return;
        const { req } = rejectDialog;
        setRejectDialog(null);
        setActionLoading(req.id);
        try {
            await LocalApiService.rejectRequest(req.id, rejectReason.trim());
            toast.success('Request rejected');
            onReject?.(req.id);
            fetchRequests();
        } catch (error) {
            if (error.status === 423 || error.response?.status === 423) {
                toast.error('An approval is already in progress, please wait a moment');
            } else {
                toast.error('Failed to reject request');
            }
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeploy = async (req) => {
        const token = getCsrfToken();
        if (!token) {
            toast.error('Samaan session not found. Please login to Samaan first, then retry.');
            return;
        }

        setActionLoading(req.id);
        const loadingToast = toast.loading('Deploying to production...');

        try {
            const { DeploymentService } = await import('../../Backend/services/DeploymentService');
            const result = await DeploymentService.deployRequest(req, { csrftoken: token });

            toast.dismiss(loadingToast);
            if (result.success) {
                toast.success(
                    result.summary || 'Deployed successfully!',
                    { icon: '🚀', duration: 4000 }
                );
                // Update DB status — only if not already approved
                if (req.status !== 'APPROVED' && req.status !== 'Complete') {
                    try {
                        await LocalApiService.approveRequest(req.id);
                    } catch (e) {
                        console.warn('[Deploy] DB status update failed (non-fatal):', e.message);
                    }
                }
                fetchRequests();
                // Fire-and-forget: sync deploy slugs to BigQuery
                if (result.results?.length) {
                    const deployWidgets = result.results
                        .filter(r => r.status === 'ok' && r.slug)
                        .map(r => ({
                            requestId: req.id,
                            widgetId: r.widgetId || '',
                            slugs: r.slugs || { widget: r.slug },
                        }));
                    if (deployWidgets.length) {
                        LocalApiService.syncDeployToKinetic(deployWidgets)
                            .catch(e => console.warn('[Deploy] Sync failed:', e.message));
                    }
                }
            } else {
                toast.error(`Deployment failed: ${result.error}`, { duration: 8000 });
                // Log full deployment details for debugging
                console.error('[Deploy] Failed result:', result);
                console.error('[Deploy] Logs:', result.logs);
            }

            // Feature 5: Store per-widget deploy results for display
            if (result.results?.length) {
                setDeployResults(prev => ({ ...prev, [req.id]: result.results }));
            }
        } catch (e) {
            toast.dismiss(loadingToast);
            toast.error(`Error: ${e.message}`, { duration: 8000 });
            console.error('[Deploy] Exception:', e);
        } finally {
            setActionLoading(null);
        }
    };

    const handleApproveAndDeploy = async (req) => {
        const token = getCsrfToken();
        if (!token) {
            toast.error('Session expired — redirecting to login...');
            setTimeout(() => logout(), 1500);
            return;
        }

        const selectedIndices = selectedWidgets[req.id] || new Set();
        const selectedHeaders = selectedHeaderWidgets[req.id] || new Set();
        if (selectedIndices.size === 0 && selectedHeaders.size === 0) {
            toast.error('Please select at least one widget to approve');
            return;
        }

        setActionLoading(req.id);
        const loadingToast = toast.loading('Approving & deploying...');

        try {
            // Step 1: Approve in BigQuery
            const selectedWidgetIds = (req.widgets || [])
                .filter((_, i) => selectedIndices.has(i))
                .map(w => w.id)
                .filter(Boolean);

            await LocalApiService.approveRequest(req.id, selectedWidgetIds.length > 0 ? selectedWidgetIds : undefined);
            toast.dismiss(loadingToast);
            toast.success('Approved!', { duration: 2000 });

            // Step 2: Deploy to backend
            const deployToast = toast.loading('Deploying to backend...');
            const { DeploymentService } = await import('../../Backend/services/DeploymentService');
            const result = await DeploymentService.deployRequest(req, { csrftoken: token });

            toast.dismiss(deployToast);
            if (result.success) {
                toast.success(result.summary || 'Deployed successfully!', { icon: '🚀', duration: 4000 });
                // Fire-and-forget: sync deploy slugs to BigQuery
                if (result.results?.length) {
                    const deployWidgets = result.results
                        .filter(r => r.status === 'ok' && r.slug)
                        .map(r => ({
                            requestId: req.id,
                            widgetId: r.widgetId || '',
                            slugs: r.slugs || { widget: r.slug },
                        }));
                    if (deployWidgets.length) {
                        LocalApiService.syncDeployToKinetic(deployWidgets)
                            .catch(e => console.warn('[Deploy] Sync failed:', e.message));
                    }
                }
            } else {
                toast.error(`Deployment failed: ${result.error}`);
            }

            if (result.results?.length) {
                setDeployResults(prev => ({ ...prev, [req.id]: result.results }));
            }

            onApprove?.(req.id);
            setViewMode('HISTORY');
            fetchRequests();
        } catch (e) {
            toast.dismiss();
            if (e.status === 423 || e.response?.status === 423) {
                toast.error('An approval is already in progress, please wait a moment');
            } else {
                toast.error(`Error: ${e.message}`);
            }
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <>
        <div className="fixed inset-0 bg-black/30 z-[99]" onClick={onClose} />
        <div className="fixed top-16 right-4 w-[420px] bg-white border border-slate-200 shadow-md rounded-lg z-[100] overflow-hidden flex flex-col max-h-[85vh]">
            {/* ===== IMPROVED HEADER ===== */}
            <div className="bg-white px-4 py-3 border-b border-slate-200 shrink-0">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-800 text-[13px]">
                            {!isMaker && viewMode === 'PENDING' ? '📋 Review Queue' : '📜 History'}
                        </h3>
                        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center">
                            {requests.length}
                        </span>
                        <button
                            onClick={fetchRequests}
                            disabled={loading}
                            title="Refresh"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Filter Tabs for Checker */}
                {!isMaker && (
                    <div className="flex bg-slate-100 p-0.5 rounded-lg mt-2">
                        <button
                            onClick={() => setViewMode('PENDING')}
                            className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${viewMode === 'PENDING'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Pending
                        </button>
                        <button
                            onClick={() => setViewMode('HISTORY')}
                            className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all ${viewMode === 'HISTORY'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            All History
                        </button>
                    </div>
                )}

                {/* Filter Tabs for Maker */}
                {isMaker && (
                    <div className="grid grid-cols-2 gap-0.5 bg-slate-100 p-0.5 rounded-lg mt-2">
                        <button
                            onClick={() => setViewMode('PENDING')}
                            className={`text-[11px] font-semibold py-1.5 rounded-md transition-all ${viewMode === 'PENDING'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Pending
                        </button>
                        <button
                            onClick={() => setViewMode('APPROVED')}
                            className={`text-[11px] font-semibold py-1.5 rounded-md transition-all ${viewMode === 'APPROVED'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Complete
                        </button>
                        <button
                            onClick={() => setViewMode('REJECTED')}
                            className={`text-[11px] font-semibold py-1.5 rounded-md transition-all ${viewMode === 'REJECTED'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            Rejected
                        </button>
                        <button
                            onClick={() => setViewMode('ALL')}
                            className={`text-[11px] font-semibold py-1.5 rounded-md transition-all ${viewMode === 'ALL'
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            All
                        </button>
                    </div>
                )}
            </div>

            {/* ===== CONTENT AREA ===== */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                {/* Loading State */}
                {loading && requests.length === 0 && (
                    <div className="p-8 flex flex-col items-center justify-center text-slate-400">
                        <Loader2 size={32} className="animate-spin mb-3" />
                        <span className="text-sm">Loading requests...</span>
                    </div>
                )}

                {/* Empty States */}
                {!loading && requests.length === 0 && (
                    <div className="p-10 text-center">
                        {isMaker ? (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <FileText size={28} className="text-slate-400" />
                                </div>
                                <h4 className="font-semibold text-slate-700 mb-1">No History Yet</h4>
                                <p className="text-sm text-slate-500">Create your first widget to see history here</p>
                            </div>
                        ) : viewMode === 'PENDING' ? (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                    <CheckCircle size={28} className="text-green-500" />
                                </div>
                                <h4 className="font-semibold text-slate-700 mb-1">All Caught Up! 🎉</h4>
                                <p className="text-sm text-slate-500">No pending requests to review</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <FileText size={28} className="text-slate-400" />
                                </div>
                                <h4 className="font-semibold text-slate-700 mb-1">No Requests Found</h4>
                                <p className="text-sm text-slate-500">The request history is empty</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== REQUEST CARDS WITH BETTER HIERARCHY ===== */}
                {requests.map((req) => {
                    const isActioning = actionLoading === req.id;

                    return (
                        <div key={req.id} className="p-3 hover:bg-slate-50/50 transition-colors">
                            {/* Card Header: Avatar + Info + Status */}
                            <div className="flex items-start gap-2.5 mb-2">
                                <UserAvatar name={req.user} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-800 truncate">{req.user}</span>
                                        <StatusBadge status={req.status} />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                        <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">{req.type}</span>
                                        <span>•</span>
                                        <span>{getRelativeTime(req.date)}</span>
                                        {req.widgets && (
                                            <>
                                                <span>•</span>
                                                <span>{req.widgets.length} widget{req.widgets.length !== 1 ? 's' : ''}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Widget List (Expandable) - Now includes header widgets */}
                            {((req.widgets && req.widgets.length > 0) || req.headerWidgets) && (() => {
                                // Build combined widget list
                                const allWidgets = [];

                                // Add header widgets first
                                if (req.headerWidgets?.primaryMasthead && req.headerWidgets.primaryMasthead.enabled !== false) {
                                    allWidgets.push({
                                        ...req.headerWidgets.primaryMasthead,
                                        _type: 'header',
                                        _key: 'primaryMasthead',
                                        title: 'Primary Masthead',
                                        subtitle: req.headerWidgets.primaryMasthead.slug_name || 'No slug'
                                    });
                                }
                                if (req.headerWidgets?.secondaryMasthead && req.headerWidgets.secondaryMasthead.enabled === true) {
                                    allWidgets.push({
                                        ...req.headerWidgets.secondaryMasthead,
                                        _type: 'header',
                                        _key: 'secondaryMasthead',
                                        title: 'Secondary Masthead',
                                        subtitle: req.headerWidgets.secondaryMasthead.title || 'No title'
                                    });
                                }

                                // Add regular widgets
                                if (req.widgets) {
                                    req.widgets.forEach((w, i) => {
                                        allWidgets.push({ ...w, _type: 'widget', _index: i });
                                    });
                                }

                                if (allWidgets.length === 0) return null;

                                return (
                                    <div className="mb-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleExpand(req.id); }}
                                            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors mb-2"
                                        >
                                            {expandedReqs.has(req.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            {expandedReqs.has(req.id) ? 'Hide Widgets' : 'Show Widgets'}
                                        </button>

                                        {expandedReqs.has(req.id) && (
                                            <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5 border border-slate-200">
                                                {allWidgets.map((w, idx) => {
                                                    const isHeader = w._type === 'header';
                                                    const originalIdx = isHeader ? null : w._index;
                                                    const headerKey = isHeader ? w._key : null;
                                                    const isSelected = isHeader
                                                        ? selectedHeaderWidgets[req.id]?.has(headerKey)
                                                        : selectedWidgets[req.id]?.has(originalIdx);
                                                    const canSelect = !isMaker && req.status === 'PENDING';

                                                    return (
                                                        <label
                                                            key={idx}
                                                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${isHeader
                                                                ? isSelected
                                                                    ? 'bg-gradient-to-r from-blue-100 to-purple-100 border border-blue-300'
                                                                    : 'bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 opacity-60'
                                                                : isSelected
                                                                    ? 'bg-blue-50 border border-blue-200'
                                                                    : 'bg-white border border-slate-100 hover:border-slate-200 opacity-60'
                                                                } ${!canSelect ? 'opacity-60 cursor-default' : ''}`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={!!isSelected}
                                                                onChange={() => isHeader
                                                                    ? toggleHeaderWidgetSelection(req.id, headerKey)
                                                                    : toggleWidgetSelection(req.id, originalIdx)
                                                                }
                                                                disabled={!canSelect}
                                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`font-medium text-sm ${isHeader ? 'text-blue-700' : isSelected ? 'text-slate-800' : 'text-slate-500'}`}>
                                                                    {isHeader ? '⭐ ' : ''}{w.title || w.type || 'Untitled Widget'}
                                                                </div>
                                                                {w.subtitle && (
                                                                    <div className="text-xs text-slate-400">{w.subtitle}</div>
                                                                )}
                                                                {w.products && (
                                                                    <div className="text-xs text-slate-400">{w.products.length} products</div>
                                                                )}
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ===== ACTION BUTTONS WITH BETTER FEEDBACK ===== */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleView(req)}
                                    disabled={isActioning}
                                    className="flex-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                    <Eye size={14} /> Preview
                                </button>

                                {!isMaker && req.status === 'PENDING' && (
                                    <>
                                        <button
                                            onClick={() => handleApprove(req)}
                                            disabled={isActioning}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            {isActioning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => handleApproveAndDeploy(req)}
                                            disabled={isActioning}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            {isActioning ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                                            Approve & Deploy
                                        </button>
                                        <button
                                            onClick={() => handleRejectClick(req)}
                                            disabled={isActioning}
                                            className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            {isActioning ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                            Reject
                                        </button>
                                    </>
                                )}

                                {!isMaker && req.status === 'APPROVED' && (
                                    <button
                                        onClick={() => handleDeploy(req)}
                                        disabled={isActioning}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        {isActioning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                        Deploy
                                    </button>
                                )}

                                {/* Map to Page — Checker only, visible when deploy results have successful slugs */}
                                {!isMaker && deployResults[req.id]?.some(r => (r.status === 'ok' || r.status === 'updated') && r.slug) && (
                                    <button
                                        disabled
                                        className="flex-1 bg-gray-300 text-gray-500 text-xs font-semibold py-2 px-3 rounded-lg cursor-not-allowed flex items-center justify-center gap-1.5"
                                    >
                                        <MapPin size={14} />
                                        Map to Page
                                    </button>
                                )}
                            </div>

                            {/* Feature 5: Per-Widget Deploy Results */}
                            {deployResults[req.id] && deployResults[req.id].length > 0 && (
                                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
                                    <p className="text-xs font-semibold text-slate-600 mb-1">Deployment Results:</p>
                                    {deployResults[req.id].map((r, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            {r.status === 'ok' || r.status === 'updated'
                                                ? <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                                                : r.status === 'skipped'
                                                    ? <Clock size={12} className="text-amber-500 shrink-0" />
                                                    : <XCircle size={12} className="text-red-500 shrink-0" />
                                            }
                                            <span className={`font-medium ${r.status === 'failed' ? 'text-red-700' : 'text-slate-700'}`}>
                                                {r.widget}
                                            </span>
                                            {r.error && <span className="text-red-500 truncate">{r.error}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Feature 9: Show rejection reason to Maker */}
                            {isMaker && req.status === 'REJECTED' && req.rejectionReason && (
                                <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-2">
                                    <MessageSquare size={12} className="text-red-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs font-semibold text-red-700">Rejection Reason:</p>
                                        <p className="text-xs text-red-600 mt-0.5">{req.rejectionReason}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Map to Page Modal */}
            {mapToPageDialog && (
                <MapToPageModal
                    slugs={mapToPageDialog.slugs}
                    onClose={() => setMapToPageDialog(null)}
                    onMapped={() => setMapToPageDialog(null)}
                />
            )}

            {/* Feature 9: Rejection Reason Dialog */}
            {rejectDialog && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[200]"
                        onClick={() => setRejectDialog(null)}
                    />
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] bg-white rounded-lg shadow-md border border-slate-200 z-[201] p-4">
                        <h4 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                            <XCircle size={16} className="text-red-500" />
                            Reject Request
                        </h4>
                        <p className="text-xs text-slate-500 mb-3">
                            Optionally add a reason — the Maker will see this in their queue.
                        </p>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="e.g. Product list is empty — please add at least 3 products."
                            rows={3}
                            autoFocus
                            className="w-full text-[13px] border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
                        />
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => setRejectDialog(null)}
                                className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRejectConfirm}
                                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                                Confirm Reject
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
        </>
    );
};

export default RequestQueue;
