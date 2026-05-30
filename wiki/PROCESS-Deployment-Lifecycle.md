# Deployment Workflows

## Deployment URL

**Vercel:** `optimus-flame-eight.vercel.app` (single production URL)

---

## Standard Workflow (Maker-Checker)

1.  **Drafting (Maker)**
    *   User builds the layout in the React App.
    *   State is local (in-memory).
2.  **Submission**
    *   User clicks "Submit for Approval".
    *   `LocalApiService.createRequest()` serializes the layout to JSON and sends it to the Express backend (`POST /api/local/requests`), which creates Widget + Request + RequestWidget records in **BigQuery** (`apna-mart-data.optimus`).
    *   Status: `PENDING`.
3.  **Review (Checker)**
    *   Checker reviews the queued request in the App's Dashboard.
    *   If valid, Checker clicks "Approve".
    *   **Auto-deploy:** Approve automatically triggers deploy for CHECKER — no separate Deploy step needed.
4.  **Deployment**
    *   `BackendSyncService` makes authenticated calls to the production Django API to create/update widgets and pages.
    *   Status: `APPROVED` → `DEPLOYED`.
    *   Credentials: `satyam.gupta@apnamart.in` / `Docherry@123` (PROD)

## Direct Sync (Bypass)

For trusted admins, **BackendSyncService** allows direct deployment from the UI. Super Admins' submissions are **auto-approved** (no PENDING step).

| Feature | Standard Workflow | Direct Sync |
| :--- | :--- | :--- |
| **Speed** | Slower (Async) | Instant |
| **Safety** | High (Review Required) | Low (No Review) |
| **Audit** | Full BigQuery Log | BigQuery Log (fire-and-forget) |
| **Use Case** | Marketing Campaigns | Super Admin / Hotfixes |
