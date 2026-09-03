import { Map as MapIcon, Scale, Search, Trash2 } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import type { ScoutingField } from "./ScoutingForms";
import { API_URL, api } from "./api";

type Report = {
  id: string;
  teamName: string;
  formName: string;
  fields: ScoutingField[];
  answers: Record<string, unknown>;
  drawings: Record<string, string>;
  submittedByName: string;
  createdAt: number;
  eventKey?: string;
  matchKey?: string;
  matchNumber?: number;
};
type ServiceTicket = {
  id: string;
  team_name: string;
  issue_type: string;
  description: string;
  status: string;
  resolution?: string;
  created_by_name: string;
  claimed_by_name?: string;
  match_number?: number;
  updated_at: number;
};
type TeamMatch = {
  key: string;
  label: string;
  scheduledAt: number | null;
  alliance: "red" | "blue";
  redTeams: string[];
  blueTeams: string[];
  redScore: number;
  blueScore: number;
  relationTo1648: "with" | "against" | "none";
  played: boolean;
};

export function Analysis() {
  const [team, setTeam] = useState("");
  const [searched, setSearched] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [teamB, setTeamB] = useState("");
  const [reportsB, setReportsB] = useState<Report[]>([]);
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>([]);
  const [teamMatches, setTeamMatches] = useState<TeamMatch[]>([]);
  const [tab, setTab] = useState<"stats" | "matches" | "service" | "auto" | "compare">("stats");

  async function search(event: SyntheticEvent) {
    event.preventDefault();
    const result = await api<{
      reports: Report[];
      serviceTickets: ServiceTicket[];
      teamMatches: TeamMatch[];
    }>(
      `/analysis?team=${encodeURIComponent(team)}${tab === "compare" ? `&teamB=${encodeURIComponent(teamB)}` : ""}`,
    );
    setReports(
      result.reports.filter((report) => report.teamName.toLowerCase() === team.toLowerCase()),
    );
    setSearched(team);
    setServiceTickets(result.serviceTickets.filter((ticket) => ticket.team_name === team));
    setTeamMatches(result.teamMatches);
    setReportsB(
      tab === "compare"
        ? result.reports.filter((report) => report.teamName.toLowerCase() === teamB.toLowerCase())
        : [],
    );
  }

  async function removeReport(report: Report) {
    const confirmed = window.confirm(
      `Permanently delete this ${report.formName} report for team ${report.teamName}? This cannot be undone.`,
    );
    if (!confirmed) return;
    await api(`/analysis/reports/${report.id}`, { method: "DELETE" });
    setReports((current) => current.filter((item) => item.id !== report.id));
    setReportsB((current) => current.filter((item) => item.id !== report.id));
  }

  function numericSummary(items: Report[]) {
    const values = new Map<string, number[]>();
    for (const report of items) {
      for (const field of report.fields) {
        const value = report.answers[field.id];
        if ((field.type === "counter" || field.type === "slider") && typeof value === "number") {
          values.set(field.label, [...(values.get(field.label) ?? []), value]);
        }
      }
    }
    return new Map(
      [...values].map(([label, samples]) => [
        label,
        samples.reduce((sum, value) => sum + value, 0) / samples.length,
      ]),
    );
  }

  const summaryA = numericSummary(reports);
  const summaryB = numericSummary(reportsB);
  const comparisonLabels = [...new Set([...summaryA.keys(), ...summaryB.keys()])];

  const autoFields = reports.flatMap((report) =>
    report.fields
      .filter((field) => field.type === "fieldMap" && report.drawings[field.id])
      .map((field) => ({ report, field, url: report.drawings[field.id] })),
  );

  return (
    <section className="page analysis-page">
      <div className="page-heading">
        <div>
          <h1>Command Center</h1>
        </div>
      </div>
      <form className="analysis-search" onSubmit={search}>
        <Search size={19} />
        <input
          required
          inputMode="numeric"
          pattern="[0-9]+"
          value={team}
          onChange={(event) => setTeam(event.target.value)}
          placeholder={tab === "compare" ? "Team A number" : "Team number"}
        />
        {tab === "compare" && (
          <>
            <Scale size={18} />
            <input
              required
              inputMode="numeric"
              pattern="[0-9]+"
              value={teamB}
              onChange={(event) => setTeamB(event.target.value)}
              placeholder="Team B number"
            />
          </>
        )}
        <button type="submit" className="primary-button">
          Search
        </button>
      </form>
      <div className="analysis-tabs">
        <button
          type="button"
          className={tab === "matches" ? "active" : ""}
          onClick={() => setTab("matches")}
        >
          Matches
        </button>
        <button
          type="button"
          className={tab === "service" ? "active" : ""}
          onClick={() => setTab("service")}
        >
          Service
        </button>
        <button
          type="button"
          className={tab === "stats" ? "active" : ""}
          onClick={() => setTab("stats")}
        >
          Stats
        </button>
        <button
          type="button"
          className={tab === "auto" ? "active" : ""}
          onClick={() => setTab("auto")}
        >
          Auto path
        </button>
        <button
          type="button"
          className={tab === "compare" ? "active" : ""}
          onClick={() => setTab("compare")}
        >
          Compare
        </button>
      </div>
      {tab === "stats" && searched && !reports.length && (
        <div className="forms-empty">No reports found for {searched}.</div>
      )}
      {tab === "stats" ? (
        <div className="analysis-results-stack">
          <div className="analysis-reports">
            {reports.map((report) => (
              <article key={report.id}>
                <header>
                  <div>
                    <strong>{report.formName}</strong>
                    <span>{report.submittedByName}</span>
                    {report.matchNumber && <span>Match {report.matchNumber}</span>}
                  </div>
                  <time>{new Date(report.createdAt).toLocaleString()}</time>
                  <button
                    type="button"
                    className="delete-report-button"
                    onClick={() => removeReport(report)}
                    aria-label={`Delete report for ${report.teamName}`}
                  >
                    <Trash2 size={16} /> Remove bad data
                  </button>
                </header>
                <dl>
                  {report.fields
                    .filter((field) => field.type !== "fieldMap")
                    .map((field) => (
                      <div key={field.id}>
                        <dt>{field.label}</dt>
                        <dd>
                          {Array.isArray(report.answers[field.id])
                            ? (report.answers[field.id] as unknown[]).join(", ")
                            : String(report.answers[field.id] ?? "—")}
                        </dd>
                      </div>
                    ))}
                </dl>
              </article>
            ))}
          </div>
        </div>
      ) : tab === "matches" ? (
        <div className="match-history">
          {teamMatches.map((match) => (
            <article key={match.key} className={match.relationTo1648 !== "none" ? "g3-match" : ""}>
              <header>
                <strong>{match.label}</strong>
                {match.relationTo1648 !== "none" && (
                  <span>Played {match.relationTo1648} Team 1648</span>
                )}
              </header>
              <div className="match-score">
                <span className={match.alliance === "red" ? "searched-alliance" : ""}>
                  Red: {match.redTeams.join(", ")}
                  <b>{match.played ? match.redScore : "—"}</b>
                </span>
                <span className={match.alliance === "blue" ? "searched-alliance" : ""}>
                  Blue: {match.blueTeams.join(", ")}
                  <b>{match.played ? match.blueScore : "—"}</b>
                </span>
              </div>
              {match.scheduledAt && <time>{new Date(match.scheduledAt).toLocaleString()}</time>}
            </article>
          ))}
          {searched && !teamMatches.length && (
            <div className="forms-empty">No TBA matches found.</div>
          )}
        </div>
      ) : tab === "service" ? (
        <section className="service-history">
          <div>
            {serviceTickets.map((ticket) => (
              <article key={ticket.id}>
                <header>
                  <strong>{ticket.issue_type}</strong>
                  <span>{ticket.status}</span>
                </header>
                <p>{ticket.description || "No issue description."}</p>
                {ticket.resolution && (
                  <p>
                    <b>Resolution:</b> {ticket.resolution}
                  </p>
                )}
                <small>
                  Reported by {ticket.created_by_name}
                  {ticket.claimed_by_name ? ` · Helped by ${ticket.claimed_by_name}` : ""}
                  {ticket.match_number ? ` · Match ${ticket.match_number}` : ""}
                  {` · ${new Date(ticket.updated_at).toLocaleString()}`}
                </small>
              </article>
            ))}
          </div>
          {searched && !serviceTickets.length && (
            <div className="forms-empty">No service history found.</div>
          )}
        </section>
      ) : tab === "auto" ? (
        <div className="auto-path-grid">
          {autoFields.map(({ report, field, url }) => (
            <article key={`${report.id}-${field.id}`}>
              <img src={`${API_URL}${url}`} alt={`${report.teamName} ${field.label}`} />
              <div>
                <MapIcon size={16} />
                <strong>{field.label}</strong>
                <span>
                  {report.formName} · {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>
              <button
                type="button"
                className="delete-report-button"
                onClick={() => removeReport(report)}
              >
                <Trash2 size={15} /> Remove report
              </button>
            </article>
          ))}
          {searched && !autoFields.length && (
            <div className="forms-empty">No autonomous paths reported for {searched}.</div>
          )}
        </div>
      ) : (
        <div className="team-comparison">
          {searched && teamB && (
            <div className="comparison-scoreboard">
              <div>
                <span>Team A</span>
                <strong>{searched}</strong>
                <small>{reports.length} reports</small>
              </div>
              <Scale size={28} />
              <div>
                <span>Team B</span>
                <strong>{teamB}</strong>
                <small>{reportsB.length} reports</small>
              </div>
            </div>
          )}
          {comparisonLabels.map((label) => {
            const left = summaryA.get(label);
            const right = summaryB.get(label);
            const winner =
              left === undefined || right === undefined || left === right
                ? "tie"
                : left > right
                  ? "left"
                  : "right";
            return (
              <div className="comparison-row" key={label}>
                <strong className={winner === "left" ? "winner" : ""}>
                  {left?.toFixed(1) ?? "—"}
                </strong>
                <span>
                  {label}
                  <small>average reported value</small>
                </span>
                <strong className={winner === "right" ? "winner" : ""}>
                  {right?.toFixed(1) ?? "—"}
                </strong>
              </div>
            );
          })}
          {searched && !comparisonLabels.length && (
            <div className="forms-empty">No comparable slider or counter data was found.</div>
          )}
        </div>
      )}
    </section>
  );
}
