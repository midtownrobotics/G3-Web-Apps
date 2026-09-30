-- Slack channel for the admin "daily rundown" message (#engineering by default; editable in admin).
INSERT OR IGNORE INTO "admin_settings" ("key", "value", "updated_at")
VALUES ('slack_summary_channel_id', 'C1709CVEF', strftime('%s', 'now'));
