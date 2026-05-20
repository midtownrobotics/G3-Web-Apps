export type AppEnv = {
  Bindings: {
    DB: D1Database;
    SESSIONS: KVNamespace;
    RATE_LIMIT: KVNamespace;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_REDIRECT_URI: string;
  };
  Variables: {
    userId: string;
  };
};
