import React, { createContext, useContext, useState, useEffect } from 'react';
import { mapApiToWidgets } from '../services/ApiMapper';
import homepageResponse from '../data/homepage_response.json';
import showToast from '../utils/toast';
import { useUndoRedo } from './UndoRedoContext';
import { useActivityLog } from './ActivityLogContext';
import { useAuth } from './AuthContext';
import { validateAndCheckSlugs } from '../services/ValidationService';
import { LocalApiService } from '../services/LocalApiService';
import { safeUUID } from '../utils/uuid';

export const WidgetContext = createContext();

export const useWidgetContext = () => {
    const context = useContext(WidgetContext);
    if (!context) {
        throw new Error('useWidgetContext must be used within a WidgetProvider');
    }
    return context;
};

export const WidgetProvider = ({ children }) => {
    console.log("DEBUG: WidgetProvider rendering");
    const undoRedo = useUndoRedo();
    const { logActivity } = useActivityLog();
    const { user } = useAuth(); // Get current user

    // Load initial widgets from the API response
    const [widgets, setWidgets] = useState(() => mapApiToWidgets(homepageResponse));
    const [selectedWidgetId, setSelectedWidgetId] = useState(null);
    const [selectedWidgetIds, setSelectedWidgetIds] = useState([]); // Multiple selection
    const [pageStatus, setPageStatus] = useState('DRAFT'); // DRAFT, PENDING, APPROVED, REJECTED
    const [currentView, setCurrentView] = useState('home');
    const [viewData, setViewData] = useState(null);
    const [comments, setComments] = useState([]); // Widget comments
    const [validationErrors, setValidationErrors] = useState([]); // Pre-submit validation errors
    // Slug builder cache — persists slug form parts per widget ID
    // Shape: { [widgetId]: { header, identifier, zone, locationLevel, locations, user, device } }
    const [widgetSlugCache, setWidgetSlugCacheState] = useState({});
    const setWidgetSlugCache = (widgetId, parts) => {
        setWidgetSlugCacheState(prev => ({ ...prev, [widgetId]: parts }));
    };

    // Save state to undo/redo history whenever widgets change
    useEffect(() => {
        if (widgets.length > 0) {
            undoRedo.saveState({ widgets, headerWidgets }, 'Widget change');
        }
    }, [widgets]); // Only track widgets, not headerWidgets to avoid too many saves

    // Header Widgets State
    const [headerWidgets, setHeaderWidgets] = useState({
        primaryMasthead: {
            id: 'header-primary-masthead',
            type: 'Primary Masthead', // Now Category Navigation
            enabled: true,
            background: '#0277FA', // Default Blue
            slug_name: '',
            master_key: '',
            end_time: '',
            background_multimedia_slug: '',
            // Categories are currently hardcoded in component as default, but can be added here
        },
        secondaryMasthead: {
            id: 'header-secondary-masthead',
            type: 'Secondary Masthead', // Now Blue Banner
            enabled: true,
            title: '₹1000 का बिल बनेगा',
            subtitle: 'होलसेल रेट लगेगा!',
            textColor: '#ffffff',
            background: '#0277FA',
            image: ''
        }
    });

    const updateHeaderWidget = (widgetKey, updates) => {
        setHeaderWidgets(prev => ({
            ...prev,
            [widgetKey]: { ...prev[widgetKey], ...updates }
        }));
    };

    // Sync masthead widgets from widgets[] → headerWidgets for preview rendering.
    // When a masthead is added/edited via config-driven PropertyEditor, the preview
    // (AppHeader, SecondaryMasthead) reads from headerWidgets — this bridges the gap.
    // Also resets to defaults when a masthead is deleted or variant is switched.
    useEffect(() => {
        const primaryWidget = widgets.find(w => w.type === 'masthead' && w.pnc?.variant === 'primary');
        const secondaryWidget = widgets.find(w => w.type === 'masthead' && w.pnc?.variant === 'secondary');

        setHeaderWidgets(prev => {
            const next = { ...prev };

            if (primaryWidget) {
                next.primaryMasthead = {
                    ...prev.primaryMasthead,
                    id: primaryWidget.id,
                    enabled: true,
                    slug_name: primaryWidget.slug || '',
                    master_key: primaryWidget.master_key || '',
                    start_time: primaryWidget.start_time || '',
                    end_time: primaryWidget.end_time || '',
                    background: primaryWidget.transition_color || '#0277FA',
                    multimedia: {
                        type: primaryWidget.background_video ? 'video' : 'image',
                        file: primaryWidget.background_media instanceof File ? primaryWidget.background_media : null,
                        transition_color: primaryWidget.transition_color || '#FFFFFF',
                        accent_color: primaryWidget.accent_color || '#0000FF',
                        text_color: primaryWidget.text_color || '#FFFFFF',
                        icon_bg_color: primaryWidget.icon_bg_color || '#F0F0F0',
                        is_dark: primaryWidget.is_multimedia_dark || false,
                        aspect_ratio: primaryWidget.media_aspect_ratio || '1',
                    },
                };
            } else {
                // Reset to default when no primary masthead exists
                next.primaryMasthead = {
                    id: 'header-primary-masthead',
                    type: 'Primary Masthead',
                    enabled: true,
                    background: '#0277FA',
                    slug_name: '',
                    master_key: '',
                    end_time: '',
                    background_multimedia_slug: '',
                };
            }

            if (secondaryWidget) {
                next.secondaryMasthead = {
                    ...prev.secondaryMasthead,
                    id: secondaryWidget.id,
                    enabled: true,
                    slug_name: secondaryWidget.slug || '',
                    start_time: secondaryWidget.start_time || '',
                    end_time: secondaryWidget.end_time || '',
                    background: secondaryWidget.transition_color || '#0277FA',
                    aspectRatio: secondaryWidget.media_aspect_ratio || '4',
                    multimedia: {
                        type: secondaryWidget.background_video ? 'video' : 'image',
                        file: secondaryWidget.background_media instanceof File ? secondaryWidget.background_media : null,
                        aspect_ratio: secondaryWidget.media_aspect_ratio || '4',
                    },
                    items: secondaryWidget.carouselItems || [],
                };
            } else {
                // Disable secondary when no secondary masthead widget exists
                next.secondaryMasthead = {
                    id: 'header-secondary-masthead',
                    type: 'Secondary Masthead',
                    enabled: false,
                    background: '#0277FA',
                };
            }

            return next;
        });
    }, [widgets]);

    const navigateTo = (view, data = null) => {
        setCurrentView(view);
        setViewData(data);
    };

    const addWidget = (widget) => {
        // Allow DB-loaded widgets (_fromDB) to bypass the page status guard —
        // the user is loading a saved widget for editing, not creating new content.
        if (!widget._fromDB && pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') {
            showToast.warning("Cannot edit while in review or approved");
            return;
        }
        const newWidget = {
            ...widget,
            id: safeUUID(),
            lastModified: new Date().toISOString(),
            lastModifiedBy: 'Current User'
        };
        setWidgets([...widgets, newWidget]);
        logActivity('widget_added', { widgetId: newWidget.id, type: widget.type, title: widget.title });
        showToast.success('Widget added successfully');
        return newWidget.id;
    };

    const updateWidget = (id, updates) => {
        if (pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') return;

        console.log('[WidgetContext] updateWidget called:', { id, updates });

        setWidgets(prevWidgets => {
            return prevWidgets.map(w => {
                if (w.id === id) {
                    // Support functional updates to avoid stale state
                    const updateObj = typeof updates === 'function' ? updates(w) : updates;
                    const updated = {
                        ...w,
                        ...updateObj,
                        lastModified: new Date().toISOString(),
                        lastModifiedBy: 'Current User'
                    };
                    console.log('[WidgetContext] Widget updated:', {
                        id,
                        before: w,
                        after: updated,
                        productsCount: updated.products?.length || 0
                    });
                    return updated;
                }
                return w;
            });
        });
        // Log outside setWidgets to avoid cross-provider setState during render
        const updateKeys = typeof updates === 'function' ? ['(functional)'] : Object.keys(updates);
        logActivity('widget_updated', { widgetId: id, changes: updateKeys });
    };

    const deleteWidget = (id) => {
        if (pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') {
            showToast.warning("Cannot edit while in review or approved");
            return;
        }
        const widget = widgets.find(w => w.id === id);
        setWidgets(widgets.filter(w => w.id !== id));
        if (selectedWidgetId === id) setSelectedWidgetId(null);
        logActivity('widget_deleted', { widgetId: id, type: widget?.type });
        showToast.success('Widget deleted');
    };

    const clearEmulator = () => {
        setWidgets([]);
        setSelectedWidgetId(null);
        setSelectedWidgetIds([]);
        logActivity('emulator_cleared', { count: widgets.length });
        showToast.success('Emulator cleared');
    };

    const duplicateWidget = (id) => {
        if (pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') {
            showToast.warning("Cannot edit while in review or approved");
            return;
        }
        const widget = widgets.find(w => w.id === id);
        if (widget) {
            const duplicate = {
                ...widget,
                id: safeUUID(),
                title: widget.title + ' (Copy)',
                lastModified: new Date().toISOString(),
                lastModifiedBy: 'Current User'
            };
            const index = widgets.findIndex(w => w.id === id);
            const newWidgets = [...widgets];
            newWidgets.splice(index + 1, 0, duplicate);
            setWidgets(newWidgets);
            logActivity('widget_duplicated', { originalId: id, newId: duplicate.id });
            showToast.success('Widget duplicated');
        }
    };

    // Masthead-specific duplicate: replaces the original in-place (single-slot behavior).
    // Since only one primary / one secondary masthead is rendered (.find() picks first match),
    // a normal duplicate would be invisible. This replaces the original with a fresh copy.
    const duplicateMastheadWidget = (id) => {
        if (pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') {
            showToast.warning("Cannot edit while in review or approved");
            return;
        }
        const widget = widgets.find(w => w.id === id);
        if (widget) {
            const duplicate = {
                ...widget,
                id: safeUUID(),
                title: (widget.title || '') + ' (Copy)',
                slug: '',          // Fresh slug — not linked to original
                slug_name: '',
                _fetched: undefined, // Treat as newly created
                _rawData: undefined,
                lastModified: new Date().toISOString(),
                lastModifiedBy: 'Current User'
            };
            // Replace original in-place — copy takes exact same position
            setWidgets(prev => prev.map(w => w.id === id ? duplicate : w));
            setSelectedWidgetId(duplicate.id);
            logActivity('widget_duplicated', { originalId: id, newId: duplicate.id, masthead: true });
            showToast.success('Masthead duplicated (replaced original)');
        }
    };

    const bulkDelete = (ids) => {
        if (pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') {
            showToast.warning("Cannot edit while in review or approved");
            return;
        }
        setWidgets(widgets.filter(w => !ids.includes(w.id)));
        setSelectedWidgetIds([]);
        logActivity('bulk_delete', { count: ids.length, widgetIds: ids });
        showToast.success(`Deleted ${ids.length} widget(s)`);
    };

    const toggleWidgetSelection = (id) => {
        setSelectedWidgetIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(wId => wId !== id);
            }
            return [...prev, id];
        });
    };

    const moveWidget = (dragIndex, hoverIndex) => {
        if (pageStatus !== 'DRAFT' && pageStatus !== 'REJECTED') return;
        const newWidgets = [...widgets];
        const [movedWidget] = newWidgets.splice(dragIndex, 1);
        newWidgets.splice(hoverIndex, 0, movedWidget);
        setWidgets(newWidgets);
    };

    // ── Maker Widget Selection for Submit ──
    const [submitSelection, setSubmitSelection] = useState(new Set()); // Set of widget IDs selected for submit
    const [showSubmitModal, setShowSubmitModal] = useState(false);

    // Initialize selection with all widget IDs + header widget IDs when modal opens
    const openSubmitModal = () => {
        const allIds = new Set(widgets.map(w => w.id));
        // Include header widgets that exist
        if (headerWidgets.primaryMasthead) allIds.add(headerWidgets.primaryMasthead.id);
        if (headerWidgets.secondaryMasthead) allIds.add(headerWidgets.secondaryMasthead.id);
        setSubmitSelection(allIds);
        setShowSubmitModal(true);
    };

    const toggleSubmitSelection = (widgetId) => {
        setSubmitSelection(prev => {
            const next = new Set(prev);
            if (next.has(widgetId)) next.delete(widgetId);
            else next.add(widgetId);
            return next;
        });
    };

    // Workflow Actions
    const submitForReview = async (selectedWidgetIds = null) => {
        try {
            // Determine which widgets to submit
            const widgetsToSubmit = selectedWidgetIds
                ? widgets.filter(w => selectedWidgetIds.has(w.id))
                : widgets;

            // Only include header widgets that are selected
            const selectedHeaders = {};
            if (selectedWidgetIds?.has(headerWidgets.primaryMasthead?.id)) {
                selectedHeaders.primaryMasthead = headerWidgets.primaryMasthead;
            }
            if (selectedWidgetIds?.has(headerWidgets.secondaryMasthead?.id)) {
                selectedHeaders.secondaryMasthead = headerWidgets.secondaryMasthead;
            }

            if (widgetsToSubmit.length === 0) {
                showToast.error('Please select at least 1 widget to submit.');
                return;
            }

            // ── Pre-Submit Validation (field-level only, slug passed as-is) ──
            showToast.info('Validating widgets before submit...');
            const validationResult = await validateAndCheckSlugs(widgetsToSubmit);

            if (!validationResult.valid) {
                setValidationErrors(validationResult.errors);
                const firstError = validationResult.errors[0];
                showToast.error(
                    `Validation failed: ${firstError.widgetTitle} — ${firstError.message}`,
                    { duration: 6000 }
                );
                console.warn('[WidgetContext] Validation errors:', validationResult.errors);
                return; // Block submit
            }

            // Clear previous validation errors
            setValidationErrors([]);
            setShowSubmitModal(false);

            console.log(`Submitting ${widgetsToSubmit.length} of ${widgets.length} widgets to local backend...`);

            // Helper: Remove File objects from multimedia (can't be serialized)
            const cleanHeaderWidgets = (hw) => {
                return JSON.parse(JSON.stringify(hw, (_key, value) => {
                    if (value instanceof File) return undefined;
                    return value;
                }));
            };

            const result = await LocalApiService.createRequest({
                widgets: widgetsToSubmit,
                headerWidgets: cleanHeaderWidgets(selectedHeaders),
            });

            // SUPER_ADMIN auto-approve: server returns APPROVED status directly
            const isAutoApproved = result?.status === 'APPROVED';
            setPageStatus(isAutoApproved ? 'APPROVED' : 'PENDING');
            logActivity('page_submitted', { widgetCount: widgetsToSubmit.length, totalWidgets: widgets.length, user: user?.email, autoApproved: isAutoApproved });
            if (isAutoApproved) {
                showToast.success(`${widgetsToSubmit.length} widget(s) submitted & auto-approved!`);
            } else {
                showToast.success(`${widgetsToSubmit.length} widget(s) submitted for review!`);
            }
        } catch (e) {
            console.error(e);
            showToast.error('Failed to submit: ' + e.message);
        }
    };

    const approvePage = async (requestId) => {
        try {
            console.log('[Workflow] Approving request...');

            await LocalApiService.approveRequest(requestId);

            setPageStatus('APPROVED');
            showToast.success('Widgets approved!');
        } catch (error) {
            console.error('[Workflow] Approve failed:', error);
            showToast.error('Failed to approve: ' + error.message);
        }
    };

    const rejectPage = () => {
        setPageStatus('REJECTED');
        showToast.warning('Page rejected. Maker can edit and resubmit');
    };

    const resetToDraft = () => {
        setPageStatus('DRAFT');
        showToast.info('Page reset to draft mode');
    };

    const restoreFromHistory = (historyItem) => {
        if (historyItem && historyItem.state) {
            setWidgets(historyItem.state.widgets || []);
            setHeaderWidgets(historyItem.state.headerWidgets || headerWidgets);
            logActivity('state_restored', { timestamp: historyItem.timestamp });
            showToast.success('State restored');
        }
    };

    // Comment management
    const addComment = (comment) => {
        setComments(prev => [...prev, comment]);
        logActivity('comment_added', { widgetId: comment.widgetId, commentId: comment.id });
    };

    const deleteComment = (commentId) => {
        setComments(prev => prev.filter(c => c.id !== commentId));
        logActivity('comment_deleted', { commentId });
    };

    return (
        <WidgetContext.Provider value={{
            widgets,
            selectedWidgetId,
            setSelectedWidgetId,
            addWidget,
            updateWidget,
            deleteWidget,
            clearEmulator,
            moveWidget,
            pageStatus,
            submitForReview,
            approvePage,
            rejectPage,
            resetToDraft,
            navigateTo,
            currentView,
            viewData,
            headerWidgets,
            updateHeaderWidget,
            setPageStatus,
            setWidgets, // Exposing for Preview utility
            setHeaderWidgets, // Exposing for RequestQueue restoration
            // New features
            duplicateWidget,
            duplicateMastheadWidget,
            bulkDelete,
            selectedWidgetIds,
            toggleWidgetSelection,
            restoreFromHistory,
            // Undo/Redo
            canUndo: undoRedo.canUndo,
            canRedo: undoRedo.canRedo,
            undo: () => {
                const previous = undoRedo.undo();
                if (previous) restoreFromHistory(previous);
            },
            redo: () => {
                const next = undoRedo.redo();
                if (next) restoreFromHistory(next);
            },
            // Collaboration features
            comments,
            addComment,
            deleteComment,
            // Validation
            validationErrors,
            setValidationErrors,
            // Slug builder cache
            widgetSlugCache,
            setWidgetSlugCache,
            // Maker submit selection
            submitSelection,
            setSubmitSelection,
            toggleSubmitSelection,
            showSubmitModal,
            setShowSubmitModal,
            openSubmitModal,
        }}>
            {children}
        </WidgetContext.Provider>
    );
};
