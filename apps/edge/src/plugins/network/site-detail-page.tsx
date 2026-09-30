import { Link, useParams } from "react-router-dom";
import { api, getErrorMessage } from "../../shared/api";
import { formatBytes, formatDayKey } from "../../shared/format";
import { Card, ErrorBanner, Loading, Page, Stat } from "../../shared/ui";
import { useLoad } from "../../shared/use-load";
import { BarChart, ChartLegend } from "./bar-chart";

export function SiteDetailPage() {
  const site = useParams().site ?? "";
  const { data, error } = useLoad(async () => {
    const res = await api.network.sites.site[":site"].$get({ param: { site } });
    if (!res.ok) throw new Error(await getErrorMessage(res));
    return res.json();
  }, [site]);

  const back = (
    <Link to="/network/sites" className="text-sm text-secondary-500 hover:text-secondary-900">
      ← All sites
    </Link>
  );
  if (error)
    return (
      <Page title={site} actions={back}>
        <ErrorBanner message={error} />
      </Page>
    );
  if (!data)
    return (
      <Page title={site} actions={back}>
        <Loading />
      </Page>
    );

  const total = data.clients.reduce((sum, c) => sum + c.dl + c.ul, 0);
  return (
    <Page title={site} actions={back}>
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="This cycle" value={formatBytes(total)} />
          <Stat label="Devices" value={data.clients.length} />
        </div>
      </Card>

      <Card title="Daily usage this cycle">
        <BarChart
          bars={data.daily.map((d) => ({
            label: formatDayKey(d.day),
            tick: String(Number(d.day.slice(8))),
            dl: d.dl,
            ul: d.ul,
          }))}
        />
        <ChartLegend />
      </Card>

      <Card title="Devices">
        <ul className="divide-y divide-secondary-100">
          {data.clients.map((c) => (
            <li key={c.mac} className="py-2 flex items-center justify-between gap-3">
              <Link
                to={`/network/clients/${encodeURIComponent(c.mac)}`}
                className="text-secondary-900 hover:text-primary-500 font-medium truncate"
              >
                {c.name}
              </Link>
              <span className="text-sm text-secondary-600 tabular-nums">
                {formatBytes(c.dl + c.ul)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
