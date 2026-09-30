import { api, getErrorMessage } from "../../shared/api";
import { formatAgo, formatDateTime, formatDuration } from "../../shared/format";
import { Card, ErrorBanner, Loading, Page, Stat } from "../../shared/ui";
import { useLoad } from "../../shared/use-load";

async function loadStatus() {
  const res = await api.status.$get();
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export function StatusPage() {
  const { data, error } = useLoad(loadStatus, []);
  if (error)
    return (
      <Page title="Edge Box">
        <ErrorBanner message={error} />
      </Page>
    );
  if (!data)
    return (
      <Page title="Edge Box">
        <Loading />
      </Page>
    );

  const { agent, now } = data;
  return (
    <Page title="Edge Box">
      <Card>
        {agent ? (
          <>
            <p className="flex items-center gap-2 font-medium text-secondary-900">
              <span
                className={`w-2.5 h-2.5 rounded-full ${agent.online ? "bg-emerald-500" : "bg-secondary-300"}`}
                aria-hidden
              />
              The edge box is {agent.online ? "online" : "offline"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
              <Stat
                label="Last contact"
                value={formatAgo(agent.lastSeenAt, now)}
                hint={formatDateTime(agent.lastSeenAt)}
              />
              <Stat label="Agent version" value={agent.version} />
              <Stat
                label="Agent uptime"
                value={formatDuration(now - agent.startedAt)}
                hint={`since ${formatDateTime(agent.startedAt)}`}
              />
            </div>
            {!agent.online && (
              <p className="text-sm text-secondary-500 mt-4">
                The box keeps routing while offline and uploads buffered usage when it reconnects.
              </p>
            )}
          </>
        ) : (
          <p className="text-secondary-500">The agent hasn't checked in yet.</p>
        )}
      </Card>
    </Page>
  );
}
