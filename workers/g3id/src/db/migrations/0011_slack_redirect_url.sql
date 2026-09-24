-- Add redirect_url to track where users should be redirected after Slack auth
ALTER TABLE core_slack_link_codes ADD COLUMN redirect_url TEXT;
