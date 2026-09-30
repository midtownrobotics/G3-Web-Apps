export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    EDGE_DB: D1Database;
    G3ID: Fetcher;
    EDGE_AGENT_KEY: string;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsAdmin: boolean;
  };
};

/** Pseudo-client key for total WAN bytes (what the carrier bills). */
export const WAN_KEY = "_wan";
