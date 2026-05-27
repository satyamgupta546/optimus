/**
 * Maker-Checker Configuration — Source of Truth
 *
 * Defines the approval workflow: page status lifecycle,
 * transition rules, edit guards, submit/approve/reject actions,
 * and approval automation routing.
 *
 * Auth & Role Assignment has been moved to AuthConfig.js
 *
 * Wiki Reference: wiki/Feature-Maker-Checker.md
 * Auth Reference: wiki/AUTH-Flow.md (roles, login, checker management)
 * Config Reference: src/config/Feature/AuthConfig.js
 *
 * Flow:
 *   Maker (creates/edits) → Submit → Checker (reviews) → Approve/Reject → Backend API Update
 *   Super Admin (creates/edits) → Submit → Auto-Approved (no checker review needed)
 */

// ── Role Permissions (what each role can DO) ──
// Role assignment rules are in AuthConfig.js
export const ROLE_PERMISSIONS = {
    SUPER_ADMIN: {
        label: 'Super Admin',
        canCreate: true,     // Can create widgets (same as Maker)
        canEdit: true,       // Can edit widgets (same as Maker)
        canDelete: true,
        canSubmit: true,     // Can submit — auto-approved (no checker review needed)
        canPreview: true,
        canApprove: true,
        canReject: true,
        canReopen: true,
        canDeploy: true,
        canManageCheckers: true,
        canViewHistory: true,
        canLoadFromHistory: true,
        canManageStates: true,
        autoApprove: true,   // Submissions are auto-approved on the server
    },
    CHECKER: {
        label: 'Checker',
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canSubmit: false,
        canPreview: true,
        canApprove: true,
        canReject: true,
        canReopen: true,
        canDeploy: true,
        canManageCheckers: false,
        canViewHistory: true,
        canLoadFromHistory: true,  // Can load to canvas for preview (not edit)
        canManageStates: true,
    },
    MAKER: {
        label: 'Maker',
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canSubmit: true,
        canPreview: true,
        canApprove: false,
        canReject: false,
        canReopen: false,
        canDeploy: false,
        canManageCheckers: false,
        canViewHistory: true,
        canLoadFromHistory: true,  // Can load to canvas, edit, then submit
        canManageStates: true,
    },
};

// ── Page Status Lifecycle ──
export const PAGE_STATUS = {
    DRAFT: {
        label: 'Draft',
        badge: 'DRAFT',
        badgeColor: 'gray',
        animated: false,
        editable: true,
        setBy: 'System (initial) / Checker (re-open)',
        allowedActions: { maker: ['edit', 'add', 'delete', 'submit'], checker: [], super_admin: ['edit', 'add', 'delete', 'submit'] },
    },
    PENDING: {
        label: 'Pending',
        badge: 'PENDING',
        badgeColor: 'amber',
        animated: true, // pulsing badge
        editable: false,
        setBy: 'Maker (submit)',
        allowedActions: { maker: [], checker: ['preview', 'approve', 'reject'] },
    },
    APPROVED: {
        label: 'Approved',
        badge: 'APPROVED',
        badgeColor: 'green',
        animated: false,
        editable: false,
        setBy: 'Checker (approve)',
        allowedActions: { maker: [], checker: ['re-open', 'deploy'] },
    },
    REJECTED: {
        label: 'Rejected',
        badge: 'REJECTED',
        badgeColor: 'red',
        animated: false,
        editable: true,
        setBy: 'Checker (reject)',
        allowedActions: { maker: ['edit', 're-submit'], checker: [], super_admin: ['edit', 're-submit'] },
    },
};

// ── Status Transition Rules ──
export const STATUS_TRANSITIONS = [
    { from: 'DRAFT', to: 'PENDING', action: 'submitForReview', allowedRole: 'maker', description: 'Maker submits for review' },
    { from: 'DRAFT', to: 'APPROVED', action: 'submitForReview', allowedRole: 'super_admin', description: 'Super Admin submit → auto-approved (server-side)' },
    { from: 'PENDING', to: 'APPROVED', action: 'approvePage', allowedRole: 'checker', description: 'Only Checker can approve' },
    { from: 'PENDING', to: 'REJECTED', action: 'rejectPage', allowedRole: 'checker', description: 'Only Checker can reject' },
    { from: 'APPROVED', to: 'DRAFT', action: 'resetToDraft', allowedRole: 'checker', description: 'Only Checker can re-open' },
    { from: 'REJECTED', to: 'PENDING', action: 'submitForReview', allowedRole: 'maker', description: 'Maker edits and re-submits' },
];

