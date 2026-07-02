export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    SESSIONS: KVNamespace;
    SHOP_DB: D1Database;
    G3ID: Fetcher;
    ONSHAPE_API_KEY: string;
    ONSHAPE_API_SECRET: string;
    ONSHAPE_COMPANY_ID: string;
    ONSHAPE_WEBHOOK_KEY_PRIMARY: string;
    ONSHAPE_WEBHOOK_KEY_SECONDARY: string;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsAdmin: boolean;
    userEmail: string;
  };
};
