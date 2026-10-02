export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    G3ID: Fetcher;
    /** workers/edge, which runs part lookups on the shop's edge box. */
    EDGE: Fetcher;
    ORDERS_DB: D1Database;
    /** Approval DMs are skipped when unset. */
    SLACK_BOT_TOKEN?: string;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsMentor: boolean;
    /** The user's linked Slack account, if any. */
    userSlackId: string | null;
  };
};
