import { Map as MapIcon, Scale, Search, Star, Trash2 } from "lucide-react";
import { type SyntheticEvent, useEffect, useState } from "react";
import type { ScoutingField } from "./ScoutingForms";
import { TeamLookupInput } from "./TeamLookupInput";
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
  starredFieldIds: string[];
  archivedAt?: number | null;
  archiveReason?: string;
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
type TeamComment = {
  id: string;
  team_name: string;
  comment: string;
  event_key?: string;
  created_by_name: string;
  created_at: number;
};

export function Analysis() {
  const [team, setTeam] = useState("");
  const [searched, setSearched] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [teamB, setTeamB] = useState("");
  const [reportsB, setReportsB] = useState<Report[]>([]);
  const [teamMatches, setTeamMatches] = useState<TeamMatch[]>([]);
  const [teamComments, setTeamComments] = useState<TeamComment[]>([]);
  const [competition, setCompetition] = useState("all");
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"stats" | "matches" | "auto" | "compare">("stats");

  async function loadData(teamFilter = team, teamBFilter = teamB) {
    const result = await api<{
      reports: Report[];
      teamMatches: TeamMatch[];
      teamComments: TeamComment[];
    }>(
      `/analysis?team=${encodeURIComponent(teamFilter)}${tab === "compare" ? `&teamB=${encodeURIComponent(teamBFilter)}` : ""}`,
    );
    setReports(
      teamFilter
        ? result.reports.filter(
            (report) => report.teamName.toLowerCase() === teamFilter.toLowerCase(),
          )
        : result.reports,
    );
    setCompetition("all");
    setSearched(teamFilter);
    setTeamComments(result.teamComments);
    setTeamMatches(result.teamMatches);
    setLoaded(true);
    setReportsB(
      tab === "compare"
        ? result.reports.filter(
            (report) => report.teamName.toLowerCase() === teamBFilter.toLowerCase(),
          )
        : [],
    );
  }

  async function search(event: SyntheticEvent) {
    event.preventDefault();
    await loadData();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: this intentionally loads the unfiltered directory once on mount.
  useEffect(() => {
    loadData("", "").catch(() => undefined);
  }, []);

  async function permanentlyDeleteReport(report: Report) {
    if (
      !window.confirm(
        `Permanently delete this report for team ${report.teamName}? This cannot be undone.`,
      )
    )
      return;
    if (!window.confirm("Confirm permanent deletion one more time.")) return;
    await api(`/analysis/reports/${report.id}/permanent`, { method: "DELETE" });
    setReports((items) => items.filter((item) => item.id !== report.id));
    setReportsB((items) => items.filter((item) => item.id !== report.id));
  }

  async function toggleStar(report: Report, fieldId: string) {
    const result = await api<{ starredFieldIds: string[] }>(
      `/analysis/reports/${report.id}/stars`,
      {
        method: "PUT",
        body: JSON.stringify({ fieldId, starred: !report.starredFieldIds.includes(fieldId) }),
      },
    );
    const update = (items: Report[]) =>
      items.map((item) =>
        item.id === report.id ? { ...item, starredFieldIds: result.starredFieldIds } : item,
      );
    setReports(update);
    setReportsB(update);
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

  const activeReports = reports.filter((report) => !report.archivedAt);
  const activeReportsB = reportsB.filter((report) => !report.archivedAt);
  const summaryA = numericSummary(activeReports);
  const summaryB = numericSummary(activeReportsB);
  const comparisonLabels = [...new Set([...summaryA.keys(), ...summaryB.keys()])];
  const competitions = [
    ...new Set([
      ...reports.map((report) => report.eventKey || "Unassigned"),
      ...teamComments.map((comment) => comment.event_key || "Unassigned"),
    ]),
  ].sort();
  const visibleReports = reports
    .filter((report) => competition === "all" || (report.eventKey || "Unassigned") === competition)
    .sort((left, right) => {
      const eventOrder = (left.eventKey || "Unassigned").localeCompare(
        right.eventKey || "Unassigned",
      );
      if (eventOrder !== 0) return eventOrder;
      const leftDay = new Date(left.createdAt).setHours(0, 0, 0, 0);
      const rightDay = new Date(right.createdAt).setHours(0, 0, 0, 0);
      const dayOrder = rightDay - leftDay;
      if (dayOrder !== 0) return dayOrder;
      const matchOrder =
        (left.matchNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.matchNumber ?? Number.MAX_SAFE_INTEGER);
      if (matchOrder !== 0) return matchOrder;
      const teamOrder = Number(left.teamName) - Number(right.teamName);
      if (teamOrder !== 0) return teamOrder;
      const starOrder =
        Number(right.starredFieldIds.length > 0) - Number(left.starredFieldIds.length > 0);
      return starOrder || right.createdAt - left.createdAt;
    });

  const autoFields = activeReports
    .filter((report) => competition === "all" || (report.eventKey || "Unassigned") === competition)
    .flatMap((report) =>
      report.fields
        .filter((field) => field.type === "fieldMap" && report.drawings[field.id])
        .map((field) => ({ report, field, url: report.drawings[field.id] })),
    );
  const visibleComments = teamComments
    .filter(
      (comment) => competition === "all" || (comment.event_key || "Unassigned") === competition,
    )
    .sort((left, right) => {
      const eventOrder = (left.event_key || "Unassigned").localeCompare(
        right.event_key || "Unassigned",
      );
      return eventOrder || right.created_at - left.created_at;
    });
  const commentsByTeam = new Map<string, TeamComment[]>();
  for (const comment of visibleComments) {
    commentsByTeam.set(comment.team_name, [
      ...(commentsByTeam.get(comment.team_name) ?? []),
      comment,
    ]);
  }
  return (
    <section className="page analysis-page">
      <div className="page-heading">
        <div>
          <h1>Analysis</h1>
        </div>
      </div>
      <form className="analysis-search" onSubmit={search}>
        <Search size={19} />
        <TeamLookupInput
          required={tab === "compare"}
          value={team}
          onChange={setTeam}
          placeholder={tab === "compare" ? "Team A number or name" : "Team number or name"}
        />
        {tab === "compare" && (
          <>
            <Scale size={18} />
            <TeamLookupInput
              required
              value={teamB}
              onChange={setTeamB}
              placeholder="Team B number or name"
            />
          </>
        )}
        <button type="submit" className="primary-button">
          {tab === "compare" ? "Enter" : team ? "Filter" : "Show all"}
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
      {tab === "stats" ? (
        <div className="analysis-results-stack">
          {competitions.length > 0 && (
            <label className="competition-filter">
              Competition
              <select value={competition} onChange={(event) => setCompetition(event.target.value)}>
                <option value="all">All competitions</option>
                {competitions.map((eventKey) => (
                  <option value={eventKey} key={eventKey}>
                    {eventKey}
                  </option>
                ))}
              </select>
            </label>
          )}
          {loaded && !reports.length && !teamComments.length && (
            <div className="forms-empty">
              {searched ? `No reports found for team ${searched}.` : "No reports found."}
            </div>
          )}
          {commentsByTeam.size > 0 && (
            <section className="team-comment-directory">
              {[...commentsByTeam].map(([teamNumber, comments]) => (
                <article key={teamNumber}>
                  <h2>Team {teamNumber}</h2>
                  {comments.map((comment) => (
                    <div key={comment.id}>
                      <p>{comment.comment}</p>
                      <small>
                        {comment.event_key || "Unassigned"} · {comment.created_by_name} ·{" "}
                        {new Date(comment.created_at).toLocaleString()}
                      </small>
                    </div>
                  ))}
                </article>
              ))}
            </section>
          )}
          <div className="analysis-reports">
            {visibleReports.map((report, index) => (
              <div className="report-result" key={report.id}>
                {(index === 0 ||
                  `${visibleReports[index - 1].eventKey || "Unassigned"}-${new Date(visibleReports[index - 1].createdAt).toDateString()}-${visibleReports[index - 1].matchNumber ?? "none"}` !==
                    `${report.eventKey || "Unassigned"}-${new Date(report.createdAt).toDateString()}-${report.matchNumber ?? "none"}`) && (
                  <h2 className="competition-heading">
                    {report.eventKey || "Unassigned"} ·{" "}
                    {new Date(report.createdAt).toLocaleDateString()} ·{" "}
                    {report.matchNumber ? `Match ${report.matchNumber}` : "No match assigned"}
                  </h2>
                )}
                <article
                  className={`${report.starredFieldIds.length ? "starred-report" : ""} ${report.archivedAt ? "archived-report" : ""}`}
                >
                  <header>
                    <div>
                      <span className="report-team-line">
                        <strong>Team {report.teamName}</strong>
                        <button
                          type="button"
                          className={`star-button ${report.starredFieldIds.includes("__report") ? "active" : ""}`}
                          onClick={() => toggleStar(report, "__report")}
                          aria-label={
                            report.starredFieldIds.includes("__report")
                              ? `Unstar team ${report.teamName} report`
                              : `Star team ${report.teamName} report`
                          }
                          title={
                            report.starredFieldIds.includes("__report")
                              ? "Unstar report"
                              : "Star report"
                          }
                        >
                          <Star size={16} fill="currentColor" />
                        </button>
                      </span>
                      <span>{report.formName}</span>
                      <span>{report.submittedByName}</span>
                      {report.matchNumber && <span>Match {report.matchNumber}</span>}
                    </div>
                    <time>{new Date(report.createdAt).toLocaleString()}</time>
                    <button
                      type="button"
                      className="delete-report-button"
                      onClick={() => permanentlyDeleteReport(report)}
                      aria-label={`Permanently delete report for ${report.teamName}`}
                      title="Remove bad data"
                    >
                      <Trash2 size={17} />
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
              </div>
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
          {loaded && !searched && (
            <div className="forms-empty">Enter a team number to load its TBA matches.</div>
          )}
        </div>
      ) : tab === "auto" ? (
        <div className="auto-path-grid">
          {autoFields.map(({ report, field, url }) => (
            <article key={`${report.id}-${field.id}`}>
              <img src={`${API_URL}${url}`} alt={`${report.teamName} ${field.label}`} />
              <div>
                <MapIcon size={16} />
                <strong>
                  Team {report.teamName} · {field.label}
                </strong>
                <span>
                  {report.eventKey || "Unassigned"} · {report.formName} ·{" "}
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>
              <button
                type="button"
                className="delete-report-button"
                onClick={() => permanentlyDeleteReport(report)}
                aria-label={`Permanently delete report for ${report.teamName}`}
                title="Remove bad data"
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
          {loaded && !autoFields.length && (
            <div className="forms-empty">
              No autonomous paths reported{searched ? ` for ${searched}` : ""}.
            </div>
          )}
        </div>
      ) : (
        <div className="team-comparison">
          {searched && teamB && (
            <div className="comparison-scoreboard">
              <div>
                <span>Team A</span>
                <strong>{searched}</strong>
                <small>{activeReports.length} reports</small>
              </div>
              <Scale size={28} />
              <div>
                <span>Team B</span>
                <strong>{teamB}</strong>
                <small>{activeReportsB.length} reports</small>
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
