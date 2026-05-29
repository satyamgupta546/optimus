import React from 'react';
import { X, Copy } from 'lucide-react';
import SingleProductRow from './SPR/SingleProductRow';
import PrimaryMasthead from './PrimaryMasthead';
// CollectionBanner handles both Scroll (carousel) and Stick (category grid) modes
import CollectionBanner from './CollectionBanner';
import { useWidgetContext } from '../../context/WidgetContext';
import { WidgetRegistry } from '../../config/WidgetRegistry';

const WidgetRenderer = ({ widget, isSelected, onClick, deleteWidget }) => {
    const { duplicateWidget } = useWidgetContext();

    // Legacy componentMap (for non-config-driven widgets)
    const legacyComponentMap = {
        'Single Product Row': SingleProductRow,
        'Single Product Row Optimize': SingleProductRow,
        'product_rail': SingleProductRow,
        'Secondary Masthead Carousel': PrimaryMasthead,
        'Primary Masthead': PrimaryMasthead,
        'masthead': PrimaryMasthead,
        'primaryMasthead': PrimaryMasthead,
        // Both scroll (carousel) and stick (category grid) modes go through CollectionBanner
        'Banner With Product Listing': CollectionBanner,
        'Category Grid': CollectionBanner,
        'Collection Banner': CollectionBanner,
        'collection_banner': CollectionBanner,
    };

    // Config-driven componentMap (resolved from config.rendering.component)
    const configComponentMap = {
        'SingleProductRow': SingleProductRow,
        'CollectionBanner': CollectionBanner,
        'BannerWithProductListing': CollectionBanner,
        'CategoryGrid': CollectionBanner,
        'PrimaryMasthead': PrimaryMasthead,
        'SecondaryMasthead': PrimaryMasthead,
    };

    const renderWidgetContent = () => {
        // 1. Try config-driven lookup first
        const config = WidgetRegistry.getConfig(widget.type);
        if (config?.rendering?.component) {
            const Component = configComponentMap[config.rendering.component];
            if (Component) {
                return <Component widget={widget} />;
            }
        }

        // 2. Fallback to legacy componentMap
        const LegacyComponent = legacyComponentMap[widget.type];
        if (LegacyComponent) {
            return <LegacyComponent widget={widget} />;
        }

        return <div className="p-4 text-red-500 text-xs">Unknown: {widget.type}</div>;
    };

    return (
        <div
            onClick={onClick}
            className={`relative mb-1 cursor-pointer transition-all border-2 rounded-xl overflow-hidden ${isSelected ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-transparent hover:border-slate-300'
                }`}
        >
            {/* Action Buttons */}
            {isSelected && (
                <div className="absolute top-2 right-[72px] z-30 flex gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            duplicateWidget(widget.id);
                        }}
                        className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-md"
                        title="Duplicate widget"
                    >
                        <Copy size={12} />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            deleteWidget(widget.id);
                        }}
                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md"
                        title="Delete widget"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Widget Content */}
            {renderWidgetContent()}
        </div>
    );
};

export default WidgetRenderer;
