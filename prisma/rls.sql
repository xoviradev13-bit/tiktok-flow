-- ==============================================================================
-- TikTok Operations & Automation System - PostgreSQL Row Level Security (RLS)
-- File: prisma/rls.sql
-- Description: Enables RLS on all 27 tables and defines least-privilege policies.
-- Safe to re-run: Idempotent script with DROP POLICY IF EXISTS.
-- ==============================================================================

-- 1. Helper Functions
-- ------------------------------------------------------------------------------
-- Resolves the current user ID whether connecting via Supabase JWT or custom session variable
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Resolves if the active user is an ADMIN or LEAD
CREATE OR REPLACE FUNCTION public.is_admin_or_lead()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = public.current_app_user_id() 
      AND role IN ('ADMIN', 'LEAD')
      AND (deleted_at IS NULL)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Resolves if the active user is an ADMIN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = public.current_app_user_id() 
      AND role = 'ADMIN'
      AND (deleted_at IS NULL)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 2. Enable Row Level Security (RLS) on all 27 tables
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.oauth_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tiktok_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_assignment_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_checklist_item_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extension_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extension_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extension_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extension_auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extension_attest_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.machine_binding_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.machine_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extension_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_audit_logs ENABLE ROW LEVEL SECURITY;


-- 3. Service Role & Postgres Bypass Policies (Guarantees Prisma backend queries work)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'oauth_accounts', 'sessions', 'verification_tokens', 'teams', 'users',
    'tiktok_accounts', 'account_logs', 'account_assignment_histories', 'account_alerts',
    'daily_checklists', 'daily_checklist_items', 'daily_checklist_item_notes',
    'daily_revenues', 'account_analytics', 'system_configs', 'invitations',
    'extensions', 'extension_installations', 'extension_refresh_tokens',
    'extension_pairing_codes', 'extension_auth_events', 'extension_attest_nonces',
    'machine_binding_logs', 'machine_change_requests', 'extension_access_requests',
    'sync_queues', 'system_audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Service role bypass (Supabase backend / serverless tasks)
    EXECUTE format('DROP POLICY IF EXISTS service_role_full_access ON public.%I', tbl);
    EXECUTE format('CREATE POLICY service_role_full_access ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
    
    -- Postgres role bypass (direct Prisma connection pooler / node-pg)
    EXECUTE format('DROP POLICY IF EXISTS postgres_full_access ON public.%I', tbl);
    EXECUTE format('CREATE POLICY postgres_full_access ON public.%I FOR ALL TO postgres USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;


-- 4. Granular User / Team / Role Policies
-- ------------------------------------------------------------------------------

-- 4.1 USERS
DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (public.is_admin_or_lead())
  WITH CHECK (public.is_admin_or_lead());

DROP POLICY IF EXISTS users_read_self_and_team ON public.users;
CREATE POLICY users_read_self_and_team ON public.users
  FOR SELECT TO authenticated
  USING (
    id = public.current_app_user_id()
    OR team_id IN (
      SELECT u.team_id FROM public.users u WHERE u.id = public.current_app_user_id() AND u.team_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());


-- 4.2 TEAMS
DROP POLICY IF EXISTS teams_admin_all ON public.teams;
CREATE POLICY teams_admin_all ON public.teams
  FOR ALL TO authenticated
  USING (public.is_admin_or_lead())
  WITH CHECK (public.is_admin_or_lead());

DROP POLICY IF EXISTS teams_member_read ON public.teams;
CREATE POLICY teams_member_read ON public.teams
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT u.team_id FROM public.users u WHERE u.id = public.current_app_user_id()
    )
  );


-- 4.3 TIKTOK ACCOUNTS
DROP POLICY IF EXISTS tiktok_accounts_admin_all ON public.tiktok_accounts;
CREATE POLICY tiktok_accounts_admin_all ON public.tiktok_accounts
  FOR ALL TO authenticated
  USING (public.is_admin_or_lead())
  WITH CHECK (public.is_admin_or_lead());

DROP POLICY IF EXISTS tiktok_accounts_staff_access ON public.tiktok_accounts;
CREATE POLICY tiktok_accounts_staff_access ON public.tiktok_accounts
  FOR ALL TO authenticated
  USING (
    "assignedUserId" = public.current_app_user_id()
    AND (deleted_at IS NULL)
  )
  WITH CHECK (
    "assignedUserId" = public.current_app_user_id()
  );


-- 4.4 ACCOUNT LOGS & ALERTS
DROP POLICY IF EXISTS account_logs_access ON public.account_logs;
CREATE POLICY account_logs_access ON public.account_logs
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR EXISTS (
      SELECT 1 FROM public.tiktok_accounts a
      WHERE a.id = "accountId" AND a."assignedUserId" = public.current_app_user_id()
    )
  );

DROP POLICY IF EXISTS account_alerts_access ON public.account_alerts;
CREATE POLICY account_alerts_access ON public.account_alerts
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR EXISTS (
      SELECT 1 FROM public.tiktok_accounts a
      WHERE a.id = "accountId" AND a."assignedUserId" = public.current_app_user_id()
    )
  );


-- 4.5 ACCOUNT ASSIGNMENT HISTORIES
DROP POLICY IF EXISTS account_histories_access ON public.account_assignment_histories;
CREATE POLICY account_histories_access ON public.account_assignment_histories
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_lead()
    OR user_id = public.current_app_user_id()
  );


