import { Coins, Loader2, Radio, RefreshCw, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Market = "spread";
type Selection = "red" | "blue";
type SportsbookMatch = {
  key: string;
  label: string;
  matchNumber: number;
  startTime: number | null;
  redTeams: string[];
  blueTeams: string[];
  prediction: { redScore: number; blueScore: number; redWinProbability: number };
  markets: {
    spread: { red: number; blue: number; redOdds: number; blueOdds: number };
  };
};
type SportsbookData = {
  eventKey: string;
  account: { balance: number; earned: number; wagered: number };
  leaderboard: { display_name: string; balance: number; earned: number; wagered: number }[];
  bets: {
    id: string;
    match_key: string;
    match_label: string;
    market: Market;
    selection: Selection;
    line: number;
    odds: number;
    stake: number;
    status: "open" | "won" | "lost" | "push";
    payout: number;
  }[];
  parlays: {
    id: string;
    odds: number;
    stake: number;
    status: "open" | "won" | "lost" | "push";
    payout: number;
    legs: {
      match_label: string;
      market: Market;
      selection: Selection;
      line: number;
      odds: number;
      status: "open" | "won" | "lost" | "push";
    }[];
  }[];
  matches: SportsbookMatch[];
  statsError: string;
};
type BetSlip = {
  match: SportsbookMatch;
  market: Market;
  selection: Selection;
  line: number;
  label: string;
  odds: number;
};

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function americanToDecimal(odds: number) {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function combinedOdds(legs: BetSlip[]) {
  const decimal = legs.reduce((total, leg) => total * americanToDecimal(leg.odds), 1);
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : -Math.round(100 / Math.max(0.01, decimal - 1));
}

export function Sportsbook() {
  const [data, setData] = useState<SportsbookData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [section, setSection] = useState<"sportsbook" | "leaderboard">("sportsbook");
  const [slip, setSlip] = useState<BetSlip[]>([]);
  const [stake, setStake] = useState(10);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api<SportsbookData>("/game"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the sportsbook.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function placeBet() {
    if (!slip.length || !Number.isInteger(stake) || stake < 1) return;
    setPlacing(true);
    setError("");
    try {
      await api(slip.length > 1 ? "/game/parlays" : "/game/bets", {
        method: "POST",
        body: JSON.stringify(
          slip.length > 1
            ? {
                legs: slip.map((leg) => ({
                  matchKey: leg.match.key,
                  market: leg.market,
                  selection: leg.selection,
                  expectedLine: leg.line,
                })),
                stake,
              }
            : {
                matchKey: slip[0].match.key,
                market: slip[0].market,
                selection: slip[0].selection,
                expectedLine: slip[0].line,
                stake,
              },
        ),
      });
      setSlip([]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not place the bet.");
    } finally {
      setPlacing(false);
    }
  }

  function choose(next: BetSlip) {
    setSlip((current) => {
      const withoutMatch = current.filter((leg) => leg.match.key !== next.match.key);
      const alreadySelected = current.some(
        (leg) =>
          leg.match.key === next.match.key &&
          leg.market === next.market &&
          leg.selection === next.selection,
      );
      return alreadySelected ? withoutMatch : [...withoutMatch, next].slice(0, 8);
    });
  }

  function isSelected(matchKey: string, market: Market, selection: Selection) {
    return slip.some(
      (leg) => leg.match.key === matchKey && leg.market === market && leg.selection === selection,
    );
  }

  const slipOdds = slip.length ? combinedOdds(slip) : 0;

  if (loading)
    return (
      <section className="page game-page game-loading">
        <Loader2 className="spin" /> Loading G3 Sportsbook…
      </section>
    );

  return (
    <section className="page game-page">
      <div className="game-hero">
        <div>
          <p className="sportsbook-kicker">
            <Radio size={13} /> Live robotics markets
          </p>
          <h1>G3 Sportsbook</h1>
          <span>{data?.eventKey ? `Event: ${data.eventKey}` : "No active event"}</span>
        </div>
        <div className="sportsbook-account">
          <span className={`sportsbook-market-status${data?.statsError ? " paused" : ""}`}>
            <i />
            {data?.statsError
              ? "Markets paused"
              : data?.matches.length
                ? "Markets open"
                : "Awaiting markets"}
          </span>
          <div className="game-balance" aria-label={`${data?.account.balance ?? 0} Boyle Bucks`}>
            <Coins size={18} />
            <span>
              <strong>{data?.account.balance ?? 0} BB</strong>
              <small>Available balance</small>
            </span>
          </div>
        </div>
      </div>

      {error && <div className="form-message error">{error}</div>}
      {data?.statsError && (
        <div className="form-message error">Markets paused: {data.statsError}</div>
      )}

      <div className="game-tabs" role="tablist" aria-label="Sportsbook sections">
        <button
          type="button"
          role="tab"
          aria-selected={section === "sportsbook"}
          className={section === "sportsbook" ? "active" : ""}
          onClick={() => setSection("sportsbook")}
        >
          Odds Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "leaderboard"}
          className={section === "leaderboard" ? "active" : ""}
          onClick={() => setSection("leaderboard")}
        >
          Boyle Bucks Standings
        </button>
      </div>

      {section === "sportsbook" ? (
        <div className="game-layout">
          <div className="game-main">
            <div className="game-section-heading">
              <div>
                <span className="sportsbook-subhead">Upcoming markets</span>
                <h2>Match Lines</h2>
              </div>
              <button type="button" className="secondary-button" onClick={load}>
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
            {!data?.matches.length && !data?.statsError && (
              <div className="forms-empty">No upcoming Statbotics markets are available.</div>
            )}
            <div className="game-match-list">
              {data?.matches.map((match) => {
                return (
                  <article className="game-match-card" key={match.key}>
                    <header>
                      <strong>{match.label}</strong>
                    </header>
                    <div className="sportsbook-columns" aria-hidden="true">
                      <span>Matchup</span>
                      <span>Spread / odds</span>
                    </div>
                    <div className="sportsbook-row red">
                      <div className="sportsbook-team">
                        <strong>Red</strong>
                        <span>{match.redTeams.join(" / ")}</span>
                      </div>
                      <button
                        type="button"
                        className={isSelected(match.key, "spread", "red") ? "selected" : ""}
                        onClick={() =>
                          choose({
                            match,
                            market: "spread",
                            selection: "red",
                            line: match.markets.spread.red,
                            label: `Red ${signed(match.markets.spread.red)}`,
                            odds: match.markets.spread.redOdds,
                          })
                        }
                      >
                        <span>{signed(match.markets.spread.red)}</span>
                        <b>{signed(match.markets.spread.redOdds)}</b>
                      </button>
                    </div>
                    <div className="sportsbook-row blue">
                      <div className="sportsbook-team">
                        <strong>Blue</strong>
                        <span>{match.blueTeams.join(" / ")}</span>
                      </div>
                      <button
                        type="button"
                        className={isSelected(match.key, "spread", "blue") ? "selected" : ""}
                        onClick={() =>
                          choose({
                            match,
                            market: "spread",
                            selection: "blue",
                            line: match.markets.spread.blue,
                            label: `Blue ${signed(match.markets.spread.blue)}`,
                            odds: match.markets.spread.blueOdds,
                          })
                        }
                      >
                        <span>{signed(match.markets.spread.blue)}</span>
                        <b>{signed(match.markets.spread.blueOdds)}</b>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="game-sidebar">
            <section className="game-slip">
              <h2>Betslip {slip.length > 1 ? `(${slip.length}-leg parlay)` : ""}</h2>
              {slip.length ? (
                <>
                  <div className="parlay-legs">
                    {slip.map((leg) => (
                      <div key={leg.match.key}>
                        <span>
                          <strong>{leg.match.label}</strong>
                          <small>
                            {leg.label} at {signed(leg.odds)}
                          </small>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSlip((current) =>
                              current.filter((item) => item.match.key !== leg.match.key),
                            )
                          }
                          aria-label={`Remove ${leg.match.label}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="parlay-odds">
                    <span>{slip.length > 1 ? "Parlay odds" : "Odds"}</span>
                    <strong>{signed(slipOdds)}</strong>
                  </div>
                  <label>
                    Stake
                    <input
                      type="number"
                      min="1"
                      max={data?.account.balance ?? 0}
                      step="1"
                      value={stake}
                      onChange={(event) => setStake(Math.floor(Number(event.target.value)))}
                    />
                  </label>
                  <div className="game-return">
                    Potential return
                    <strong>
                      {Math.floor(
                        stake +
                          (slipOdds > 0
                            ? (stake * slipOdds) / 100
                            : (stake * 100) / Math.abs(slipOdds)),
                      )}{" "}
                      BB
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={placing || stake < 1 || stake > (data?.account.balance ?? 0)}
                    onClick={placeBet}
                  >
                    {placing ? <Loader2 className="spin" size={17} /> : <Coins size={17} />} Place{" "}
                    {slip.length > 1 ? "parlay" : "bet"}
                  </button>
                </>
              ) : (
                <p>Select a line to add it to your betslip.</p>
              )}
            </section>
          </aside>
        </div>
      ) : (
        <section className="game-leaderboard game-leaderboard-full" role="tabpanel">
          <h2>
            <Trophy size={19} /> Boyle Bucks Standings
          </h2>
          <div className="game-leaderboard-table">
            <div className="game-leaderboard-head">
              <span>Rank</span>
              <span>Name</span>
              <span>Balance</span>
              <span>Earned</span>
              <span>Wagered</span>
            </div>
            {data?.leaderboard.map((player, index) => (
              <div className="game-leaderboard-row" key={`${player.display_name}-${index}`}>
                <b>#{index + 1}</b>
                <strong>{player.display_name}</strong>
                <span>{player.balance} BB</span>
                <span>{player.earned} BB</span>
                <span>{player.wagered} BB</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === "sportsbook" && !!(data?.bets.length || data?.parlays.length) && (
        <section className="game-history">
          <h2>Open &amp; settled bets</h2>
          <div className="game-history-grid">
            {data.parlays.map((parlay) => (
              <div key={parlay.id}>
                <span className={`bet-status ${parlay.status}`}>{parlay.status}</span>
                <strong>{parlay.legs.length}-leg parlay</strong>
                <span>{parlay.legs.map((leg) => leg.match_label).join(", ")}</span>
                <b>
                  {parlay.stake} BB at {signed(parlay.odds)}
                  {parlay.payout > 0 ? ` → ${parlay.payout} BB` : ""}
                </b>
              </div>
            ))}
            {data.bets.map((bet) => (
              <div key={bet.id}>
                <span className={`bet-status ${bet.status}`}>{bet.status}</span>
                <strong>{bet.match_label}</strong>
                <span>
                  {bet.selection === "red" ? "Red" : "Blue"}{" "}
                  {signed(bet.selection === "red" ? bet.line : -bet.line)} at {signed(bet.odds)}
                </span>
                <b>
                  {bet.stake} BB{bet.payout > 0 ? ` → ${bet.payout} BB` : ""}
                </b>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
