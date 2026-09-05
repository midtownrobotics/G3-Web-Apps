-- Add trigger_id column to store Slack workflow trigger IDs for link-based logins
ALTER TABLE core_slack_link_codes ADD COLUMN trigger_id TEXT;
