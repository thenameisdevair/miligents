# Phase 3.5 — Live Activity Panel PRD

**Goal:** Make the dashboard at `http://localhost:8081/` show what every agent is doing, in near-real-time, so the demo video has a continuously-updating "this is what each agent is thinking and executing right now" view across all four agents (originator, research_specialist, execution, scheduler).

**Why it ships before Phase 4:** the cycles already run end-to-end. The bottleneck for the hackathon submission is *visibility*, not capability. A judge watching the video must see four lanes of live activity, not stare at static counts.

**Scope discipline:** this is only a UI/observability layer. It does not change agent behavior, does not replace the existing AXL feed, and does not block any other phase. If anything in this PRD conflicts with the v2 PRD, the v2 PRD wins.

---

## What "live activity" means

Each meaningful step an agent takes emits an **activity event**. The dashboard shows the latest events grouped by agent, newest first, with relative timestamps that age in place (`just now`, `3s ago`, `1m ago`).

A meaningful step is one of:

| kind | when emitted | summary example |
|------|--------------|-----------------|
| `cycle` | scheduler starts/ends a cycle, or moves between agents | `started cycle_20260501_143000` |
| `task` | CrewAI task begins | `running task: execute strategy 'agentic trading'` |
| `tool_call` | a tool starts | `searching the web for: agentic yield strategies` |
| `tool_result` | a tool returns | `received 8 search results` |
| `axl_send` | AXL message sent | `sent INSTRUCTION to specialist` |
| `axl_recv` | AXL message received | `received REPORT from execution` |
| `storage` | 0G Storage upload completes | `stored research_2026...md (root: 0xab12…)` |
| `inft_mint` | iNFT minted | `minted v3 of 'Yield Farming' (token #42)` |
| `error` | any caught exception worth showing | `tool web_search_tool raised TimeoutError` |
| `status` | coarse-grained agent status change | `running` / `idle` / `complete` |

We do not stream raw LLM "chain-of-thought" tokens. The model on free-tier Cerebras is not interesting enough to read line-by-line, and capturing it adds complexity that does not pay off for a 4-minute video. Tool calls and their summaries are the right resolution.

---

## Backend: schema + writer

### New table — `activity`

Add to `_ensure_schema()` in [integrations/state_writer.py](../integrations/state_writer.py):

```sql
CREATE TABLE IF NOT EXISTS activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT NOT NULL,                  -- 'originator' | 'specialist' | 'execution' | 'scheduler'
    kind        TEXT NOT NULL,                  -- one of the kinds in the table above
    summary     TEXT NOT NULL,                  -- short human string, ≤140 chars
    details     TEXT,                           -- optional JSON blob (string)
    cycle_id    TEXT,                           -- optional FK to cycles.cycle_id
    timestamp   TEXT NOT NULL                   -- ISO8601 UTC
);
CREATE INDEX IF NOT EXISTS activity_agent_ts
    ON activity(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_ts
    ON activity(timestamp DESC);
```

### New helper — `write_activity()`

Add to [integrations/state_writer.py](../integrations/state_writer.py):

```python
def write_activity(
    agent_id: str,
    kind: str,
    summary: str,
    details: dict | None = None,
    cycle_id: str | None = None,
) -> None:
    """
    Append a single activity event for the live feed.
    Truncates summary to 140 chars. Catches all exceptions —
    activity logging must never break agent execution.
    """
```

The function must be **fail-silent** (wrap the SQL in try/except, print a warning). Activity logging is a UX feature; it must not break a cycle.

### Where to call `write_activity()`

The wiring is intentionally light — we only instrument the tools that already exist, and we add **one** wrapper layer rather than touching every callsite.

Preferred pattern: a tiny decorator in a new file [integrations/activity.py](../integrations/activity.py):

```python
from functools import wraps
from integrations.state_writer import write_activity

def emit(agent_id: str, kind: str, summary_fn=None):
    """
    Decorator that emits a tool_call event before the call and
    a tool_result or error event after.
    summary_fn(args, kwargs) -> str  may be passed to build a richer summary.
    """
```

Use it on the existing `@tool(...)` functions in:

