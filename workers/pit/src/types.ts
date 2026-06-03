export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    TEAM_NUMBER: string;
    EVENT_KEY: string;
    TBA_AUTH_KEY: string;
    NEXUS_API_KEY: string;
    SESSIONS: KVNamespace;
    PIT_DB: D1Database;
    G3ID: Fetcher;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsAdmin: boolean;
    userEmail: string;
  };
};
