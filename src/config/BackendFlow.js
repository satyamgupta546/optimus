/**
 * BackendFlow — End-to-End Widget Lifecycle Config
 *
 * This is the single source of truth for the complete backend workflow:
 * UI Input → Submit → Validation → Approval → Backend API Deployment
 *
 * Wiki Reference: wiki/Backend-work-flow.md
 *
 * Architecture:
 *   UI (Canvas) → Express Backend (PENDING) → BigQuery DB (Validation + Status Update)
 *   → Backend API (POST/PATCH widgets, requests, approvals)
 */

// ── Workflow Stages ──
// The ordered stages a widget passes through from creation to deployment.
export const WORKFLOW_STAGES = {
    DRAFT: {
        label: 'Draft',
        description: 'Maker is creating or editing widgets. Canvas is editable.',
        allowedRoles: ['MAKER', 'CHECKER', 'SUPER_ADMIN'],
        editableBy: ['MAKER'],
        next: ['PENDING'],
    },
    PENDING: {
        label: 'Pending Review',
        description: 'Maker has submitted. Canvas is locked. Checker can review.',
        allowedRoles: ['CHECKER', 'SUPER_ADMIN'],
        editableBy: [],
        next: ['APPROVED', 'REJECTED'],
    },
    APPROVED: {
        label: 'Approved',
        description: 'Checker approved. Backend API calls triggered. Widgets are live.',
        allowedRoles: ['CHECKER', 'SUPER_ADMIN'],
        editableBy: [],
        next: ['DRAFT'], // via Re-open
    },
    REJECTED: {
        label: 'Rejected',
        description: 'Checker rejected. Maker can re-edit and re-submit.',
        allowedRoles: ['MAKER', 'CHECKER', 'SUPER_ADMIN'],
        editableBy: ['MAKER'],
        next: ['PENDING'],
    },
};

// ── Role Permissions ──
// What each role can do at each workflow stage.
export const ROLE_PERMISSIONS = {
    MAKER: {
        canCreate: true,
        canEdit: true,           // Only in DRAFT / REJECTED
        canDelete: true,         // Only in DRAFT / REJECTED
        canSubmit: true,         // Only in DRAFT / REJECTED
        canApprove: false,
        canReject: false,
        canReopen: false,
        canDeploy: false,
    },
    CHECKER: {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canSubmit: false,
        canApprove: true,        // Only in PENDING
        canReject: true,         // Only in PENDING
        canReopen: true,         // Only in APPROVED
        canDeploy: true,         // Only in APPROVED
    },
    SUPER_ADMIN: {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canSubmit: true,
        canApprove: true,
        canReject: true,
        canReopen: true,
        canDeploy: true,
        canManageCheckers: true, // Unique to SUPER_ADMIN
    },
};

// ── Submit Payload Schema ──
// The shape of data sent to Express backend when Maker submits.
export const SUBMIT_PAYLOAD_SCHEMA = {
    widgets: '<Array of canvas widgets>',      // All canvas widgets (JSON)
    headerWidgets: {
        primaryMasthead: '<Object or null>',
        secondaryMasthead: '<Object or null>',
        categoryMasthead: '<Object or null>',
    },
};

// ── Database Fields ──
// Maps payload data to their BigQuery DB table fields.
export const DB_FIELDS = {
    widget: {
        env: { type: 'string', default: 'PROD', values: ['UAT', 'PROD'], description: 'Environment — same slug allowed in both. Unique constraint: @@unique([slug, env])' },
    },
    request: {
        id: { type: 'uuid', auto: true, description: 'BigQuery auto-generated UUID' },
        submittedBy: { type: 'string', source: 'req.user.id', description: 'User FK from auth middleware' },
        type: { type: 'string', default: 'Homepage Update' },
        status: { type: 'enum', values: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] },
        headerWidgets: { type: 'JSON', description: 'Stringified header widget state' },
    },
    requestWidget: {
        snapshot: { type: 'JSON', description: 'Full widget state frozen at submission' },
        sortOrder: { type: 'int', description: 'Widget position in the request' },
    },
};

