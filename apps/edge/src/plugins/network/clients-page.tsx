import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../../shared/api";
import { formatAgo, formatBytes } from "../../shared/format";
import { Card, ErrorBanner, Loading, Page } from "../../shared/ui";
import { useLoad } from "../../shared/use-load";

async function loadClients() {
  const res = await api.network.clients.$get();
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json();
}

export function ClientsPage() {
  const { data, error } = useLoad(loadClients, []);
  if (error)
    return (
      <Page title="Clients">
        <ErrorBanner message={error} />
      </Page>
    );
  if (!data)
    return (
      <Page title="Clients">
        <Loading />
      </Page>
    );

  const clients = [...data.clients].sort(
    (a, b) => b.cycle.dl + b.cycle.ul - (a.cycle.dl + a.cycle.ul),
  );

  return (
    <Page title="Clients">
      <Card className="p-0! overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-widest text-secondary-400">
            <tr className="border-b border-secondary-200">
              <th className="px-4 py-3 font-bold w-8">#</th>
              <th className="px-4 py-3 font-bold">Device</th>
              <th className="px-4 py-3 font-bold text-right">This cycle</th>
              <th className="px-4 py-3 font-bold text-right">Last 24h</th>
              <th className="px-4 py-3 font-bold text-right">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary-100">
            {clients.map((c, i) => (
              <tr key={c.mac} className="hover:bg-secondary-50">
                <td className="px-4 py-2.5 text-secondary-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <Link
                    to={`/network/clients/${encodeURIComponent(c.mac)}`}
                    className="font-medium text-secondary-900 hover:text-primary-500"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-secondary-400">
                    {c.hostname && c.displayName ? `${c.hostname} · ` : ""}
                    {c.lastIp ?? c.mac}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {formatBytes(c.cycle.dl + c.cycle.ul)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-secondary-600">
                  {formatBytes(c.last24h.dl + c.last24h.ul)}
                </td>
                <td className="px-4 py-2.5 text-right text-secondary-500 whitespace-nowrap">
                  {formatAgo(c.lastSeenAt)}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-secondary-400">
                  No clients seen yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
