export type AppEnv = {
  Bindings: {
    SKILL_DB: D1Database;
    G3ID: Fetcher;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsAdmin: boolean;
    userIsMentor: boolean;
    userEmail: string;
    sessionType: "oauth" | "pin";
  };
};