// ── Edit Guards ──
// All editing operations check page status before proceeding
export const EDIT_GUARDS = {
    editableStatuses: ['DRAFT', 'REJECTED'],
    guardedOperations: ['addWidget', 'updateWidget', 'deleteWidget', 'moveWidget', 'duplicateWidget', 'duplicateMastheadWidget', 'bulkDelete'],
    blockedMessage: 'Cannot edit while in review or approved',
    source: 'src/context/WidgetContext.jsx',
};

// ── Button Visibility Matrix ──
export const BUTTON_VISIBILITY = {
    DRAFT: { submit: true, approve: false, reject: false, reopen: false, deploy: false },
    PENDING: { submit: false, approve: true, reject: true, reopen: false, deploy: false },
    APPROVED: { submit: false, approve: false, reject: false, reopen: true, deploy: true },
    REJECTED: { submit: true, approve: false, reject: false, reopen: false, deploy: false }, // submit acts as "re-submit"
};

// ── Submit Payload (Maker → Local API) ──
// Updated: Maker now selects which widgets to include before submitting.
// A modal shows all canvas widgets with checkboxes (all pre-selected by default).
export const SUBMIT_PAYLOAD = {
    fields: {
        widgetIds: '$selectedWidgetIds', // Only the body widget IDs selected in the submit modal
        headerWidgets: '$selectedHeaderWidgets', // Only selected header widgets (cleaned JSON)
    },
    selectionFlow: {
        trigger: 'Submit button opens selection modal',
        defaultState: 'All widgets pre-selected (body + header)',
        minSelection: 1,
        includesHeaderWidgets: true, // Header widgets shown as selectable items in submit modal
        headerWidgetDisplay: 'Purple highlight with HEADER badge — shown above body widgets',
        modal: 'MainLayout.jsx — showSubmitModal state',
        context: 'WidgetContext.jsx — submitSelection, openSubmitModal, toggleSubmitSelection',
    },
    slugHandling: {
        description: 'Slug created by SlugBuilder is passed through as-is — no uniqueness check',
        validation: 'Required field check only (slug cannot be empty)',
        storage: 'Slug stored in BigQuery (Kinetic) as source of truth + BigQuery Widget for versions/comments',
    },
    headerCleaning: 'File objects removed from headerWidgets for serialization',
    service: 'LocalApiService.createRequest() + LocalApiService.submitRequest()',
    onSuccess: {
        statusChange: 'PENDING',
        toast: '{N} widget(s) submitted for review!',
        editLocked: true,
    },
};

// ── Checker Actions ──
export const CHECKER_ACTIONS = {
    preview: {
        description: 'Restores maker widgets to canvas and renders in emulator',
        statusChange: null,
        toast: "Previewing {user}'s request",
    },
    approve: {
        description: 'Selected widgets approved. Backend API calls triggered for deployment.',
        service: 'LocalApiService.approveRequest()',
        payload: { selectedWidgetIds: '$selectedWidgetIds' },
        statusChange: 'APPROVED',
        toast: 'Widgets approved! Automation triggered successfully',
    },
    reject: {
        description: 'Status updated to REJECTED with optional reason. Maker can re-edit.',
        service: 'LocalApiService.rejectRequest()',
        payload: { reason: '$rejectionReason' },
        statusChange: 'REJECTED',
        toast: 'Page rejected. Maker can edit and resubmit',
    },
    reopen: {
        description: 'Reset APPROVED/REJECTED page back to DRAFT for editing',
        service: 'LocalApiService.reopenRequest()',
        statusChange: 'DRAFT',
        toast: 'Page reset to draft mode',
    },
    deploy: {
        description: 'Deploy approved widgets to Django backend via API calls',
        service: 'BackendSyncService.deployRequest()',
        requiresCsrf: true,
        csrfSource: 'Auto-read from session cookie via getCsrfToken() (AuthService.js)',
        csrfPrompt: false,  // No manual prompt — auto-read from cookie
        toast: null, // varies by result
        multimediaStep: 'Step 0: POST /api/app/multimedia/ — only when has_multimedia=true, before widget creation',
        mappingHelper: 'postMapping() — dedicated helper, no csrfmiddlewaretoken in body, Blob+3-arg append',
        stateWiseProducts: 'Creates per-state sub-category items when widget.stateProducts has multiple keys',
    },
    approveAndDeploy: {
        description: 'One-click: approve in BigQuery (Kinetic) + deploy to Django backend in sequence',
        steps: ['LocalApiService.approveRequest()', 'BackendSyncService.deployRequest()'],
        requiresCsrf: true,
        csrfSource: 'Auto-read from session cookie via getCsrfToken() (AuthService.js)',
        toast: 'Approved! → Deploying...',
        note: 'Approve updates BigQuery status only. Deploy makes actual API calls to Django backend.',
    },
};

