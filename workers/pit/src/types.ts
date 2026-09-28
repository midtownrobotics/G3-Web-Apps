export type AppEnv = {
  Bindings: {
    TBA_AUTH_KEY: string;
    NEXUS_API_KEY: string;
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
