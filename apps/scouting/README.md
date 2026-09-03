# @g3/scouting

Shared scouting and strategy workspace for G3 Robotics.

- Customizable, drag-and-drop tier lists
- Uploadable field maps with browser drawing tools and R2 storage
- Searchable autonomous routine library

The app runs on port 5182 and its worker runs on port 8792. Apply the worker's
local D1 migration before first use.

## Slack alerts

The scouting worker uses the same Slack bot token as G3ID for service-ticket
alerts. Configure it as a secret before deploy:

```bash
cd workers/scouting
wrangler secret put SLACK_BOT_TOKEN --env production
wrangler secret put TBA_AUTH_KEY --env production
```

Helpers must link Slack to G3ID so their Slack member ID can be resolved when an
admin approves them for the service crew.