// ── Approval Lock (Race Condition Prevention) ──
// Only one approve/reject processes at a time (in-memory lock on server).
// Prevents duplicate DB writes, double Kinetic syncs, double activity logs.
export const APPROVAL_LOCK = {
    source: 'server/routes/requests.js',
    type: 'In-memory lock (single-process)',
    lockState: '{ requestId, user, startedAt } or null',
    timeoutMs: 10000, // Auto-release after 10s to prevent deadlocks
    appliesTo: ['/:id/approve', '/:id/reject'],
    httpStatus: 423, // Locked
    responseShape: '{ error, lockedBy, requestId }',
    frontendHandling: {
        source: 'src/components/Dashboard/RequestQueue.jsx',
        detection: 'error.status === 423',
        toast: 'An approval is already in progress, please wait a moment',
        autoRetry: false, // User clicks again manually
    },
};

// Express backend (server/routes/requests.js) handles approval for each widget type
// Source of truth: BigQuery (Kinetic) — BigQuery Widget.status still updated for versions/comments
export const APPROVAL_ROUTING = {
    source: 'server/routes/requests.js',
    dataStore: 'BigQuery (Kinetic) — widget_submissions / widget_submissions_uat tables',
    entryFunction: 'POST /api/local/requests/:id/approve',
    authentication: 'X-Optimus-User + X-Optimus-Env headers — auth middleware upserts User in BigQuery, resolves role per-environment',
    widgetRoutes: {
        'Single Product Row Optimize': { handler: 'server/routes/requests.js', description: 'PLP Ecosystem + Homepage Row' },
        'Single Product Row': { handler: 'server/routes/requests.js', description: 'Standard Widget + Page Layout' },
        'Banner With Product Listing': { handler: 'server/routes/requests.js', description: 'Carousel + PLP Ecosystem' },
        'Primary Masthead': { handler: 'server/routes/requests.js', description: 'Multimedia + Masthead Widget' },
        'Category Grid': { handler: 'server/routes/requests.js', description: 'Category Grid + PLP Ecosystems' },
        'Category Masthead': { handler: 'server/routes/requests.js', description: 'Same as Category Grid' },
        'Secondary Masthead': { handler: 'server/routes/requests.js', description: 'Secondary Masthead' },
    },
    headerWidgetRoutes: {
        primaryMasthead: { condition: 'headerWidgets.primaryMasthead?.enabled' },
        secondaryMasthead: { condition: 'headerWidgets.secondaryMasthead?.enabled' },
        categoryMasthead: { condition: 'headerWidgets.categoryMasthead?.enabled' },
    },
    // Fetched vs Created widget handling
    fetchedWidgetLogic: {
        isFetched: '_fetched === true && slug exists',
        onApprove: 'UPDATE existing widget via API',
        isNew: '_fetched is undefined',
        onApproveNew: 'CREATE new widget via API',
    },
    // Slug validation: checks both widget.slug and widget.slug_name
    slugValidation: {
        frontendCheck: 'ValidationService.js — widget.slug || widget.slug_name',
        backendCheck: 'server/middleware/validate.js — same fallback',
        backendCreate: 'server/routes/requests.js — w.slug || w.slug_name || auto-generated',
    },
};