// ── Validation Rules ──
// Fields validated by Express backend (server/middleware/validate.js) and
// frontend ValidationService before any submission or approval.
export const VALIDATION_RULES = {
    // Fields required on every widget
    universal: [
        { field: 'type', rule: 'required', error: 'Widget type is missing' },
        { field: 'slug', rule: 'required', error: 'slug_name cannot be empty' },
        { field: 'title', rule: 'required', error: 'heading_en / text_en cannot be empty' },
        { field: 'startTime', rule: 'datetime', error: 'start_time format must be YYYY-MM-DD HH:MM:SS' },
        { field: 'endTime', rule: 'datetime', error: 'end_time format must be YYYY-MM-DD HH:MM:SS' },
    ],
    // Fields required per widget type
    perType: {
        'Single Product Row': [
            { field: 'products', rule: 'minItems:1', error: 'product_list cannot be empty' },
        ],
        'Single Product Row Optimize': [
            { field: 'products', rule: 'minItems:1', error: 'product_list cannot be empty' },
        ],
        'Primary Masthead': [
            {
                field: 'background_multimedia',
                rule: 'omitIfEmpty',
                error: 'Background Multimedia Name is invalid — omit field if empty',
            },
        ],
        'Banner With Product Listing': [
            { field: 'items', rule: 'minItems:1', error: 'At least 1 carousel item required' },
        ],
        'Category Grid': [
            { field: 'items', rule: 'minItems:1', error: 'At least 1 category item required' },
        ],
    },
};

// ── Approval Routing ──
// Maps internal widget type (from canvas) → backend handler.
// Previously routed to Apps Script functions; now handled by Express routes.
export const APPROVAL_ROUTING = {
    // Config-driven Product Rail (all 8 SPR/DPR variants via PNC resolution)
    'product_rail': {
        handler: 'BackendSyncService.js',
        fn: 'deploySPROptimized / deploySPRStandard (based on pnc.is_optimized)',
        description: 'PNC → resolveWidgetType() → routes to optimized or standard deploy flow',
        pncRouting: true,
        multimediaUpload: 'Step 0: POST /api/app/multimedia/ when has_multimedia=true (before widget creation)',
        stateWiseProducts: 'stateProducts: { global, jh, cg, ... } → per-state sub-category widget items',
        titleOptional: 'Title not required when has_multimedia=true',
    },
    // Legacy type names (backward compat)
    'Single Product Row Optimize': {
        handler: 'server/routes/requests.js',
        fn: 'createSPROptimizedWidget',
        description: 'PLP Ecosystem + Homepage Row',
    },
    'Single Product Row': {
        handler: 'server/routes/requests.js',
        fn: 'createSPRStandardWidget',
        description: 'Standard Widget + Page Layout + Mappings',
    },
    'Banner With Product Listing': {
        handler: 'server/routes/requests.js',
        fn: 'createCLPWidget',
        description: 'Carousel + PLP Ecosystem per item',
    },
    'Primary Masthead': {
        handler: 'server/routes/requests.js',
        fn: 'createPrimaryMastheadFromApproval',
        description: 'Multimedia (optional) + Masthead Widget',
    },
    'Category Grid': {
        handler: 'server/routes/requests.js',
        fn: 'createCategoryGridFromApproval',
        description: 'Category Grid + PLP Ecosystems per item',
    },
    'Category Masthead': {
        handler: 'server/routes/requests.js',
        fn: 'createCategoryGridFromApproval',
        description: 'Same as Category Grid',
    },
};

// ── API Endpoints ──
// All backend REST endpoints used during widget creation.
export const BACKEND_ENDPOINTS = {
    widgetItem: { url: '/api/app/post_widget_item/', method: 'POST', contentType: 'multipart/form-data' },
    widget: { url: '/api/app/widget/', method: 'POST', contentType: 'multipart/form-data' },
    pageLayout: { url: '/api/app/post_page_layout/', method: 'POST', contentType: 'application/json' },
    multimedia: { url: '/api/app/multimedia/', method: 'POST', contentType: 'multipart/form-data' },
    fetchWidget: { url: '/api/app/widget/', method: 'GET', param: 'slug_name' },
    fetchItem: { url: '/api/app/widget_item/', method: 'GET', param: 'slug_name' },
};

// ── Approval Response Schema ──
// Shape of response returned by Express backend after approval.
export const APPROVAL_RESPONSE_SCHEMA = {
    success: '<boolean>',
    message: '<string>',
    results: [
        {
            widget: '<widget title>',
            status: 'success | failed | skipped',
            slug: '<created backend slug>',
            error: '<error message if failed>',
        },
    ],
    errors: '<Array of failed widget objects>',
};

// ── Fetched Widget Markers ──
// Properties added to canvas widgets that were fetched from the backend.
// Used by the approval flow to decide CREATE vs UPDATE.
export const FETCHED_WIDGET_MARKERS = {
    _fetched: true,              // Identifies widget as fetched (not newly created)
    slug: '<original_slug>',     // Original backend slug — preserved throughout editing
    _rawData: '<API response>',  // Original API response snapshot
};

