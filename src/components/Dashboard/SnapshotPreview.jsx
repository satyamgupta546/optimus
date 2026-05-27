import React from 'react';
import { WidgetContext } from '../../context/WidgetContext';
import SingleProductRow from '../Widgets/SPR/SingleProductRow';
import CollectionBanner from '../Widgets/CollectionBanner';
import PrimaryMasthead from '../Widgets/PrimaryMasthead';

const componentMap = {
    // Config-driven keys (from WidgetRegistry.rendering.component)
    'SingleProductRow': SingleProductRow,
    'CollectionBanner': CollectionBanner,
    'BannerWithProductListing': CollectionBanner,
    'CategoryGrid': CollectionBanner,
    'PrimaryMasthead': PrimaryMasthead,
    'SecondaryMasthead': PrimaryMasthead,
    // Legacy type names
    'Single Product Row': SingleProductRow,
    'Single Product Row Optimize': SingleProductRow,
    'Secondary Masthead Carousel': PrimaryMasthead,
    'Primary Masthead': PrimaryMasthead,
    'Banner With Product Listing': CollectionBanner,
    'Category Grid': CollectionBanner,
    'Collection Banner': CollectionBanner,
    // BigQuery slug-style type names
    'product_rail': SingleProductRow,
    'collection_banner': CollectionBanner,
    'masthead': PrimaryMasthead,
    'category_grid': CollectionBanner,
    'banner_product_listing': CollectionBanner,
};

// Stub context so widget components don't crash outside WidgetProvider
const stubContextValue = {
    widgets: [],
    selectedWidgetId: null,
    setSelectedWidgetId: () => { },
    addWidget: () => { },
    updateWidget: () => { },
    deleteWidget: () => { },
    duplicateWidget: () => { },
    moveWidget: () => { },
    navigateTo: () => { },
    currentView: 'home',
    viewData: null,
    headerWidgets: {},
    pageStatus: 'DRAFT',
};

/**
 * SnapshotPreview — Renders a visual widget preview from a version snapshot.
 * Used inside WidgetVersionHistory's Preview tab.
 *
 * Props:
 * - snapshot: parsed snapshot object from WidgetVersion
 * - label: optional label to show above the preview (e.g. "v3", "Previous")
 */
const SnapshotPreview = ({ snapshot, label }) => {
    if (!snapshot) {
        return (
            <div className="flex items-center justify-center h-40 bg-slate-50 rounded-xl text-slate-400 text-xs">
                No snapshot data
            </div>
        );
    }

    const widgetType = snapshot.type || '';
    const Component = componentMap[widgetType];

    if (!Component) {
        return (
            <div className="bg-slate-50 rounded-xl p-4">
                {label && <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">{label}</p>}
                <div className="text-xs text-slate-500 text-center py-6">
                    No preview available for type: <span className="font-mono">{widgetType || 'unknown'}</span>
                </div>
            </div>
        );
    }

    // Normalize snapshot into a widget-like shape the components expect
    const widget = {
        id: snapshot.id || 'preview',
        type: widgetType,
        title: snapshot.title || '',
        titleHi: snapshot.titleHi || '',
        slug: snapshot.slug || '',
        products: snapshot.products || [],
        pnc: snapshot.pnc || {},
        config: snapshot.config || {},
        ...snapshot,
    };

    return (
        <div className="bg-slate-50 rounded-xl overflow-hidden">
            {label && (
                <p className="text-[10px] font-bold text-slate-400 uppercase px-3 pt-2">{label}</p>
            )}
            <div className="w-[360px] mx-auto transform scale-[0.85] origin-top">
                <WidgetContext.Provider value={stubContextValue}>
                    <Component widget={widget} />
                </WidgetContext.Provider>
            </div>
        </div>
    );
};

export default SnapshotPreview;
