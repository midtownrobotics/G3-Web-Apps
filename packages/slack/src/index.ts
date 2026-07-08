export type SlackBindings = {
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
};

export async function sendDM(
  slackUserId: string,
  message: string,
  env: SlackBindings,
) {
  await sendMessage(slackUserId, message, env);
}

export async function sendMessage(
  channel: string,
  message: string,
  env: SlackBindings,
): Promise<void> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text: message }),
  });

  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) {
    console.error("[Slack API Error]", { channel, message, error: data.error });
    throw new Error(`Slack API error: ${data.error}`);
  }
}

export async function getUserInfo(
  slackUserId: string,
  env: SlackBindings,
): Promise<{ email: string | null; displayName: string }> {
  const res = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  const data = (await res.json()) as {
    ok: boolean;
    user?: { real_name?: string; profile?: { email?: string; real_name?: string } };
  };
  if (!data.ok || !data.user) return { email: null, displayName: "Unknown" };
  return {
    email: data.user.profile?.email ?? null,
    displayName: data.user.profile?.real_name ?? data.user.real_name ?? "Unknown",
  };
}

export async function verifySlackSignature(
  request: Request,
  rawBody: string,
  env: SlackBindings,
): Promise<boolean> {
  const signature = request.headers.get("X-Slack-Signature");
  const timestamp = request.headers.get("X-Slack-Request-Timestamp");
  if (!signature || !timestamp) return false;

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number.parseInt(timestamp, 10)) > 300) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sigBase));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `v0=${hex}`;

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