// ── Error Catalogue ──
// Known validation errors with their causes and fixes.
export const ERROR_CATALOGUE = [
    {
        error: 'product_list cannot be empty',
        widgets: ['Single Product Row', 'Single Product Row Optimize'],
        cause: 'No product codes entered in the form',
        fix: 'Add at least 1 product code in the Products field',
    },
    {
        error: 'Background Multimedia Name is invalid',
        widgets: ['Primary Masthead', 'Secondary Masthead', 'Single Product Row'],
        cause: 'background_multimedia field sent as empty string',
        fix: 'Do not include the background_multimedia field if no media is uploaded',
    },
    {
        error: 'slug_name already exists',
        widgets: ['Any'],
        cause: 'The slug is already taken on the backend',
        fix: 'Use a unique slug — append timestamp or different base',
    },
    {
        error: 'start_time / end_time format invalid',
        widgets: ['Any'],
        cause: 'Date not in expected format',
        fix: 'Use format: YYYY-MM-DD HH:MM:SS',
    },
    {
        error: 'Type not supported',
        widgets: ['Any'],
        cause: 'Widget type not registered in APPROVAL_ROUTING',
        fix: 'Add a new entry in BackendFlow.APPROVAL_ROUTING for this widget type',
    },
    {
        error: 'Session expired (403)',
        widgets: ['Any'],
        cause: 'Auth session has expired',
        fix: 'Re-login to refresh session',
    },
];

// ── Deploy Config ─────────────────────────────────────────────────────────
// Controls how CSRF tokens are obtained for deploy requests.
// Previously: manual prompt() for CSRF token.
// Now: auto-read from session cookie set during login.
export const DEPLOY_CONFIG = {
    csrfSource: 'cookie',                    // Read from document.cookie (csrftoken)
    csrfFunction: 'getCsrfToken()',           // Exported from AuthService.js
    fallback: 'Toast error — re-login',       // If no token found
    manualPrompt: false,                      // No longer prompts user
    multimediaUpload: {
        endpoint: '/api/app/multimedia/',
        method: 'POST',
        contentType: 'multipart/form-data',
        trigger: 'has_multimedia=true && background_media is File',
        step: 'Step 0 — before widget creation',
        fields: ['name', 'multimedia_type=3', 'file_en', 'aspect_ratio=1', 'transition_color', 'accent_color', 'text_color', 'icon_bg_color', 'is_multimedia_dark'],
    },
    mappingHelper: {
        function: 'postMapping()',
        description: 'Dedicated helper for CSV mapping — no csrfmiddlewaretoken in form body, uses Blob+3-arg append',
        csvFileFormat: 'new Blob([content], {type: text/csv}), filename: mapping.csv',
    },
    stateWiseProducts: {
        source: 'widget.stateProducts',
        format: '{ global: "1,2,3", jh: "4,5", cg: "6,7" }',
        deployBehavior: 'Creates per-state sub-category widget items with location-wise mapping CSV',
        globalFallback: 'widget.products[] if stateProducts not present',
    },
};

// ── Approve vs Deploy Distinction ─────────────────────────────────────────
// IMPORTANT: Approve ≠ Deploy. These are two separate steps.
//   Approve: Updates BigQuery DB status (PENDING → APPROVED). No backend API calls.
//   Deploy:  Makes actual API calls to Django backend (POST widget, mappings, etc.)
//
// Three ways to deploy:
//   1. "Approve" button → only updates BigQuery. Then "Deploy" button separately.
//   2. "Approve & Deploy" button → does both in one click (approve BigQuery + deploy backend).
//   3. "Deploy" button on already-APPROVED requests → re-deploy (manual sync).
export const APPROVE_DEPLOY_FLOW = {
    approveOnly: {
        service: 'LocalApiService.approveRequest()',
        effect: 'BigQuery status → APPROVED (no backend API calls)',
        uiButton: 'Approve',
    },
    deployOnly: {
        service: 'BackendSyncService.deployRequest()',
        effect: 'POST/PATCH widgets to Django backend',
        uiButton: 'Deploy (visible on APPROVED requests in All History tab)',
    },
    approveAndDeploy: {
        services: ['LocalApiService.approveRequest()', 'BackendSyncService.deployRequest()'],
        effect: 'BigQuery status → APPROVED + backend API calls in sequence',
        uiButton: 'Approve & Deploy',
    },
};

// ── Workflow Summary (for WidgetRegistry integration) ──
// Consumed by WidgetRegistry.getWorkflowConfig() to expose workflow info.
// Updated: Feb 2026 — synced with wiki/Backend-work-flow.md §9 (Reliability Improvements)
//                     and wiki/FEATURE-Fetch-Widget.md §11 (Fetched Widget Re-Deploy)
export const WORKFLOW_SUMMARY = {
    name: 'Backend Work Flow',
    version: '2.0',                     // Bumped: reliability improvements + widget selection
    wikiRef: 'wiki/Backend-work-flow.md',
    wikiSections: {
        widgetSelection: 'wiki/Backend-work-flow.md#step-71--widget-selection-approve-se-pehle',
        reliabilityImprovements: 'wiki/Backend-work-flow.md#9-reliability-improvements',
        fetchWidgetReDeploy: 'wiki/FEATURE-Fetch-Widget.md#11-fetched-widget-re-deploy-patch-flow',
    },
    stages: Object.keys(WORKFLOW_STAGES),
    roles: Object.keys(ROLE_PERMISSIONS),
    backend: {
        type: 'Express + BigQuery',
        port: 3001,
        dbFile: 'server/prisma/optimus.db',
    },
};

