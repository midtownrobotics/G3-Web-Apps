export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    SESSIONS: KVNamespace;
    SHOP_DB: D1Database;
    G3ID: Fetcher;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsAdmin: boolean;
    userEmail: string;
  };
};
