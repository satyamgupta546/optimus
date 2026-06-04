import React, { useState } from 'react';
import { LocalApiService } from '../services/LocalApiService';
import { Search, Database, Globe, Loader2 } from 'lucide-react';
import { safeUUID } from '../utils/uuid';
import { prefetchProducts } from '../hooks/useCatalog';
import { API_BASE } from '../config/apiConfig';

/**
 * Fetch Widget Component
 * Allows users to fetch widgets from CMS API or Mirror (BigQuery)
 */
export default function FetchWidget({ onWidgetFetched }) {
    const [slugName, setSlugName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [source, setSource] = useState('db'); // 'db' | 'api'
    const [dbResults, setDbResults] = useState(null); // search results from Mirror

    // ── Mirror (BigQuery) Search ──
    const handleDbSearch = async () => {
        if (!slugName.trim()) { setError('Please enter a slug or title'); return; }
        setLoading(true); setError(''); setDbResults(null);
        try {
            const res = await LocalApiService.searchWidgets(slugName.trim());
            const results = Array.isArray(res.rows) ? res.rows : [];
            if (results.length === 0) {
                setError(`No widgets found matching "${slugName}"`);
            } else {
                setDbResults(results.slice(0, 10));
            }
        } catch (err) {
            setError('Search failed: ' + err.message);
        } finally { setLoading(false); }
    };

    // Map BigQuery widget_type values to app-recognized types
    const typeNormalize = {
        'product_rail': 'product_rail',
        'single_product_row': 'product_rail',
        'single_product_row_v2': 'product_rail',
        'Single Product Row': 'product_rail',
        'Single Product Row Optimize': 'product_rail',
        'collection_banner': 'collection_banner',
        'Banner With Product Listing': 'collection_banner',
        'Category Grid': 'collection_banner',
        'Collection Banner': 'collection_banner',
        'masthead': 'masthead',
        'Primary Masthead': 'masthead',
        'Secondary Masthead Carousel': 'masthead',
    };

    const handleLoadFromDb = (row) => {
        // Parse snapshot JSON — contains the full widget object
        let snapshot = {};
        try {
            snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : (row.snapshot || {});
        } catch { /* ignore parse errors */ }

        // Parse PNC
        let pnc = {};
        try {
            pnc = typeof row.pnc === 'string' ? JSON.parse(row.pnc) : (row.pnc || {});
        } catch { /* ignore */ }

        // For masthead widgets, ensure pnc.variant is always set
        let resolvedPnc = { ...pnc, ...(snapshot.pnc || {}) };
        const rawType = row.widget_type || snapshot.type || 'unknown';
        const widgetType = typeNormalize[rawType] || rawType;
        // For collection_banner widgets, ensure pnc.displayMode is always set
        if (widgetType === 'collection_banner' && !resolvedPnc.displayMode) {
            const rawWT = (row.widget_type || '').toLowerCase();
            const snapshotWT = (snapshot.widget_type || '').toLowerCase();
            const isCategory = rawWT === 'category' || rawWT === 'category grid'
                || snapshotWT === 'category' || snapshotWT === 'category grid'
                || Array.isArray(snapshot.categoryItems) && snapshot.categoryItems.length > 0;
            resolvedPnc.displayMode = isCategory ? 'stick' : 'scroll';
        }

        if (widgetType === 'masthead' && !resolvedPnc.variant) {
            const hasCarousel = Array.isArray(snapshot.carouselItems) && snapshot.carouselItems.length > 0;
            const hasSecondaryField = snapshot.view_all_redirect !== undefined
                || snapshot.media_number !== undefined
                || snapshot.master_key !== undefined;

            if (hasCarousel || hasSecondaryField) {
                resolvedPnc.variant = 'secondary';
            } else {
                const slug = (row.slug || '').toLowerCase();
                const looksSecondary = /_2nd|_sm_|_sm$|secondary/.test(slug);
                resolvedPnc.variant = looksSecondary ? 'secondary' : 'primary';
            }
        }

        const canvasWidget = {
            type: widgetType,
            slug_name: row.slug || '',
            title: row.title || snapshot.title || '',
            titleHi: row.title_hi || snapshot.titleHi || '',
            status: row.status || 'DRAFT',
            ...snapshot,       // spread snapshot (restores full widget config)
            pnc: resolvedPnc,  // pnc set after snapshot so it's never overwritten
            _fetched: true,
            _fromDB: true,
            _dbId: row.widget_id || '',
        };

        // Pre-fetch catalog data for all product codes in this widget
        const allCodes = extractProductCodes(canvasWidget);
        if (allCodes.length) prefetchProducts(allCodes);

        onWidgetFetched(canvasWidget);
        setSlugName('');
        setDbResults(null);
    };

    /** Extract all product codes from a widget (handles all formats) */
    const extractProductCodes = (w) => {
        const codes = new Set();
        // products array (string codes or objects with itemCode/id)
        if (Array.isArray(w.products)) {
            for (const p of w.products) {
                const c = typeof p === 'object' ? String(p.itemCode || p.id || '') : String(p);
                if (c) codes.add(c);
            }
        }
        // stateProducts — { global: '104303,104304,...', state_name: '...' }
        if (w.stateProducts && typeof w.stateProducts === 'object') {
            for (const val of Object.values(w.stateProducts)) {
                if (typeof val === 'string') {
                    val.split(/[\s,\n]+/).filter(Boolean).forEach(c => codes.add(c));
                }
            }
        }
        // homeRowProducts — same format as stateProducts
        if (w.homeRowProducts && typeof w.homeRowProducts === 'object') {
            for (const val of Object.values(w.homeRowProducts)) {
                if (typeof val === 'string') {
                    val.split(/[\s,\n]+/).filter(Boolean).forEach(c => codes.add(c));
                }
            }
        }
        return [...codes];
    };

    // ── CMS API Fetch (existing logic) ──
    const handleApiFetch = async () => {
        if (!slugName.trim()) { setError('Please enter a slug name'); return; }
        setLoading(true); setError('');
        try {
            let widgetResponse = await fetch(`${API_BASE}/api/app/get_widget/?slug_name=${encodeURIComponent(slugName.trim())}`, { credentials: 'include' });
            if (widgetResponse.ok) {
                const widgetData = await widgetResponse.json();
                onWidgetFetched(formatWidgetData(widgetData));
                setSlugName('');
                return;
            }

            let itemResponse = await fetch(`${API_BASE}/api/app/get_widget_item/?widget_item_slug_name=${encodeURIComponent(slugName.trim())}`, { credentials: 'include' });
            if (itemResponse.ok) {
                const itemData = await itemResponse.json();
                onWidgetFetched(formatWidgetItemData(itemData));
                setSlugName('');
                return;
            }
            setError('Widget not found with slug: ' + slugName);
        } catch (err) {
            setError('Failed to fetch widget: ' + err.message);
        } finally { setLoading(false); }
    };

    const handleFetch = () => source === 'db' ? handleDbSearch() : handleApiFetch();

    const formatWidgetData = (data) => {
        const typeMap = {
            'carousel': 'Banner With Product Listing',
            'single_product_row': 'Single Product Row',
            'single_product_row_v2': 'Single Product Row Optimize',
            'product_listing': 'Product Listing Page (CLP)',
            'masthead_secondary_category_hp': 'Secondary Masthead',
            'category': 'Category Grid',
        };
        return {
            type: typeMap[data.widget_type] || data.widget_type,
            slug: data.slug_name || '',
            title: data.heading_en || data.heading || 'Fetched Widget',
            titleHi: data.heading_hi || '',
            titleBg: data.heading_bg || '',
            description: data.description || '',
            startTime: data.start_time || '',
            endTime: data.end_time || '',
            aspectRatio: data.media_aspect_ratio || '1',
            image: data.image || '',
            backgroundMultimedia: data.background_multimedia || '',
            clearBgMedia: data.clear_bg_media || '',
            masterKey: data.master_key || '',
            viewAllActionName: data.view_all_action_name || '',
            viewAllActionParams: data.view_all_action_params || '',
            filterDict: data.filter_dict || '{}',
            appConfigurations: data.app_configurations || '{}',
            configurations: data.configurations || '{}',
            deactivatedFlag: data.deactivated_flag || 'no',
            products: [],
            items: data.items || [],
            _fetched: true,
            _rawData: data,
        };
    };

    const formatWidgetItemData = (data) => {
        const itemTypeMap = {
            'carousel': 'Banner With Product Listing',
            'sub_category': 'Product Listing Page (CLP)',
            'item_rows': 'Single Product Row Optimize',
        };
        return {
            type: itemTypeMap[data.item_type] || 'Widget Item',
            itemType: data.item_type || '',
            slug: data.slug_name || '',
            title: data.text_en || 'Fetched Widget Item',
            text: data.text_en || '',
            titleHi: data.text_hi || '',
            textHi: data.text_hi || '',
            textBg: data.text_bg || '',
            image: data.media_en || '',
            mediaEn: data.media_en || '',
            mediaHi: data.media_hi || '',
            mediaBg: data.media_bg || '',
            media: data.media || '',
            productIds: data.product_list || '',
            products: data.product_list
                ? data.product_list.split(',').map(code => ({
                    id: safeUUID(),
                    itemCode: code.trim(),
                    name: `Product ${code.trim()}`,
                    price: '₹-',
                    image: '',
                }))
                : [],
            itemClickAction: data.item_click_action || '',
            clickActionParams: data.click_action_params || '{}',
            isClickable: data.is_clickable || 'no',
            slaveKey: data.slave_key || '',
            filters: data.filters || '[]',
            filterLst: data.filter_lst || '[]',
            propertyLst: data.property_lst || '[]',
            plEdit: data.pl_edit || 'PL',
            updateProductList: data.update_product_list || 'no',
            startTime: data.start_time || '',
            endTime: data.end_time || '',
            deactivatedFlag: data.deactivated_flag || 'no',
            backgroundMultimedia: data.background_multimedia || '',
            imageMultimedia: data.image_multimedia || '',
            secondaryImageMultimedia: data.secondary_image_multimedia || '',
            progressBar: data.progress_bar || '',
            offerId: data.offer_id || '',
            _fetched: true,
            _rawData: data,
        };
    };

    const statusColors = {
        DRAFT: 'bg-slate-100 text-slate-600',
        PENDING: 'bg-amber-100 text-amber-700',
        APPROVED: 'bg-green-100 text-green-700',
        REJECTED: 'bg-red-100 text-red-700',
        DEPLOYED: 'bg-blue-100 text-blue-700',
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <h3 className="text-xs font-semibold text-gray-700 mb-3">
                Fetch Widget
            </h3>

            {/* Source toggle */}
            <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-0.5">
                <button
                    onClick={() => { setSource('db'); setError(''); setDbResults(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${source === 'db' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Database size={12} />
                    From Mirror
                </button>
                <button
                    onClick={() => { setSource('api'); setError(''); setDbResults(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${source === 'api' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Globe size={12} />
                    From API
                </button>
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={slugName}
                    onChange={(e) => setSlugName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                    placeholder={source === 'db' ? 'Search by slug or title...' : 'Enter widget slug name...'}
                    className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                />
                <button
                    onClick={handleFetch}
                    disabled={loading || !slugName.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[13px] font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : 'Fetch'}
                </button>
            </div>

            {error && (
                <div className="mt-2 text-sm text-red-600">{error}</div>
            )}

            {/* Search results from Mirror */}
            {dbResults && dbResults.length > 0 && (
                <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    {dbResults.map((w, i) => (
                        <button
                            key={w.widget_id || i}
                            onClick={() => handleLoadFromDb(w)}
                            className="w-full text-left px-2.5 py-2 border-b border-slate-100 last:border-0 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2"
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">
                                    {w.title || w.slug || 'Untitled'}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">
                                    {w.slug}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    {w.dt} · {w.submitted_by}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-slate-400">{w.widget_type}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${statusColors[w.status] || 'bg-slate-100 text-slate-600'
                                    }`}>
                                    {w.status}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <div className="mt-2 text-xs text-gray-500">
                {source === 'db'
                    ? 'Search submitted widgets from Mirror (BigQuery) by slug or title'
                    : 'Enter the slug name of any widget or widget item to fetch and preview it'}
            </div>
        </div>
    );
}
