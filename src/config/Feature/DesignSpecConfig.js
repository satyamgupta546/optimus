/**
 * Design Spec Configuration — Source of Truth for all Optimus screens.
 *
 * Defines:
 *   1. Design Tokens (colors, radii, fonts, icon lib)
 *   2. Screen Registry (14 screens — paths, props, state, mock data)
 *   3. Modal Configuration (slide direction, gradient headers)
 *   4. Component Interfaces (new components — props shape)
 *   5. Mock Data Shapes (mapping, version history, deploy results, products)
 *   6. Integration Points (context, services per screen)
 *
 * Wiki Reference: wiki/DESIGN-SPEC-All-Screens.md
 *
 * Tech Stack: React 19 + Vite 7 + Tailwind CSS 3.4 | No external UI libraries.
 */

// ── Design Tokens ──
// Tailwind class values used consistently across all screens.
export const DESIGN_TOKENS = {
    colors: {
        primary: 'blue-600',
        neutralBg: 'slate-50',
        cardBg: 'white',
        inputBg: 'slate-50',
        border: 'slate-200',
        borderDark: 'slate-700',
        textPrimary: 'slate-900',
        textSecondary: 'slate-500',
        textInput: 'slate-800',
        error: 'red-500',
        success: 'green-500',
        warning: 'amber-500',
    },
    radius: {
        card: 'rounded-xl',
        button: 'rounded-lg',
    },
    font: {
        body: 'text-sm',   // 14px
        label: 'text-xs',  // 12px
    },
    iconLib: 'lucide-react',
};

