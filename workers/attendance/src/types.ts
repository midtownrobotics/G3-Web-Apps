export type AppEnv = {
  Bindings: {
    FRONTEND_URL: string;
    FIREBASE_PROJECT_ID: string;
    FIREBASE_CLIENT_EMAIL: string;
    FIREBASE_PRIVATE_KEY: string;
    G3ID: Fetcher;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userEmail: string;
    userIsAdmin: boolean;
  };
};
