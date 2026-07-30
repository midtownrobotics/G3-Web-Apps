-- Create admin_settings table for storing configuration
CREATE TABLE "admin_settings" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" text NOT NULL,
  "updated_at" integer NOT NULL
);

-- Insert default Slack channel ID setting
INSERT INTO "admin_settings" ("key", "value", "updated_at") VALUES ('slack_release_channel_id', 'C09QYMTSGKT', strftime('%s', 'now'));