// ── Fetched vs Created Widget Comparison ──
export const WIDGET_ORIGIN = {
    created: {
        _fetched: undefined,
        slug: 'empty or auto-generated',
        _rawData: undefined,
        onApprove: 'Create new backend records',
        slugOnBackend: 'New slug with suffix',
    },
    fetched: {
        _fetched: true,
        slug: 'Original backend slug',
        _rawData: 'Original API response',
        onApprove: 'Update existing backend records',
        slugOnBackend: 'Original slug preserved',
    },
};

// ── Activity Logging ──
// Source of truth: BigQuery activity_log table (via KineticSyncService)
// Request actions (submit/approve/reject/reopen) use BLOCKING writes (throw on failure)
// Widget CRUD actions use fire-and-forget (logActivitySafe — never throws)
export const ACTIVITY_LOG = {
    source: 'BigQuery activity_log table (server/services/KineticSyncService.js)',
    frontendContext: 'src/context/ActivityLogContext.jsx',
    maxEntries: 100,
    actions: {
        widget_added: { logged: '{widgetId, type, title}', triggeredBy: 'addWidget()' },
        widget_updated: { logged: '{widgetId, changes: [fieldNames]}', triggeredBy: 'updateWidget()' },
        widget_deleted: { logged: '{widgetId, type}', triggeredBy: 'deleteWidget()' },
        widget_duplicated: { logged: '{originalId, newId, masthead?}', triggeredBy: 'duplicateWidget() or duplicateMastheadWidget()' },
        bulk_delete: { logged: '{count, widgetIds}', triggeredBy: 'bulkDelete()' },
        state_restored: { logged: '{timestamp}', triggeredBy: 'restoreFromHistory()' },
        comment_added: { logged: '{widgetId, commentId}', triggeredBy: 'addComment()' },
        comment_deleted: { logged: '{commentId}', triggeredBy: 'deleteComment()' },
    },
};

// ── Logout & Cache Clearing ──
// Logout clears all session state to prevent "invalid credentials" on re-login.
// Root cause: stale CSRF cookies / Django session cookies interfere with fresh login flow.
export const LOGOUT_BEHAVIOR = {
    trigger: 'Logout button (MainLayout header top-right)',
    steps: [
        'AuthService.logoutUser() — GET /logout/ to Django backend (fire-and-forget)',
        'Clear all local cookies (with domain + path variants for thorough removal)',
        'Clear window.currentUser reference',
        'localStorage.removeItem("optimus_user") — clear stored user',
        'window.location.reload() — hard reload clears all React state (WidgetContext, ActivityLog, UndoRedo, etc.)',
    ],
    preserves: ['optimus_env — environment selection survives logout for convenience'],
    clears: ['optimus_user', 'All cookies (csrftoken, sessionid, etc.)', 'All React context state (via page reload)'],
    source: {
        authService: 'src/services/AuthService.js — logoutUser()',
        authContext: 'src/context/AuthContext.jsx — logout()',
    },
};

// ── Masthead Action Buttons ──
// Primary and Secondary mastheads render outside the sortable widget list (in AppHeader / PhoneFrame).
// They have their own Copy / Delete action buttons that appear when selected.
// Duplicate uses duplicateMastheadWidget() — REPLACES original in-place (single-slot behavior).
export const MASTHEAD_ACTIONS = {
    primaryMasthead: {
        renderedIn: 'src/components/Preview/AppHeader.jsx',
        actions: ['duplicate (replace)', 'delete'],
        buttonPosition: 'absolute top-2 right-2 z-30',
        selectionSource: 'selectedWidgetId === primaryWidget.id',
    },
    secondaryMasthead: {
        renderedIn: 'src/components/Preview/PhoneFrame.jsx',
        actions: ['duplicate (replace)', 'delete'],
        buttonPosition: 'absolute top-2 right-2 z-30',
        selectionSource: 'selectedWidgetId === secondaryWidget.id',
    },
    duplicateBehavior: {
        function: 'duplicateMastheadWidget(id) — WidgetContext.jsx',
        description: 'Replaces original in-place with a fresh copy (new ID, cleared slug, no _fetched link)',
        reason: 'Mastheads are single-slot — .find() picks first match, so a normal insert-after duplicate would be invisible',
        clearedFields: ['slug', 'slug_name', '_fetched', '_rawData'],
        preservedFields: ['type', 'pnc', 'all config/styling fields'],
    },
};

