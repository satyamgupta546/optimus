import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Map, Loader2 } from 'lucide-react';
import { LocalApiService } from '../../services/LocalApiService';

/**
 * HomepageMappingDashboard — View all widgets from BigQuery database.
 * Toolbar: search, refresh
 * Sortable table with status badges, pagination
 */
const HomepageMappingDashboard = ({ onClose }) => {
    const [widgets, setWidgets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState('sortOrder');
    const [sortDir, setSortDir] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const fetchWidgets = async () => {
        setLoading(true);
        try {
            const data = await LocalApiService.getWidgets();
            setWidgets(data);
        } catch (e) {
            console.error('Failed to fetch widgets:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWidgets();
    }, []);

    // Filter and sort data
    const filteredData = useMemo(() => {
        let data = [...widgets];

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            data = data.filter(row =>
                (row.slug || '').toLowerCase().includes(q) ||
                (row.title || '').toLowerCase().includes(q) ||
                (row.type || '').toLowerCase().includes(q) ||
                (row.status || '').toLowerCase().includes(q)
            );
        }

        // Sort
        data.sort((a, b) => {
            let aVal = a[sortKey] ?? '';
            let bVal = b[sortKey] ?? '';
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return data;
    }, [widgets, searchQuery, sortKey, sortDir]);

    // Pagination
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const ACTIVE_ENV = localStorage.getItem('optimus_env') || 'PROD';

    const formatTime = useCallback((iso) => {
        if (!iso) return '--';
        return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    }, []);

    const statusBadge = useCallback((status) => {
        const map = {
            DRAFT: 'bg-slate-100 text-slate-600',
            PENDING: 'bg-amber-100 text-amber-700',
            APPROVED: 'bg-green-100 text-green-700',
            REJECTED: 'bg-red-100 text-red-700',
        };
        return map[status] || 'bg-slate-100 text-slate-500';
    }, []);

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* Panel */}
            <div className="fixed inset-y-0 right-0 w-full max-w-5xl bg-white shadow-sm border-l border-slate-200 z-50 flex flex-col">
                {/* Header */}
                <div className="bg-white border-b border-slate-200 px-5 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Map size={18} className="text-slate-500" />
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold text-slate-800">Homepage Mappings</h2>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        ACTIVE_ENV === 'UAT'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {ACTIVE_ENV === 'UAT' ? 'UAT' : 'PROD'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">BigQuery widget database</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="border-b border-slate-200 px-5 py-2.5 flex items-center gap-3 flex-wrap bg-slate-50">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search slug, title, type, status..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={fetchWidgets}
                        disabled={loading}
                        className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>

                    {/* Count */}
                    <span className="text-xs text-slate-500 ml-auto">
                        {filteredData.length} widget{filteredData.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {loading && widgets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <Loader2 size={32} className="animate-spin mb-3" />
                            <span className="text-sm">Loading widgets...</span>
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead className="sticky top-0 bg-white border-b border-slate-200">
                                <tr>
                                    <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 w-10">#</th>
                                    <SortableHeader label="Slug" sortKey="slug" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                    <SortableHeader label="Type" sortKey="type" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                    <SortableHeader label="Title" sortKey="title" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                    <SortableHeader label="Status" sortKey="status" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                    <SortableHeader label="Sort Order" sortKey="sortOrder" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Created By</th>
                                    <SortableHeader label="Created" sortKey="createdAt" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                    <SortableHeader label="Updated" sortKey="updatedAt" currentSort={sortKey} sortDir={sortDir} onSort={toggleSort} />
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map((row, i) => (
                                    <tr
                                        key={row.id}
                                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                                    >
                                        <td className="px-3 py-1.5 text-[11px] text-slate-400">{(currentPage - 1) * pageSize + i + 1}</td>
                                        <td className="px-3 py-1.5">
                                            <span className="text-[12px] font-mono text-slate-700 truncate max-w-[200px] block" title={row.slug}>
                                                {row.slug || '--'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                                                {row.type || '--'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-[12px] text-slate-600 truncate max-w-[160px]">{row.title || '--'}</td>
                                        <td className="px-3 py-1.5">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold lowercase ${statusBadge(row.status)}`}>
                                                {row.status || '--'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-[12px] text-slate-600 font-mono">{row.sortOrder ?? '--'}</td>
                                        <td className="px-3 py-1.5 text-[12px] text-slate-500">{row.creator?.email?.split('@')[0] || '--'}</td>
                                        <td className="px-3 py-1.5 text-[12px] text-slate-500">{formatTime(row.createdAt)}</td>
                                        <td className="px-3 py-1.5 text-[12px] text-slate-500">{formatTime(row.updatedAt)}</td>
                                    </tr>
                                ))}
                                {paginatedData.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                                            {searchQuery ? 'No widgets match your search' : 'No widgets found'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination footer */}
                {totalPages > 1 && (
                    <div className="border-t border-slate-200 px-5 py-2.5 flex items-center justify-between bg-white shrink-0">
                        <span className="text-xs text-slate-500">
                            Page {currentPage} of {totalPages}
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                            >
                                Prev
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                                        page === currentPage
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

/** Sortable table header */
const SortableHeader = React.memo(({ label, sortKey, currentSort, sortDir, onSort }) => (
    <th
        onClick={() => onSort(sortKey)}
        className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 cursor-pointer hover:text-slate-700 select-none"
    >
        <div className="flex items-center gap-1">
            {label}
            {currentSort === sortKey ? (
                sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
            ) : (
                <ArrowUpDown size={10} className="text-slate-300" />
            )}
        </div>
    </th>
));

export default HomepageMappingDashboard;
