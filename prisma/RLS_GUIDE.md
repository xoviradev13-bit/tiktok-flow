# Row Level Security (RLS) Configuration Guide

This directory contains the database-level Row Level Security (RLS) setup for the PostgreSQL database (Supabase / RDS / Direct Postgres) paired with Prisma ORM.

---

## 1. Why Row Level Security?

Row Level Security (RLS) enforces authorization at the database engine layer:
- **Defense in Depth**: Even if client keys (`anon` / `public`) are exposed, unauthorized users cannot read or modify data outside their scope.
- **OWASP Compliance**: Resolves OWASP A01 (Broken Access Control) and Supabase Security Advisor warnings across all 27 tables.
- **Fail-Safe Isolation**: Staff members can only view and update accounts assigned to them, while Team Leads and Admins retain full operational oversight.

---

## 2. Architecture Overview

### Helper Functions Defined
1. `public.current_app_user_id()`:
   Resolves the authenticated user ID from:
   - `request.jwt.claim.sub` (Supabase Auth JWT)
   - `request.jwt.claims ->> 'sub'` (Alternative Supabase JWT payload)
   - `current_setting('app.current_user_id', true)` (Prisma session context / transaction variable)
2. `public.is_admin_or_lead()`:
   Checks whether the current user is active (`deleted_at IS NULL`) with role `ADMIN` or `LEAD`.
3. `public.is_admin()`:
   Checks whether the current user has the `ADMIN` role.

### Role Hierarchy & Access Matrix
- **`postgres` & `service_role`**:
  Granted explicit full bypass via `service_role_full_access` and `postgres_full_access` policies. This ensures Next.js backend server queries via Prisma (`pg.Pool`) continue to execute with zero friction or query overhead.
- **`ADMIN` / `LEAD`**:
  Full access across fleet management, audit logs, team configurations, and system settings.
- **`STAFF`**:
  - `tiktok_accounts`: Only rows where `"assignedUserId" = current_app_user_id()`.
  - `daily_checklists` & items: Only user's own checklists.
  - `account_logs`, `alerts`, `revenues`, `analytics`: Strictly scoped to assigned accounts.
  - `extensions` & machines: Scoped to the user's bound machines and pairing codes.
- **`anon` / Public**:
  Deny-all by default across all tables.

---

## 3. How to Apply

### Option A: Via Command Line (Recommended)
Run the automated TypeScript migration script:
```bash
npm run db:rls
```
This script will:
1. Connect using `DIRECT_URL` (or `DATABASE_URL`) from your `.env`.
2. Execute [prisma/rls.sql](file:///c:/Users/datng/tiktok-automation/prisma/rls.sql) within a single atomic transaction.
3. Query `pg_tables` and print a verification report of all 27 tables.

### Option B: Via Supabase SQL Editor
1. Open your Supabase Project Dashboard -> **SQL Editor**.
2. Copy and paste the contents of [prisma/rls.sql](file:///c:/Users/datng/tiktok-automation/prisma/rls.sql).
3. Click **Run**.

---

## 4. Tables Protected (27 Tables)

| Model | Table Name | Key Protection Policy |
| :--- | :--- | :--- |
| `Account` | `oauth_accounts` | Own user only (`user_id`) |
| `Session` | `sessions` | Own user only (`user_id`) |
| `VerificationToken` | `verification_tokens` | Admin only |
| `Team` | `teams` | Admin/Lead manage; Member read |
| `User` | `users` | Admin/Lead manage; Member read team; Self update |
| `TiktokAccount` | `tiktok_accounts` | Admin/Lead all; Staff assigned only |
| `AccountLog` | `account_logs` | Admin/Lead all; Staff assigned account only |
| `AccountAssignmentHistory`| `account_assignment_histories` | Admin/Lead all; Staff own user_id only |
| `AccountAlert` | `account_alerts` | Admin/Lead all; Staff assigned account only |
| `DailyChecklist` | `daily_checklists` | Admin/Lead all; Staff own checklists only |
| `DailyChecklistItem` | `daily_checklist_items` | Admin/Lead all; Staff own checklists only |
| `DailyChecklistItemNote` | `daily_checklist_item_notes` | Admin/Lead all; Staff own notes only |
| `DailyRevenue` | `daily_revenues` | Admin/Lead all; Staff assigned account only |
| `AccountAnalytics` | `account_analytics` | Admin/Lead all; Staff assigned account only |
| `SystemConfig` | `system_configs` | Admin manage; Authenticated read |
| `Invitation` | `invitations` | Admin/Lead manage; Recipient read |
| `Extension` | `extensions` | Admin manage; Authenticated read active |
| `ExtensionInstallation` | `extension_installations` | Admin all; User own installations |
| `ExtensionRefreshToken` | `extension_refresh_tokens` | Admin all; User own tokens |
| `ExtensionPairingCode` | `extension_pairing_codes` | Admin all; User own codes |
| `ExtensionAuthEvent` | `extension_auth_events` | Admin all; User own events |
| `ExtensionAttestNonce` | `extension_attest_nonces` | Admin all; User own nonces |
| `MachineBindingLog` | `machine_binding_logs` | Admin all; User own logs |
| `MachineChangeRequest` | `machine_change_requests` | Admin/Lead all; User own requests |
| `ExtensionAccessRequest` | `extension_access_requests` | Admin/Lead all; User own requests |
| `SyncQueue` | `sync_queues` | Admin/Lead all; User own queues |
| `SystemAuditLog` | `system_audit_logs` | Admin only |
