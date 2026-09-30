# Shop SW analytics — research brief and plan

Status: Phases 2–3 built on `gray-slack-overviews`; Phase 4 (Slack messages) next. Replaces the
current "one fact per bucket" Overview/Reflection Slack messages.

## 1. Goal

Help the shop answer three questions every day, with evidence instead of anecdotes:

1. **Where is work waiting, and which machines need people?** (start of day — *Overview*)
2. **How did today go compared with normal?** (end of day — *Reflection*)
3. **Is the shop getting faster or slower, and where is the bottleneck?** (analytics page)

Audience: students at the machines (what to work on), leads/mentors (trends, bottlenecks).

## 2. What good process-monitoring dashboards include

Summarised from flow-metrics practice (Kanban/ProKanban) and job-shop manufacturing dashboards.

**The four flow metrics** — the core set; everything else builds on them:

| Metric | Definition | Why it matters |
|---|---|---|
| WIP | Parts started but not finished (per machine and total) | Too much WIP → longer waits (Little's Law: lead time ≈ WIP ÷ throughput) |
| Throughput | Steps / parts finished per day | The shop's actual rate; plotted over time, shows trends |
| Cycle time | Start → finish of a step (or a whole part) | Per-machine "normal"; drift upward = trouble |
| Work item age | How long an unfinished part has been in its current state | The *daily* early-warning metric: catches stuck work before it's late |

**Supporting ideas**
- **Queue time vs. touch time.** In job shops most lead time is waiting, not machining. Tracking
  queue time (ready → started) separately from cycle time shows whether the fix is more machine
  time or better flow. Flow efficiency = touch time ÷ lead time.
- **Per-machine queues, bottleneck first.** Rank machines by queued work; the bottleneck's lost
  hour costs the whole shop.
- **"Stuck" is relative, not a fixed number of days.** Compare each part's age with that machine's
  typical cycle time: > ~1.5× the norm is at risk, 3–4× is stuck. Percentiles (50/70/85/95th)
  from history give the norm, e.g. "85% of Mill steps finish within 2 days".
- **Trends need rules, not eyeballing.** Run charts (value over time with a median line) with the
  *shift* and *crossings* rules detect real changes with ~5% false alarms even at 10–100 points.
  The classic "trend" rule (N points in a row rising) is nearly useless — don't use it.
- **Outliers vs. the process's own history**, not arbitrary thresholds.

**Standard charts** (what each is for)
- *Work item age chart* — each open part as a dot at its current machine, height = age, with that
  machine's percentile lines. The single most useful daily chart.
- *Queue by machine* — stacked bar: ready / in progress / coming up.
- *Cycle-time scatterplot* — each finished step as a dot over time, with 50/85/95th lines.
- *Throughput run chart* — steps finished per shop day with the median; flags shifts.
- *Cumulative flow diagram* — parts in each state over time; widening bands = bottleneck forming.
- *Activity heatmap* — steps finished by weekday × hour; when the shop actually works.

## 3. Our data vs. these metrics

From reading the code (production numbers pending a read-only export — see §6).

**What we record**
- `part_instance_processes`: current status per step; `completed_at` (last completion only).
- `actions`: `started` / `completed` events with user, part, machine, timestamp — logged by the
  single-step, bulk, and staging-batch routes.
- `part_instances.created_at`; `staging_batches` open/close times.

**Gaps that block good metrics**

| Gap | Effect |
|---|---|
| Send-backs / manual status edits are not logged, and they **null out `completed_at`** | Rework is invisible and earlier completion history is destroyed |
| Unstaging from a batch (In Progress → To Do) is not logged | Cycle times for those steps are wrong |
| "Done" can be set without a start (`/done` from To Do) | No start time → no cycle time for those steps |
| Obsoleting a part has no event/timestamp | Can't tell when work was abandoned |
| **"Delete Obsolete Instances" deletes their `actions` rows** | Every cleanup erases real history |
| Kiosk presence is current-only | Can't tell when machines were staffed |
| No record of shop hours | "Per day" includes days the shop was closed |

**Metric availability today**

| Metric | Source | Status |
|---|---|---|
| Throughput | `completed` actions | ✅ available |
| WIP / queue by machine (now) | step statuses | ✅ available |
| Work item age | previous step's completion (or part created) | ✅ available, slightly off after send-backs |
| Cycle time | `started` → `completed` action pairs | ⚠️ partial (missing starts, unlogged unstages) |
| Queue time | ready → `started` | ⚠️ partial |
| WIP history / CFD | replay of events | ⚠️ lossy until send-backs are logged |
| Rework rate | — | ❌ not recorded |
| Machine staffing | — | ❌ not recorded |

## 4. Proposed plan

**Phase 2 — fix the event history (small, do first; history can't be backfilled later)**
- Log every status change as an action, adding event types `reopened` (send-back from done) and
  `unstarted` (doing → to do, including unstaging). Obsoleting is recorded as
  `part_instances.stale_at` instead of an action.
- **`actions` is standalone, permanent history** (migration `0016_action_history.sql`): no
  foreign keys, and each row snapshots part definition id, part number, part name, instance number
  and process name. Parts and processes can be deleted freely; the obsolete cleanup no longer
  touches `actions`, and the actions log falls back to the snapshot for deleted parts.
- `completed_at` stays "latest completion only"; the event log is the source of truth for history.
- Optional: log kiosk sign-in/out to get machine staffing.

**Phase 3 — Analytics page in the shop app** (built: `/analytics`)
Charts from §2, per machine and overall, over a selectable window (14 / 30 / 90 days / all).
This is the "real" analysis; Slack messages link to it.
- Code: `workers/shop/src/lib/analytics/` — `model.ts` (dedupe, sessions, step replay),
  `metrics.ts` (report), `insights.ts` (scored insights), `charts.ts` (SVG shared with Slack
  images); route `GET /analytics?days=&tz=`; page `apps/shop/src/plugins/analytics/`.
- **Time is shop time.** The shop meets a few evenings a week, so calendar time mostly counts
  closed days. Actions are clustered into sessions (split at 3 h gaps; clusters under 5 events are
  stray edits). Waits are counted in sessions spanned; cycle times in time inside sessions.
- Steps marked In Progress and done within 2 minutes are logged after the fact and are not timed
  (34% of finished steps in the September data); the page says so under "About this data".
- Norms (usual wait, cycle percentiles) need 8+ samples per machine, else fall back to the
  shop-wide norm, else a fixed 2 sessions. At risk = over the usual wait; stuck = ≥ 2× or +2.
- Charts: work-item age (dot per open part, usual-wait tick), queue by machine (stacked bars),
  steps per session (bars + median), cycle-time scatter (median/85% lines), weekday × hour heatmap.
  Each has hover tooltips and a table view. Per-person numbers are admin-only (never on kiosks).

**Phase 4 — Slack messages rebuilt around insights**
- Compute *candidate* insights, **score** each by how unusual it is against the machine's own
  history (percentiles, run-chart rules), and post only the top 3–4. Examples:
  - "3 parts at Mill are older than 95% of past Mill waits (oldest: 6 days)."
  - "Router cycle time median is 2.1 h over the last 7 days vs 1.2 h normally (shift detected)."
  - "Throughput this week is the highest since tracking began (42 steps)."
  - "CAM queue has grown 4 shop days in a row."
- Attach one or two chart images: Overview → work-item-age chart; Reflection → throughput run
  chart with today highlighted.
- Suppress insights with too little data (e.g. < 20 finished steps for a machine's percentiles).
- Scheduled sends at the start and end of shop hours (needs the team's meeting times), plus the
  existing manual buttons.

**Phase 5 — tune with real use**: a week of messages reviewed by Erik and a few students; drop
noisy insight types, adjust thresholds.

## 5. Chart images in Slack

- **Rendering:** generate SVG in the worker and convert to PNG with a WASM renderer (resvg), no
  third party involved. Alternatives: a hosted chart API (easy, but sends shop data out) or a
  headless-browser screenshot of the analytics page (Cloudflare Browser Rendering, paid).
- **Posting:** Slack's external upload flow (`files.getUploadURLExternal` →
  `files.completeUploadExternal`); the bot needs the `files:write` scope.

## 6. Open items

1. Read-only export of the production shop DB to size the history and check data quality
   (how many steps have both a start and a completion, how many parts skip "started", etc.).
2. Per-person numbers in a public channel: keep, anonymise, or opt-in?
3. Shop hours (for scheduling and "per shop day" metrics).
4. Rendering approach for images (§5).

## Sources

- [ProKanban — Visualizing Flow Metrics](https://prokanban.org/blog/visualizing-flow-metrics---where-to-begin)
- [Let People Work — Using Flow Metrics](https://blog.letpeople.work/p/using-flow-metrics-from-feelings-to-facts) and [FlowPulse chart docs](https://docs.flowpulse.letpeople.work/charts/charts.html)
- [Kollabe — Flow metrics: cycle time, throughput, what to measure](https://kollabe.com/posts/flow-metrics-for-scrum-teams)
- [Yuval Yeret — Flow metrics: see stuck work early](https://yuvalyeret.com/blog/4-key-flow-metrics-and-how-to-use-them-in-scrums-events/)
- [Tulip — WIP tracking best practices](https://tulip.co/blog/best-practices-for-managing-work-in-progress/)
- [User Solutions — WIP management in manufacturing](https://usersolutions.com/blog/wip-management)
- [JITbase — Throughput KPIs for CNC shops](https://www.jitbase.com/blog/throughput-kpis-cnc-shop)
- [Anhøj & Olesen — Run charts revisited (PLOS ONE)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0113825)