// ── Screen Registry ──
// All 14 screens in Optimus. Each entry defines path, purpose, props, state, and mock data.
export const SCREEN_REGISTRY = [
    {
        id: 'login',
        name: 'Login Page',
        path: 'src/components/Auth/LoginPage.jsx',
        purpose: 'Google OAuth login gate. Single CTA.',
        props: null,
        state: null,
        context: ['useAuth()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'main_canvas',
        name: 'Main Canvas (3-Panel Layout)',
        path: 'src/components/Layout/MainLayout.jsx',
        purpose: 'Primary workspace — header + resizable sidebar + phone preview.',
        props: null,
        state: ['showQueue', 'showHeaderConfig', 'showManageUsers', 'showMapping', 'showHistory', 'showDeploy', 'showStateManager'],
        context: ['useAuth()', 'useWidgetContext()', 'useAppSettings()'],
        mockData: null,
        isNew: false,
        children: [
            'Header', 'Sidebar', 'PhoneFrame',
            'HeaderConfiguration', 'ManageApprovalUsers',
            'HomepageMappingDashboard', 'WidgetHistory', 'DeploymentStatusPanel',
            'StateManagerModal', 'HelpGuide',
        ],
    },
    {
        id: 'widget_library',
        name: 'Widget Library Sidebar',
        path: 'src/components/Sidebar/WidgetLibrary.jsx',
        purpose: 'Drag source for adding widgets to the phone preview.',
        props: null,
        state: null,
        context: ['useWidgetContext()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'property_editor',
        name: 'Property Editor',
        path: 'src/components/Sidebar/PropertyEditor.jsx',
        purpose: 'Edit selected widget properties via config-driven form.',
        props: null,
        state: null,
        context: ['useWidgetContext()'],
        mockData: null,
        isNew: false,
        sections: ['pnc', 'content', 'advanced', 'filters', 'appConfig'],
    },
    {
        id: 'phone_preview',
        name: 'Phone Preview (Emulator)',
        path: 'src/components/Preview/PhoneFrame.jsx',
        purpose: 'Live widget preview in mobile phone frame.',
        props: null,
        state: null,
        context: ['useWidgetContext()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'fetch_widget',
        name: 'Fetch Widget Panel',
        path: 'src/components/FetchWidget.jsx',
        purpose: 'Fetch existing widget data from backend API.',
        props: null,
        state: null,
        context: [],
        mockData: null,
        isNew: false,
    },
    {
        id: 'header_config',
        name: 'Header Configuration Modal',
        path: 'src/components/Sidebar/HeaderConfiguration.jsx',
        purpose: 'Configure Primary + Secondary Masthead (header widgets).',
        props: null,
        state: null,
        context: ['useWidgetContext()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'request_queue',
        name: 'Request Queue Dashboard',
        path: 'src/components/Dashboard/RequestQueue.jsx',
        purpose: 'Checker approves/rejects submitted widget batches.',
        props: null,
        state: null,
        context: ['useAuth()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'manage_users',
        name: 'Manage Approval Users',
        path: 'src/components/AdminPanel/ManageApprovalUsers.jsx',
        purpose: 'Super admin adds/removes checker users.',
        props: null,
        state: null,
        context: ['useAuth()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'homepage_mapping',
        name: 'Homepage Mapping Dashboard',
        path: 'src/components/Dashboard/HomepageMappingDashboard.jsx',
        purpose: 'View all widgets from BigQuery database, scoped by current environment. Shows env badge (PROD/UAT).',
        props: ['onClose'],
        state: ['widgets', 'loading', 'searchQuery', 'sortKey', 'sortDir', 'currentPage'],
        context: [],
        dataSource: 'LocalApiService.getWidgets() — env-scoped via X-Optimus-Env header',
        isNew: false,
    },
    {
        id: 'widget_history',
        name: 'Widget History (Date-Based)',
        path: 'src/components/Dashboard/WidgetHistory.jsx',
        purpose: 'Browse submitted widgets grouped by request. Pick a date, see all submissions with their widgets. Load any widget to canvas for editing.',
        props: ['onClose'],
        state: ['date', 'requests', 'loading', 'previewId', 'expandedRequests'],
        context: ['useWidgetContext()'],
        dataSource: 'LocalApiService.getRequestsByDate(date) — date-filtered requests with requestWidgets',
        isNew: false,
        children: ['SnapshotPreview'],
    },
    {
        id: 'state_manager',
        name: 'State Manager Modal',
        path: 'src/components/AdminPanel/StateManagerModal.jsx',
        purpose: 'Manage states/cities for state-wise product mapping. Backend-persisted via Location model (BigQuery). Shared across team.',
        props: ['onClose'],
        state: ['search', 'locations', 'loading', 'toggling', 'showCustomForm', 'customForm', 'creating'],
        context: [],
        dataSource: 'LocalApiService.getLocations() — Location model in BigQuery DB',
        isNew: false,
    },
    {
        id: 'deploy_status',
        name: 'Deployment Status Panel',
        path: 'src/components/Dashboard/DeploymentStatusPanel.jsx',
        purpose: 'Show real-time deploy progress and per-widget results.',
        props: ['results', 'onClose', 'onRetry'],
        state: ['expandedLogs'],
        context: [],
        mockData: 'src/data/mockDeployResults.js',
        isNew: true,
    },
    {
        id: 'activity_log',
        name: 'Activity Log Panel',
        path: 'src/components/ActivityLogPanel.jsx',
        purpose: 'In-memory audit trail of all user actions.',
        props: null,
        state: null,
        context: ['useActivityLog()'],
        mockData: null,
        isNew: false,
    },
    {
        id: 'widget_comments',
        name: 'Widget Comments Panel',
        path: 'src/components/WidgetComments.jsx',
        purpose: 'Per-widget comment thread for maker/checker communication.',
        props: null,
        state: null,
        context: [],
        mockData: null,
        isNew: false,
    },
];

// ── Modal Configuration ──
// Screens that render as slide-in modals from MainLayout.
export const MODAL_CONFIG = {
    header_config: {
        slideFrom: 'left',
        gradient: 'from-purple-600 to-blue-600',
        stateKey: 'showHeaderConfig',
        width: 'w-[480px]',
    },
    request_queue: {
        slideFrom: 'right',
        gradient: null, // full screen overlay
        stateKey: 'showQueue',
        width: 'w-full',
    },
    manage_users: {
        slideFrom: 'right',
        gradient: 'from-amber-500 to-orange-500',
        stateKey: 'showManageUsers',
        width: 'w-[480px]',
    },
    homepage_mapping: {
        slideFrom: 'right',
        gradient: 'from-green-500 to-teal-500',
        stateKey: 'showMapping',
        width: 'w-[720px]',
    },
    widget_history: {
        slideFrom: 'right',
        gradient: 'from-indigo-600 to-violet-600',
        stateKey: 'showHistory',
        width: 'max-w-2xl',
    },
    state_manager: {
        slideFrom: 'center',
        gradient: null,
        stateKey: 'showStateManager',
        width: 'w-[600px]',
    },
    deploy_status: {
        slideFrom: 'right',
        gradient: 'from-blue-500 to-cyan-500',
        stateKey: 'showDeploy',
        width: 'w-[640px]',
    },
};

// ── Shared Modal Shell ──
// CSS classes for the modal backdrop + panel pattern used across all modals.
export const MODAL_SHELL = {
    backdrop: 'fixed inset-0 bg-black/50 z-40',
    panel: 'fixed inset-y-0 bg-white shadow-2xl z-50 flex flex-col',
    panelLeft: 'left-0',
    panelRight: 'right-0',
    header: 'px-6 py-4 text-white flex items-center justify-between',
    headerTitle: 'text-lg font-semibold',
    closeButton: 'p-1 hover:bg-white/20 rounded-lg transition-colors',
    body: 'flex-1 overflow-y-auto p-6',
    footer: 'px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3',
};

// ── Main Layout Header ──
// Buttons and controls in the top header bar.
export const HEADER_CONTROLS = {
    left: [
        { id: 'logo', component: 'Logo' },
        { id: 'env_badge', component: 'Badge', label: 'UAT', color: 'amber-500' },
        { id: 'os_switcher', component: 'PillSelector', options: ['iOS', 'Android'] },
        { id: 'undo', component: 'IconButton', icon: 'Undo2', tooltip: 'Undo' },
        { id: 'redo', component: 'IconButton', icon: 'Redo2', tooltip: 'Redo' },
    ],
    center: [
        { id: 'status_tabs', component: 'Tabs', tabs: ['Draft', 'Pending', 'Approved'], role: 'MAKER' },
    ],
    right: [
        { id: 'mapping', component: 'IconButton', icon: 'Map', tooltip: 'Homepage Mappings', stateKey: 'showMapping', isNew: true },
        { id: 'states', component: 'IconButton', icon: 'MapPin', tooltip: 'Manage States', stateKey: 'showStateManager' },
        { id: 'history', component: 'IconButton', icon: 'History', tooltip: 'Widget History', stateKey: 'showHistory' },
        { id: 'queue', component: 'IconButton', icon: 'ClipboardList', tooltip: 'Request Queue', stateKey: 'showQueue' },
        { id: 'users', component: 'IconButton', icon: 'Users', tooltip: 'Manage Users', stateKey: 'showManageUsers', role: 'SUPER_ADMIN' },
        { id: 'workflow_actions', component: 'WorkflowActions' },
        { id: 'user_profile', component: 'UserProfile' },
    ],
};

// ── Sidebar Layout ──
export const SIDEBAR_CONFIG = {
    defaultWidth: 420,
    minWidth: 280,
    maxWidth: 800,
    resizable: true,
    dragHandleClass: 'w-1 cursor-col-resize bg-slate-200 hover:bg-blue-400 transition-colors',
    sections: [
        { id: 'header_config_trigger', label: 'Configure Header', icon: 'Crown', position: 'top' },
        { id: 'widget_library', label: 'Widget Library', position: 'top' },
        { id: 'property_editor', label: 'Properties', position: 'below_library', condition: 'selectedWidget !== null' },
    ],
};

// ── Phone Frame ──
export const PHONE_FRAME_CONFIG = {
    width: 375,
    height: 812,
    scaleFactor: 0.85,
    chrome: {
        notch: true,
        homeButton: true,
        borderRadius: 'rounded-[2.5rem]',
        bezel: 'border-[8px] border-slate-800',
    },
    emptyState: {
        icon: 'Smartphone',
        title: 'Drag widgets here',
        description: 'Add widgets from the library to preview them',
    },
};

// ── Deploy Status Icons ──
// Status → icon + color mapping for DeploymentStatusPanel.
export const DEPLOY_STATUS_ICONS = {
    success: { icon: 'CheckCircle', color: 'text-green-500', bgColor: 'bg-green-50' },
    error: { icon: 'XCircle', color: 'text-red-500', bgColor: 'bg-red-50' },
    skipped: { icon: 'SkipForward', color: 'text-slate-400', bgColor: 'bg-slate-50' },
    pending: { icon: 'Circle', color: 'text-slate-300', bgColor: 'bg-slate-50' },
    deploying: { icon: 'Loader', color: 'text-blue-500', bgColor: 'bg-blue-50', animate: 'animate-spin' },
};

// ── Widget History (Date-Based) ──
export const WIDGET_HISTORY_CONFIG = {
    quickFilters: ['Today', 'Yesterday', 'This Week'],
    defaultDate: 'today',
    dataSource: 'GET /api/local/requests?date=YYYY-MM-DD',
    groupBy: 'request',  // Widgets grouped by their submission request
    requestCard: {
        showTime: true,           // Time displayed prominently on right side
        showSubmitter: true,      // Who submitted
        showWidgetCount: true,    // "4 Widgets" badge
        showStatus: true,         // APPROVED/PENDING/REJECTED badge
        expandable: true,         // Collapse/expand widget list
        autoExpand: true,         // All expanded by default
    },
    widgetCard: {
        showSlug: true,
        showType: true,
        showTitle: true,
        actions: ['Preview', 'Load to Canvas'],
    },
    loadToCanvas: {
        spreadsAllSnapshotFields: true,  // ...srcFields spread first — preserves stateProducts, background_media, etc.
        spreadsConfig: true,             // ...config spread second — for DB-format widgets where config is a JSON blob
        stripsTransientKeys: true,       // id, lastModified, lastModifiedBy stripped before spread (regenerated by addWidget)
        setsFromDB: true,                // _fromDB: true — bypasses addWidget page status guard
        setsFetched: true,               // _fetched: true
        editable: true,                  // Widget can be edited after loading (in DRAFT/REJECTED mode)
        submitApproveFlow: true,         // Standard maker-checker flow after editing
    },
};

// ── Homepage Mapping Table ──
export const MAPPING_TABLE_CONFIG = {
    columns: [
        { key: 'index', label: '#', width: 'w-10', sortable: false },
        { key: 'widget__slug_name', label: 'Widget Slug', width: 'min-w-[200px]', sortable: true },
        { key: 'widgetType', label: 'Type', width: 'w-20', sortable: true },
        { key: 'heading', label: 'Heading', width: 'min-w-[120px]', sortable: true },
        { key: 'level_tag', label: 'Level', width: 'w-16', sortable: true },
        { key: 'priority', label: 'Pri', width: 'w-12', sortable: true },
        { key: 'status', label: 'Status', width: 'w-16', sortable: true },
    ],
    pageSize: 20,
    statusBadge: {
        active: { label: 'Active', color: 'bg-green-100 text-green-700 border-green-200' },
        inactive: { label: 'Inactive', color: 'bg-slate-100 text-slate-500 border-slate-200' },
    },
    environmentPills: [
        { label: 'PROD', value: 'prod', color: 'bg-green-600' },
        { label: 'UAT', value: 'uat', color: 'bg-amber-500' },
    ],
};

// ── Component Interfaces (New Components) ──
// Props shape for all new components introduced in the design spec.
export const COMPONENT_INTERFACES = {
    ProductListInput: {
        props: ['label', 'value: string[]', 'onChange: (codes: string[]) => void', 'error', 'helperText', 'required', 'minItems', 'maxItems', 'itemValidator'],
        file: 'src/components/Inputs/ProductListInput.jsx',
    },
    SelectInput: {
        props: ['label', 'value', 'onChange', 'options: [{label, value, description?}]', 'error', 'helperText', 'required'],
        file: 'src/components/Inputs/SelectInput.jsx',
    },
    StateProductEditor: {
        props: ['label', 'value: {global: string, [state]: string}', 'onChange', 'helperText', 'error', 'required', 'disabled'],
        file: 'src/components/Inputs/StateProductEditor.jsx',
    },
    FilterEditor: {
        props: ['config: {widget, item, product}', 'value: object', 'onChange'],
        file: 'src/components/Editors/FilterEditor.jsx',
    },
    AppConfigEditor: {
        props: ['config: appConfigurations', 'value: object', 'onChange'],
        file: 'src/components/Editors/AppConfigEditor.jsx',
    },
    ScrollItemEditor: {
        props: ['label', 'value: ScrollItem[]', 'onChange', 'helperText', 'itemSchema'],
        file: 'src/components/Editors/ScrollItemEditor.jsx',
    },
    CategoryItemEditor: {
        props: ['label', 'value: CategoryItem[]', 'onChange', 'helperText', 'itemSchema'],
        file: 'src/components/Editors/CategoryItemEditor.jsx',
    },
    CarouselItemEditor: {
        props: ['label', 'value: CarouselItem[]', 'onChange', 'helperText', 'itemSchema'],
        file: 'src/components/Editors/CarouselItemEditor.jsx',
    },
    SubCategoryList: {
        props: ['items: SubCategory[]', 'onChange', 'itemSchema'],
        file: 'src/components/Editors/SubCategoryList.jsx',
    },
    HomepageMappingDashboard: {
        props: ['onClose'],
        file: 'src/components/Dashboard/HomepageMappingDashboard.jsx',
    },
    WidgetHistory: {
        props: ['onClose'],
        file: 'src/components/Dashboard/WidgetHistory.jsx',
        description: 'Date-based widget history panel. Fetches requests by date, groups widgets by submission. Load to Canvas spreads ALL snapshot fields first (...srcFields), then ...config for DB-format fallback.',
    },
    SnapshotPreview: {
        props: ['snapshot: object', 'label: string'],
        file: 'src/components/Dashboard/SnapshotPreview.jsx',
        description: 'Visual widget renderer from version snapshot. Uses same componentMap as WidgetRenderer. Wraps in stub WidgetContext.Provider.',
    },
    DeploymentStatusPanel: {
        props: ['results', 'onClose', 'onRetry'],
        file: 'src/components/Dashboard/DeploymentStatusPanel.jsx',
    },
    MapToPageModal: {
        props: ['slugs: { widget, slug, status }[]', 'onClose', 'onMapped'],
        file: 'src/components/Dashboard/MapToPageModal.jsx',
        description: 'Post-deploy Layer 2 mapping modal. Builds batch CSV and POSTs to update_layout_widget_mapping. Checker only.',
    },
};

// ── Mock Data Shapes ──
// Schema for mock data files used by new screens.
export const MOCK_DATA_SHAPES = {
    homepageMappings: {
        file: 'src/data/mockHomepageMappings.js',
        rowCount: 20,
        fields: ['id', 'widget_id', 'widget__slug_name', 'widgetType', 'heading', 'level_tag', 'level_property', 'priority', 'widget__start_time', 'widget__end_time', 'updated_at', 'widget__deactivated_flag'],
    },
    versionHistory: {
        file: 'src/data/mockVersionHistory.js',
        versionsPerWidget: 5,
        fields: ['version', 'timestamp', 'user', 'changeLog', 'snapshot'],
    },
    deployResults: {
        file: 'src/data/mockDeployResults.js',
        statuses: ['success', 'error', 'skipped', 'pending', 'deploying'],
        fields: ['widgetId', 'slug', 'name', 'status', 'message', 'log', 'error'],
    },
    products: {
        file: 'src/data/mockProducts.js',
        rowCount: 50,
        fields: ['item_code', 'name', 'mrp', 'sp', 'discount', 'category', 'sub_category', 'image', 'in_stock'],
    },
};

// ── Integration Points ──
// Which context/service each screen depends on.
export const INTEGRATION_POINTS = {
    LoginPage: { context: ['useAuth()'], service: 'Google OAuth' },
    MainLayout: { context: ['useAuth()', 'useWidgetContext()', 'useAppSettings()'], service: null },
    PropertyEditor: { context: ['useWidgetContext()'], service: 'WidgetRegistry, InputRegistry, ConfigValidator' },
    PhoneFrame: { context: ['useWidgetContext()'], service: 'DnD library' },
    RequestQueue: { context: ['useAuth()'], service: 'LocalApiService' },
    HomepageMappingDashboard: { context: [], service: 'LocalApiService.getWidgets() — env-scoped via X-Optimus-Env header' },
    WidgetHistory: { context: ['useWidgetContext()'], service: 'LocalApiService.getRequestsByDate() — date-filtered requests' },
    StateManagerModal: { context: [], service: 'LocalApiService.getLocations/toggleLocation/createLocation/deleteLocation — Location model in BigQuery' },
    LocationService: { context: [], service: 'fetchEffectiveStateDefinitions() / getEffectiveStateDefinitionsSync() / invalidateLocationCache()' },
    DeploymentStatusPanel: { context: [], service: 'Mock data (future: BackendSyncService)' },
    FilterEditor: { context: [], service: 'Widget config (filters)' },
    AppConfigEditor: { context: [], service: 'Widget config (appConfigurations)' },
};

// ── Related Files ──
export const RELATED_FILES = {
    wiki: 'wiki/DESIGN-SPEC-All-Screens.md',
    stepCreateWidget: 'src/config/Feature/stepCreateWidgetConfig.js',
    widgetRegistry: 'src/config/WidgetRegistry.js',
    inputRegistry: 'src/components/Inputs/InputRegistry.js',
};
