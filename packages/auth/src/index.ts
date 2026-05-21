interface KvStore {
  get(key: string): Promise<string | null>;
}

export interface SessionEnv {
  SESSIONS: KvStore;
}

export async function verifySession(sessionId: string, env: SessionEnv): Promise<string | null> {
  // TODO: look up sessionId in env.SESSIONS, validate expiry, return userId or null
  void sessionId;
  void env;
  return null;
}