- [agents/execution/tools.py](../agents/execution/tools.py)
- [agents/originator/tools.py](../agents/originator/tools.py)
- [agents/research_specialist/tools.py](../agents/research_specialist/tools.py)

Apply to each `@tool` function. Do **not** instrument helper functions inside tools — only the tool entrypoints. CrewAI invokes them by name and they are the right boundary.

In addition:

- [scheduler/main.py](../scheduler/main.py) — call `write_activity("scheduler", "cycle", "started <cycle_id>")` and `"finished <cycle_id> ({status})"` at the bookends of `run_cycle()`. Also between agents: `"originator finished, triggering specialist"`.
- [agents/*/server.py](../agents/originator/server.py) — call `write_activity(agent, "status", "started")` / `"finished"` / `"error: ..."` around the threaded `run()` invocation.

### `cycle_id` propagation

The scheduler already generates `cycle_id` per cycle. We need that string to land on every activity row inside that cycle so the frontend can group by it.

Mechanism: write the current `cycle_id` into a small file at `STATE_DIR/current_cycle.txt` when the scheduler starts a cycle, and remove it when the cycle ends. `write_activity()` reads this file (best-effort) when no `cycle_id` is provided. Do **not** plumb cycle_id through every function call — that touches too many files for the value.

---

## Backend: query + API

### New query in `api/db.py`

```python
def get_activity(
    agent_id: str | None = None,
    cycle_id: str | None = None,
    limit: int = 30,
) -> list:
    """
    Return the most recent activity rows. If agent_id is given,
    filter to that agent. If cycle_id is given, filter to that cycle.
    Newest first.
    """
```

### New endpoints in `api/server.py`

```python
@app.get("/api/activity")
def activity(agent_id: str | None = None, limit: int = 30):
    return {"activity": get_activity(agent_id=agent_id, limit=limit)}

@app.get("/api/activity/grouped")
def activity_grouped(limit_per_agent: int = 15):
    """
    Return {agents: {originator: [...], specialist: [...],
                     execution: [...], scheduler: [...]}}
    Each list is the latest N events for that agent, newest first.
    """
```

### WebSocket payload addition

Update the periodic broadcast in `api/server.py`'s `feed()` to include:

```python
"activity": get_activity(limit=40),
```

The frontend can either consume `/api/activity/grouped` polling or this WS feed — both must work.

---

## Frontend: live activity panel

Edit [frontend/MiliGents v2.html](../frontend/MiliGents%20v2.html). Insert a new section between the existing "Agents" cards and the "AXL feed" — those are the most natural neighbours and the dashboard already has empty real estate there.

### Layout

A 4-column grid, one column per agent. On screens narrower than 1100px stack vertically.

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ ORIGINATOR   │ SPECIALIST   │ EXECUTION    │ SCHEDULER    │
│ ● running    │ ● idle       │ ● running    │ ● cycling    │
│ ────────────│ ────────────│ ────────────│ ────────────│
│ 3s · 🔍 web  │ 1m · ✓ done  │ 2s · ⚙️ run  │ 0s · ⏱ tick  │
│ 8s · 🛠 plan │ 3m · 📦 0G   │ 8s · 🔧 keep │ 5m · ▶ start │
│ 22s · ▶ tsk │ 4m · 🔍 web  │ 22s · 🛠 plan│ 15m · ▶ start│
│ 1m · ▶ task │ ...          │ ...          │ ...          │
│ ...          │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Each column:

- Header: agent name + a small status dot (`running` = mint-green, `idle` = slate, `error` = coral). The dot color is read from the existing `/api/agents` payload — same source used by the existing agent cards. Don't introduce a new source.
- A scrollable feed of the latest **15** events for that agent, newest first.
- Each row: `<relative-time> · <icon> <summary>`.
- Auto-scroll behavior: when a new event arrives at the top and the user is already scrolled to the top, stay pinned. If the user has scrolled down, do not yank.

### Icons (Unicode glyphs, no extra deps)

| kind | glyph |
|------|-------|
| cycle | ⏱ |
| task | ▶ |
| tool_call | 🔧 |
| tool_result | ✓ |
| axl_send | 📤 |
| axl_recv | 📥 |
| storage | 📦 |
| inft_mint | 🪪 |
| error | ⚠ |
| status | ● |

Match the existing typography (`var(--mono)` and the slate text variables already defined). Use the same card chrome (`.panel` class) already in the stylesheet — do not introduce new component primitives unless necessary.

### Polling

The dashboard already has a 5s `setInterval(fetchAndRender, 5000)`. Add `fetch('/api/activity/grouped?limit_per_agent=15')` to the existing `Promise.all` block in `fetchAndRender()` and a corresponding `renderActivity(grouped)` function.

For genuine real-time-feel between polls, also handle the WebSocket `activity` field if present — push new rows that have an id greater than the latest seen id per agent.

### Relative timestamps

Already used elsewhere in the file (`'2 min ago'`, `'just now'`). Reuse the existing helper if present; otherwise add a minimal one near the other formatters:

```js
function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 5000) return 'just now';
  if (ms < 60000) return Math.floor(ms / 1000) + 's ago';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
  return Math.floor(ms / 3600000) + 'h ago';
}
```

To keep the UI feeling alive, run a 1-second `setInterval` that re-renders only the timestamp spans, not the whole feed. Each `<span class="ts" data-iso="...">` gets its text updated.

---

## Out of scope

- Streaming raw LLM token-by-token output (Path C in the discussion).
- Capturing each container's stdout. We use the structured `activity` table only.
- Persisting activity beyond `state.db`. No retention policy yet.
- Filtering / search UI. Latest-N per agent is enough for a 4-minute video.
- Mobile responsive design beyond a single-stack fallback.
- Animations beyond a subtle fade-in on new rows.
- Re-enabling CrewAI `verbose=True`. The structured activity stream replaces the need for it.

---

## Build order (each step is its own commit)

1. **Schema + writer** — add `activity` table to `_ensure_schema`, add `write_activity()` and `current_cycle.txt` helpers.
2. **Decorator + instrumentation** — add `integrations/activity.py`, wire `@emit(...)` onto every `@tool` in the three tools.py files. Wire scheduler bookends. Wire server.py status events.
3. **API** — `get_activity()` in db.py, two endpoints, WebSocket payload addition.
4. **Frontend HTML/CSS** — insert the 4-column panel into the right place, add the styles.
5. **Frontend JS** — `renderActivity`, polling integration, WebSocket integration, 1s ticker for timestamps.
6. **Verification** — rebuild api + 3 agents + scheduler, run one cycle, screenshot the dashboard with all four columns alive.

Verification command after services are running:

```bash
python3 scripts/verify_phase_3_5.py --api http://localhost:8081 --fresh-seconds 300
```

The verifier checks `/api/activity/grouped`, confirms all four lanes have fresh events, samples `/api/activity`, and warns if AXL/storage/iNFT records are not visible yet.

Each commit must be self-contained and leave the system runnable. After step 1 the schema migrates safely (CREATE TABLE IF NOT EXISTS). After step 2 the table starts filling but no UI exists. After step 5 the UI appears.

---

## Acceptance

The PRD is satisfied when:

1. `docker compose up -d` starts all 7 services with no extra steps.
2. Within 30s of the scheduler firing a cycle, all four columns of the dashboard show at least one fresh event.
3. As the cycle progresses, each column accumulates events without a refresh — the dashboard polls.
4. Timestamps age in place (a row that says `3s ago` becomes `4s ago` a second later without a network call).
5. After the cycle finishes, the SQLite query `SELECT COUNT(*) FROM activity` is in the dozens, not tens or hundreds — we don't drown the table.
6. The video recording is a single browser window of `http://localhost:8081/` and a viewer can follow what each agent did, in order, by reading the columns.

---

## Handoff notes

If this PRD is being picked up by a different agent mid-build:

- Check `git log --oneline` against the **Build order** above to see which commits have landed.
- The most recent commit message will say which step was completed last.
- Do not regenerate completed work. Read the file, then implement the next step.
- The contract between backend and frontend is the JSON shape returned by `/api/activity/grouped`. As long as that contract is preserved, frontend and backend can be developed independently.
