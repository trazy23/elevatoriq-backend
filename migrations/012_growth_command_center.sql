-- ElevatorIQ Growth Command Center
-- Web-based CEO dashboard for AI-agent work, approvals, prospects, campaigns, and queued actions.
-- Safe default: actions can be approved and queued; external sending requires backend env GROWTH_ACTIONS_ENABLED=true.

CREATE TABLE IF NOT EXISTS growth_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  lane TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'blocked', 'needs_review', 'paused', 'error')),
  current_work TEXT,
  last_output TEXT,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  market TEXT,
  buyer_type TEXT,
  decision_maker TEXT,
  title TEXT,
  email TEXT,
  linkedin_url TEXT,
  website_url TEXT,
  elevator_relevance TEXT,
  priority_score INTEGER DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
  status TEXT NOT NULL DEFAULT 'researched' CHECK (status IN ('researched', 'ready_for_approval', 'approved', 'queued', 'sent', 'replied', 'follow_up_due', 'uploaded', 'paid', 'not_fit', 'do_not_contact')),
  approval_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'needs_edits', 'rejected')),
  last_contacted_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  reply_summary TEXT,
  upload_count INTEGER NOT NULL DEFAULT 0,
  paid_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'linkedin', 'content', 'website', 'qa', 'other')),
  objective TEXT,
  subject TEXT,
  body TEXT,
  cta TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_approval', 'approved', 'queued', 'running', 'sent', 'paused', 'completed', 'needs_edits', 'rejected')),
  approval_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'needs_edits', 'rejected')),
  owner_agent_key TEXT REFERENCES growth_agents(key),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES growth_campaigns(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES growth_prospects(id) ON DELETE SET NULL,
  email TEXT,
  name TEXT,
  company TEXT,
  personalized_opening TEXT,
  final_subject TEXT,
  final_body TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_approval', 'approved', 'queued', 'sending', 'sent', 'failed', 'replied', 'do_not_send')),
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('prospect', 'campaign', 'recipient', 'content', 'website_change', 'qa_fix', 'other')),
  item_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  requested_by_agent_key TEXT REFERENCES growth_agents(key),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'needs_edits', 'rejected', 'executed', 'failed')),
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  action_type TEXT CHECK (action_type IN ('send_email', 'queue_campaign', 'mark_prospect_approved', 'post_content', 'deploy_change', 'none')),
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT REFERENCES growth_agents(key),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_growth_prospects_status ON growth_prospects(status, approval_status);
CREATE INDEX IF NOT EXISTS idx_growth_campaigns_status ON growth_campaigns(status, approval_status);
CREATE INDEX IF NOT EXISTS idx_growth_recipients_campaign ON growth_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_growth_approvals_status ON growth_approvals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_activity_created ON growth_activity_events(created_at DESC);

INSERT INTO growth_agents (key, name, lane, status, current_work)
VALUES
  ('site_qa_agent', 'Site QA Agent', 'Product QA', 'idle', 'Checks upload flow, preview quality, Stripe, reports, broken links, and conversion blockers.'),
  ('prospecting_agent', 'Prospecting Agent', 'Sales Research', 'idle', 'Builds qualified lists of property managers, facility directors, HOA/condo operators, and commercial owners.'),
  ('outreach_agent', 'Outreach Agent', 'Revenue Outreach', 'idle', 'Drafts approval-gated campaigns, follow-ups, and reply handling.'),
  ('content_agent', 'Content Agent', 'Authority Content', 'idle', 'Drafts faceless posts, FAQ additions, sample report explainers, and SEO content.'),
  ('product_intel_agent', 'Product Intelligence Agent', 'Product Feedback Loop', 'idle', 'Reviews uploads, report quality, objections, conversion signal, and Rulebook improvement ideas.'),
  ('scoreboard_agent', 'Scoreboard Agent', 'Executive Reporting', 'idle', 'Builds executive summaries, launch scoreboard, blockers, and CEO decisions needed.')
ON CONFLICT (key) DO NOTHING;