// ── Error Handling ──
export const ERROR_HANDLING = {
    submitFails: { behavior: 'Stays in DRAFT', toast: 'Failed to submit' },
    approvalFails: { behavior: 'Stays PENDING', toast: 'Failed to approve: {error}' },
    kineticUnavailable: { behavior: '502 error — source of truth unavailable', toast: 'BigQuery write failed: {error}' },
    individualWidgetFails: { behavior: 'Backend returns 400 with validation error details', toast: null },
    authExpired: { behavior: 'Auth middleware rejects request', fix: 'Re-login required' },
    unsupportedType: { behavior: 'Skipped during approval routing', toast: null },
    editWhileLocked: { behavior: 'Blocked', toast: 'Cannot edit while in review or approved' },
    fetchNotFound: { behavior: 'Toast shown', toast: 'Widget not found with slug: {slug}' },
    slugValidationFails: { behavior: 'Checks widget.slug then widget.slug_name before failing', toast: 'slug_name cannot be empty' },
    emptyBackgroundMultimedia: { behavior: 'Deploy error', fix: 'Omit field if empty', toast: 'Background Multimedia Name is invalid' },
};

// ── UI Components ──
export const UI_COMPONENTS = {
    MainLayout: { file: 'src/components/Layout/MainLayout.jsx', role: 'Status badge, Submit/Re-open buttons, Manage Users button (super admin)' },
    ManageApprovalUsers: { file: 'src/components/AdminPanel/ManageApprovalUsers.jsx', role: 'Add/remove checkers (super admin only)' },
    RequestQueue: { file: 'src/components/Dashboard/RequestQueue.jsx', role: 'Checker review UI, approve/reject/deploy' },
    FetchWidget: { file: 'src/components/FetchWidget.jsx', role: 'Fetch existing widgets by slug' },
    WidgetContext: { file: 'src/context/WidgetContext.jsx', role: 'State management, submit/approve/reject functions' },
    AuthContext: { file: 'src/context/AuthContext.jsx', role: 'User state, checker list, role helpers' },
    ActivityLogContext: { file: 'src/context/ActivityLogContext.jsx', role: 'Audit trail' },
    BackendSyncService: { file: 'src/services/BackendSyncService.js', role: 'Direct backend deployment' },
    LocalApiService: { file: 'src/services/LocalApiService.js', role: 'Express backend API client (submit, approve, widgets, users, catalog)' },
    ValidationService: { file: 'src/services/ValidationService.js', role: 'Pre-submit validation + slug uniqueness checks' },
    PrismaSchema: { file: 'server/prisma/schema.prisma', role: 'Database models (Widget, WidgetVersion, User, CheckerList, etc. — Request/RequestWidget/ActivityLog moved to BigQuery)' },
    KineticSetup: { file: 'server/scripts/kinetic-setup.js', role: 'BigQuery table + query definitions (widget_submissions, activity_log)' },
    KineticSyncService: { file: 'server/services/KineticSyncService.js', role: 'Blocking + fire-and-forget BigQuery operations' },
    SnapshotPreview: { file: 'src/components/Dashboard/SnapshotPreview.jsx', role: 'Visual widget renderer from snapshot — used in WidgetHistory Preview' },
    MapToPageModal: { file: 'src/components/Dashboard/MapToPageModal.jsx', role: 'Post-deploy Layer 2 mapping modal — maps deployed widget slugs to page layout (Checker only)' },
    WidgetHistory: { file: 'src/components/Dashboard/WidgetHistory.jsx', role: 'Date-based widget history — browse submissions by date, load to canvas (spreads ALL snapshot fields), edit, submit/approve' },
    StateManagerModal: { file: 'src/components/AdminPanel/StateManagerModal.jsx', role: 'Manage states/cities — backend-persisted via Location model (BigQuery DB)' },
    LocationService: { file: 'src/services/LocationService.js', role: 'Async state definitions fetcher with in-memory cache — replaces localStorage-based sync approach' },
};