// ── Widget Selection Config ─────────────────────────────────────────────────
// Controls widget selection for both Maker (submit) and Checker (approval).
// Maker: selects which widgets to include in a submit request (Step 4.1).
// Checker: selects which widgets to approve from a pending request (Step 7.1).
// Wiki Reference: wiki/Backend-work-flow.md — Step 4.1 & Step 7.1
export const WIDGET_SELECTION_CONFIG = {
    // ── Maker Submit Selection ──
    maker: {
        enabled: true,                             // Show widget picker modal before submit
        defaultState: 'all_selected',              // All body + header widgets pre-selected by default
        minSelection: 1,                           // At least 1 widget must be selected to submit
        includesHeaderWidgets: true,               // Header widgets (mastheads) shown as selectable items
        headerWidgetKeys: ['primaryMasthead', 'secondaryMasthead'],
        modalTitle: 'Submit for Review',
        modalDescription: 'Select widgets to send for approval',
    },

    // ── Checker Approval Selection ──
    checker: {
        minSelection: 1,                           // At least 1 widget must be selected to approve
        bodySelectionKey: 'selectedWidgets',        // Map<reqId, Set<widgetIndex>>
        headerSelectionKey: 'selectedHeaderWidgets',// Map<reqId, Set<headerKey>>
        headerWidgetKeys: ['primaryMasthead', 'secondaryMasthead'],
        allowedStatuses: ['PENDING'],              // Selection UI only for PENDING requests
    },
};


// ── Session Auto-Refresh Config ─────────────────────────────────────────────
// Used by withSessionRetry.js to handle 403 / expired-session recovery.
// Wiki Reference: wiki/Backend-work-flow.md — Session Auto-Refresh
export const SESSION_CONFIG = {
    maxRetryOn403: 2,                   // Max times to retry after a 403
    refreshEndpoint: '/login/',          // GET this URL to refresh CSRF cookie
    cookieName: 'csrftoken',             // Name of the CSRF cookie
};

// ── Retry Config (Exponential Backoff) ─────────────────────────────────────
// Used by BackendSyncService.fetchWithRetry() for transient server errors.
// Wiki Reference: wiki/Backend-work-flow.md — Retry Logic
export const RETRY_CONFIG = {
    maxRetries: 3,                       // Total attempts (1 original + 2 retries)
    baseDelayMs: 500,                    // First retry delay in ms
    backoffMultiplier: 2,                // Each retry: delay × multiplier (500 → 1000 → 2000)
    retryOnStatus: [500, 502, 503, 504], // HTTP status codes that trigger a retry
};

// ── Fetched Widget Update Strategy ─────────────────────────────────────────
// Defines how fetched (existing) widgets are identified and re-deployed.
// Wiki Reference: wiki/FEATURE-Fetch-Widget.md — Re-Deploy Flow
export const FETCHED_WIDGET_UPDATE_STRATEGY = {
    checkMarker: '_fetched',             // Presence of this flag → widget already on backend
    slugField: 'slug_name',              // Field containing the existing backend slug
    preferMethod: 'PATCH',              // Prefer PATCH for updates; falls back to POST if PATCH 405
    skipSlugCheck: true,                 // Skip slug uniqueness check for fetched widgets
};

// ── Widget Environment Isolation ─────────────────────────────────────────────
// Widget model has `env` field (UAT | PROD, default PROD).
// All widget CRUD routes filter by `req.env` (resolved from X-Optimus-Env header).
// Same slug allowed in both environments — unique constraint: @@unique([slug, env])
export const WIDGET_ENV_CONFIG = {
    field: 'env',
    values: ['UAT', 'PROD'],
    default: 'PROD',
    uniqueConstraint: '@@unique([slug, env])',
    routesFiltered: ['GET /widgets', 'POST /widgets', 'POST /:id/duplicate'],
    headerSource: 'X-Optimus-Env',
    frontendStorage: 'localStorage.optimus_env',
};

// ── Version History Pagination ─────────────────────────────────────────────────
// GET /widgets/:id/versions supports cursor-based pagination.
export const VERSION_PAGINATION_CONFIG = {
    defaultLimit: 20,
    maxLimit: 100,
    cursorField: 'version',
    cursorDirection: 'lt',              // Load versions with version < cursor
    responseShape: {
        versions: 'Array<WidgetVersion>',
        hasMore: 'boolean',
        nextCursor: 'number | null',
    },
};