-- 4.6 DAILY REVENUES & ANALYTICS
DROP POLICY IF EXISTS daily_revenues_access ON public.daily_revenues;
CREATE POLICY daily_revenues_access ON public.daily_revenues
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR EXISTS (
      SELECT 1 FROM public.tiktok_accounts a
      WHERE a.id = "accountId" AND a."assignedUserId" = public.current_app_user_id()
    )
  );

DROP POLICY IF EXISTS account_analytics_access ON public.account_analytics;
CREATE POLICY account_analytics_access ON public.account_analytics
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR EXISTS (
      SELECT 1 FROM public.tiktok_accounts a
      WHERE a.id = "accountId" AND a."assignedUserId" = public.current_app_user_id()
    )
  );


-- 4.7 DAILY CHECKLISTS & ITEMS
DROP POLICY IF EXISTS daily_checklists_access ON public.daily_checklists;
CREATE POLICY daily_checklists_access ON public.daily_checklists
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR "userId" = public.current_app_user_id()
  )
  WITH CHECK (
    public.is_admin_or_lead()
    OR "userId" = public.current_app_user_id()
  );

DROP POLICY IF EXISTS daily_checklist_items_access ON public.daily_checklist_items;
CREATE POLICY daily_checklist_items_access ON public.daily_checklist_items
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR EXISTS (
      SELECT 1 FROM public.daily_checklists c
      WHERE c.id = "checklistId" AND c."userId" = public.current_app_user_id()
    )
  )
  WITH CHECK (
    public.is_admin_or_lead()
    OR EXISTS (
      SELECT 1 FROM public.daily_checklists c
      WHERE c.id = "checklistId" AND c."userId" = public.current_app_user_id()
    )
  );

DROP POLICY IF EXISTS daily_checklist_item_notes_access ON public.daily_checklist_item_notes;
CREATE POLICY daily_checklist_item_notes_access ON public.daily_checklist_item_notes
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_lead()
    OR user_id = public.current_app_user_id()
  )
  WITH CHECK (
    user_id = public.current_app_user_id()
  );


-- 4.8 NEXTAUTH SESSIONS & ACCOUNTS
DROP POLICY IF EXISTS oauth_accounts_access ON public.oauth_accounts;
CREATE POLICY oauth_accounts_access ON public.oauth_accounts
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS sessions_access ON public.sessions;
CREATE POLICY sessions_access ON public.sessions
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS verification_tokens_admin_only ON public.verification_tokens;
CREATE POLICY verification_tokens_admin_only ON public.verification_tokens
  FOR ALL TO authenticated
  USING (public.is_admin());


-- 4.9 INVITATIONS
DROP POLICY IF EXISTS invitations_admin_all ON public.invitations;
CREATE POLICY invitations_admin_all ON public.invitations
  FOR ALL TO authenticated
  USING (public.is_admin_or_lead())
  WITH CHECK (public.is_admin_or_lead());

DROP POLICY IF EXISTS invitations_recipient_read ON public.invitations;
CREATE POLICY invitations_recipient_read ON public.invitations
  FOR SELECT TO authenticated
  USING (
    email = (SELECT email FROM public.users WHERE id = public.current_app_user_id())
  );


-- 4.10 EXTENSIONS & USER MACHINES
DROP POLICY IF EXISTS extensions_read_active ON public.extensions;
CREATE POLICY extensions_read_active ON public.extensions
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS extensions_admin_write ON public.extensions;
CREATE POLICY extensions_admin_write ON public.extensions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS extension_installations_user ON public.extension_installations;
CREATE POLICY extension_installations_user ON public.extension_installations
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS extension_refresh_tokens_user ON public.extension_refresh_tokens;
CREATE POLICY extension_refresh_tokens_user ON public.extension_refresh_tokens
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS extension_pairing_codes_user ON public.extension_pairing_codes;
CREATE POLICY extension_pairing_codes_user ON public.extension_pairing_codes
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS extension_auth_events_user ON public.extension_auth_events;
CREATE POLICY extension_auth_events_user ON public.extension_auth_events
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS extension_attest_nonces_user ON public.extension_attest_nonces;
CREATE POLICY extension_attest_nonces_user ON public.extension_attest_nonces
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS machine_binding_logs_user ON public.machine_binding_logs;
CREATE POLICY machine_binding_logs_user ON public.machine_binding_logs
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin());

DROP POLICY IF EXISTS machine_change_requests_user ON public.machine_change_requests;
CREATE POLICY machine_change_requests_user ON public.machine_change_requests
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin_or_lead())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin_or_lead());

DROP POLICY IF EXISTS extension_access_requests_user ON public.extension_access_requests;
CREATE POLICY extension_access_requests_user ON public.extension_access_requests
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id() OR public.is_admin_or_lead())
  WITH CHECK (user_id = public.current_app_user_id() OR public.is_admin_or_lead());


-- 4.11 SYNC QUEUES
DROP POLICY IF EXISTS sync_queues_access ON public.sync_queues;
CREATE POLICY sync_queues_access ON public.sync_queues
  FOR ALL TO authenticated
  USING (requested_by_id = public.current_app_user_id() OR public.is_admin_or_lead())
  WITH CHECK (requested_by_id = public.current_app_user_id() OR public.is_admin_or_lead());


-- 4.12 SYSTEM CONFIGS & SYSTEM AUDIT LOGS
DROP POLICY IF EXISTS system_configs_admin_write ON public.system_configs;
CREATE POLICY system_configs_admin_write ON public.system_configs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS system_configs_authenticated_read ON public.system_configs;
CREATE POLICY system_configs_authenticated_read ON public.system_configs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS system_audit_logs_admin_only ON public.system_audit_logs;
CREATE POLICY system_audit_logs_admin_only ON public.system_audit_logs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
