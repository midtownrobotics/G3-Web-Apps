-- Add shortcut_url column for Slack workflow link trigger URLs
ALTER TABLE core_slack_link_codes ADD COLUMN shortcut_url TEXT;
