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
    SLACK_BOT_TOKEN: string;
    SLACK_SIGNING_SECRET: string;
    PRINT_TOKEN: string;
    DRAWINGS: R2Bucket;
    BOM_QUEUE: Queue;
  };
  Variables: {
    userId: string;
    userDisplayName: string;
    userIsAdmin: boolean;
    userEmail: string;
    sessionType: "oauth" | "pin";
    kioskDeviceId: number | null;
    kioskDeviceName: string | null;
  };
};
