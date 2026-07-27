export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    LOCAL_AUTH_BYPASS?: string;
    SCOUTING_DB: D1Database;
    FIELD_MAPS: R2Bucket;
    G3ID: Fetcher;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userEmail: string;
    userIsAdmin: boolean;
  };
};
