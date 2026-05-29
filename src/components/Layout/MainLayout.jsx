import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import PhoneFrame from '../Preview/PhoneFrame';
import HelpGuide from '../HelpGuide';
import { useAuth } from '../../context/AuthContext';
import { useWidgetContext } from '../../context/WidgetContext';
import { useAppSettings } from '../../context/AppSettingsContext';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import RequestQueue from '../Dashboard/RequestQueue';
import ManageApprovalUsers from '../AdminPanel/ManageApprovalUsers';
import HomepageMappingDashboard from '../Dashboard/HomepageMappingDashboard';
import WidgetHistory from '../Dashboard/WidgetHistory';
import DeploymentStatusPanel from '../Dashboard/DeploymentStatusPanel';
import StateManagerModal from '../AdminPanel/StateManagerModal';
import { invalidateLocationCache } from '../../services/LocationService';
import { ACTIVE_ENV } from '../../config/apiConfig';
import { LogOut, Save, CheckCircle, XCircle, Send, RotateCcw, Smartphone, ListTodo, History, Undo2, Redo2, X, Users, Map, Rocket, MapPin } from 'lucide-react';


const MainLayout = () => {
    const { user, logout, isChecker, isSuperAdmin } = useAuth();
    const {
        pageStatus, setPageStatus, submitForReview, approvePage, rejectPage, resetToDraft,
        canUndo, canRedo, undo, redo,
        widgets, clearEmulator, submitSelection, setSubmitSelection, toggleSubmitSelection, showSubmitModal, setShowSubmitModal, openSubmitModal,
        headerWidgets,
    } = useWidgetContext();
    const { theme, toggleTheme, osType, toggleOS } = useAppSettings();
    const [sidebarWidth, setSidebarWidth] = React.useState(420);
    const [isResizing, setIsResizing] = React.useState(false);
    const [showQueue, setShowQueue] = React.useState(false);
    const [queueFilter, setQueueFilter] = React.useState('PENDING');
    const [showManageUsers, setShowManageUsers] = React.useState(false);
    const [showMapping, setShowMapping] = React.useState(false);
    const [showHistory, setShowHistory] = React.useState(false);
    const [showDeploy, setShowDeploy] = React.useState(false);
    const [showStateManager, setShowStateManager] = React.useState(false);

    // Keyboard shortcuts
    useKeyboardShortcuts({
        'cmd+z': undo,
        'ctrl+z': undo,
        'cmd+shift+z': redo,
        'ctrl+shift+z': redo,
    });


    const getStatusColor = () => {
        switch (pageStatus) {
            case 'APPROVED': return 'bg-green-100 text-green-700 border-green-200';
            case 'PENDING': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const startResizing = React.useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback(
        (mouseMoveEvent) => {
            if (isResizing) {
                const newWidth = mouseMoveEvent.clientX;
                if (newWidth > 280 && newWidth < 800) {
                    setSidebarWidth(newWidth);
                }
            }
        },
        [isResizing]
    );

    React.useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    return (
        <div className={`flex flex-col h-screen bg-slate-50 min-w-[1024px] ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
            {/* Header */}
            <header className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <img
                        src="/assets/optimus-logo.svg"
                        alt="Optimus"
                        className="h-9 w-auto"
                    />
                    {/* Environment Badge (read-only — switch from login page) */}
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border select-none ${ACTIVE_ENV === 'UAT'
                            ? 'bg-orange-100 text-orange-700 border-orange-300'
                            : 'bg-green-100 text-green-700 border-green-300'
                            }`}
                    >
                        {ACTIVE_ENV === 'UAT' ? '🧪 UAT' : '🚀 PROD'}
                    </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-nowrap">
                    {/* OS Switcher */}
                    <button
                        onClick={toggleOS}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-medium text-slate-700"
                        title={`Switch to ${osType === 'ios' ? 'Android' : 'iOS'}`}
                    >
                        <Smartphone size={14} />
                        <span>{osType === 'ios' ? 'iOS' : 'Android'}</span>
                    </button>

                    {/* Undo/Redo Buttons */}
                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo (Cmd+Z)"
                        aria-label="Undo"
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        onClick={redo}
                        disabled={!canRedo}
                        className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Redo (Cmd+Shift+Z)"
                        aria-label="Redo"
                    >
                        <Redo2 size={16} />
                    </button>


                    {/* Clear Emulator */}
                    <button
                        onClick={() => {
                            if (widgets.length === 0) return;
                            if (confirm(`Remove all ${widgets.length} widgets from emulator?`)) {
                                clearEmulator();
                            }
                        }}
                        disabled={widgets.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Clear all widgets from emulator"
                    >
                        <X size={14} />
                        <span>Clear Emulator</span>
                    </button>

                    <div className="h-6 w-px bg-slate-200"></div>

                    {/* Queue Toggle Button */}
                    <button
                        onClick={() => setShowQueue(!showQueue)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium ${showQueue ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                        title="View Queue"
                    >
                        <ListTodo size={14} />
                        <span>Queue</span>
                    </button>

                    {/* State Manager Button */}
                    <button
                        onClick={() => setShowStateManager(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium border-slate-200 text-slate-700 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700`}
                        title="Manage States & Cities for state-wise mapping"
                    >
                        <MapPin size={14} />
                        <span>States</span>
                    </button>

                    {/* Manage Users Button (Super Admin only) */}
                    {isSuperAdmin && (
                        <button
                            onClick={() => setShowManageUsers(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-colors text-xs font-medium"
                            title="Manage Approval Users"
                        >
                            <Users size={14} />
                            <span>Users</span>
                        </button>
                    )}

                    {/* Mapping Dashboard Button */}
                    <button
                        onClick={() => setShowMapping(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium ${showMapping
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'
                            }`}
                        title="Homepage Mappings"
                    >
                        <Map size={14} />
                        <span>Mapping</span>
                    </button>

                    {/* Widget History Button */}
                    <button
                        onClick={() => setShowHistory(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium ${showHistory
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : 'border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
                            }`}
                        title="Widget History"
                    >
                        <History size={14} />
                        <span>History</span>
                    </button>

                    {/* Deploy Button (visible when APPROVED) */}
                    {pageStatus === 'APPROVED' && (
                        <button
                            onClick={() => setShowDeploy(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-medium hover:from-blue-700 hover:to-cyan-700 transition-all shadow-sm"
                            title="Deploy Widgets"
                        >
                            <Rocket size={14} />
                            <span>Deploy</span>
                        </button>
                    )}

                    {/* Filter buttons for Maker/Admin - Controls both page status and queue filter */}
                    {(user?.role === 'MAKER' || isSuperAdmin) && (
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => {
                                    setQueueFilter('DRAFT');
                                    setPageStatus('DRAFT');
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${pageStatus === 'DRAFT'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Draft
                            </button>
                            <button
                                onClick={() => {
                                    setQueueFilter('PENDING');
                                    setPageStatus('PENDING');
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${pageStatus === 'PENDING'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Pending
                            </button>
                            <button
                                onClick={() => {
                                    setQueueFilter('APPROVED');
                                    setPageStatus('APPROVED');
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${pageStatus === 'APPROVED'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Approved
                            </button>
                        </div>
                    )}

                    {/* Workflow Actions */}
                    {(user?.role === 'MAKER' || user?.role === 'CHECKER' || isSuperAdmin) && (pageStatus === 'DRAFT' || pageStatus === 'REJECTED') && (
                        <button
                            onClick={openSubmitModal}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                        >
                            <Send size={16} />
                            Submit
                        </button>
                    )}

                    {isChecker && pageStatus === 'APPROVED' && (
                        <button
                            onClick={resetToDraft}
                            className="text-slate-500 hover:text-blue-600 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
                            title="Re-open Draft"
                        >
                            <RotateCcw size={14} />
                            Re-open
                        </button>
                    )}

                    <div className="h-6 w-px bg-slate-200"></div>

                    {/* User Profile */}
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-semibold text-slate-800">{user?.name}</div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{user?.role}</div>
                        </div>
                        <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                            {user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <button
                            onClick={logout}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Logout"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>

                </div>
            </header>

            {/* Main Content Split */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar - CMS */}
                <div
                    style={{ width: sidebarWidth }}
                    className="bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden shrink-0"
                >
                    {/* Widget Library & Property Editor */}
                    <div className="flex-1 overflow-y-auto">
                        <Sidebar />
                    </div>
                </div>

                {/* Drag Handle */}
                <div
                    onMouseDown={startResizing}
                    className="w-1 hover:bg-blue-400 cursor-col-resize active:bg-blue-600 transition-colors z-20 shrink-0"
                />

                {/* Right Workspace - Preview */}
                <div className="flex-1 bg-slate-50 relative flex items-center justify-center p-8 overflow-auto">
                    {/* Dot Pattern Background */}
                    <div className="absolute inset-0 opacity-[0.4]"
                        style={{ backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}>
                    </div>

                    <PhoneFrame />
                </div>
            </div>

            {/* Manage Users Modal Panel (Super Admin) */}
            {showManageUsers && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
                        onClick={() => setShowManageUsers(false)}
                    />
                    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-6 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Users size={24} />
                                    <div>
                                        <h2 className="text-xl font-bold flex items-center gap-2">
                                            Manage Approval Users
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${ACTIVE_ENV === 'UAT'
                                                    ? 'bg-yellow-300 text-yellow-900'
                                                    : 'bg-green-300 text-green-900'
                                                }`}>
                                                {ACTIVE_ENV}
                                            </span>
                                        </h2>
                                        <p className="text-sm text-amber-100 mt-1">
                                            Checkers for <strong>{ACTIVE_ENV}</strong> environment only
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowManageUsers(false)}
                                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    title="Close"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                            <ManageApprovalUsers />
                        </div>
                        <div className="border-t border-slate-200 p-4 bg-white shrink-0 flex items-center justify-end">
                            <button
                                onClick={() => setShowManageUsers(false)}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Request Queue Panel */}
            {showQueue && isChecker && (
                <RequestQueue
                    onClose={() => setShowQueue(false)}
                    onApprove={(id) => {
                        setPageStatus('APPROVED');
                        setShowQueue(false);
                    }}
                    onReject={(id) => {
                        setPageStatus('REJECTED');
                        setShowQueue(false);
                    }}
                />
            )}
            {showQueue && user?.role === 'MAKER' && (
                <RequestQueue onClose={() => setShowQueue(false)} currentFilter={queueFilter} />
            )}

            {/* Homepage Mapping Dashboard Modal */}
            {showMapping && (
                <HomepageMappingDashboard onClose={() => setShowMapping(false)} />
            )}

            {/* Widget History Panel */}
            {showHistory && (
                <WidgetHistory onClose={() => setShowHistory(false)} />
            )}

            {/* Deployment Status Panel Modal */}
            {showDeploy && (
                <DeploymentStatusPanel onClose={() => setShowDeploy(false)} />
            )}

            {/* Maker Submit Selection Modal */}
            {showSubmitModal && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
                        onClick={() => setShowSubmitModal(false)}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-t-2xl shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Send size={20} />
                                        <div>
                                            <h2 className="text-lg font-bold">Submit for Review</h2>
                                            <p className="text-sm text-blue-200 mt-0.5">Select widgets to send for approval</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowSubmitModal(false)}
                                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Widget List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {/* Select All / Deselect All */}
                                {(() => {
                                    const headerItems = [headerWidgets.primaryMasthead, headerWidgets.secondaryMasthead].filter(Boolean);
                                    const totalItems = widgets.length + headerItems.length;
                                    const allIds = [...widgets.map(w => w.id), ...headerItems.map(h => h.id)];
                                    return (
                                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                {submitSelection.size} of {totalItems} selected
                                            </span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setSubmitSelection(new Set(allIds))}
                                                    className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                                                >
                                                    Select All
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                <button
                                                    onClick={() => setSubmitSelection(new Set())}
                                                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
                                                >
                                                    Deselect All
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Header Widgets */}
                                {[
                                    { key: 'primaryMasthead', hw: headerWidgets.primaryMasthead, label: 'Primary Masthead', icon: '🎯' },
                                    { key: 'secondaryMasthead', hw: headerWidgets.secondaryMasthead, label: 'Secondary Masthead', icon: '🏷' },
                                ].filter(({ hw }) => hw).map(({ key, hw, label, icon }) => {
                                    const isSelected = submitSelection.has(hw.id);
                                    return (
                                        <label
                                            key={hw.id}
                                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected
                                                ? 'bg-purple-50 border-purple-200 shadow-sm'
                                                : 'bg-white border-slate-100 hover:border-slate-200 opacity-60'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSubmitSelection(hw.id)}
                                                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                                        {icon} {hw.title || label}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-700 rounded-full shrink-0">
                                                        HEADER
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-slate-400 font-medium">{hw.type || key}</span>
                                                    {hw.slug_name && (
                                                        <code className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                                                            {hw.slug_name}
                                                        </code>
                                                    )}
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}

                                {/* Divider between header and body */}
                                {widgets.length > 0 && (
                                    <div className="flex items-center gap-2 pt-1 pb-1">
                                        <div className="flex-1 border-t border-slate-200" />
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Body Widgets</span>
                                        <div className="flex-1 border-t border-slate-200" />
                                    </div>
                                )}

                                {/* Body Widgets */}
                                {widgets.map((w, idx) => {
                                    const isSelected = submitSelection.has(w.id);
                                    const hasSlug = !!(w.slug || w.slug_name);
                                    const isFetched = !!w._fetched;
                                    return (
                                        <label
                                            key={w.id}
                                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected
                                                ? 'bg-blue-50 border-blue-200 shadow-sm'
                                                : 'bg-white border-slate-100 hover:border-slate-200 opacity-60'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSubmitSelection(w.id)}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                                        {w.title || 'Untitled'}
                                                    </span>
                                                    {isFetched && (
                                                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full shrink-0">
                                                            FETCHED
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-slate-400 font-medium">{w.type}</span>
                                                    {hasSlug && (
                                                        <code className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                                                            {w.slug || w.slug_name}
                                                        </code>
                                                    )}
                                                    {!hasSlug && (
                                                        <span className="text-[10px] text-amber-500 font-medium">No slug</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-xs text-slate-300 font-mono shrink-0">#{idx + 1}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Footer */}
                            <div className="border-t border-slate-200 p-4 shrink-0 flex items-center justify-between gap-3">
                                <button
                                    onClick={() => setShowSubmitModal(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => submitForReview(submitSelection)}
                                    disabled={submitSelection.size === 0}
                                    className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Send size={14} />
                                    Submit {submitSelection.size} Widget{submitSelection.size !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* State Manager Modal */}
            {showStateManager && (
                <StateManagerModal
                    onClose={() => {
                        setShowStateManager(false);
                        invalidateLocationCache();
                        // Notify all StateProductEditor instances to refresh
                        window.dispatchEvent(new Event('optimus_states_changed'));
                    }}
                />
            )}

            {/* Interactive Help Guide */}
            <HelpGuide />
        </div>
    );
};

export default MainLayout;
