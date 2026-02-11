# HEARTBEAT.md — Design Notes & Comments

> **Purpose:** This file explains the reasoning behind each section of `HEARTBEAT.md`.
> Use this as a reference when editing HEARTBEAT.md after real OpenClaw testing.
> Delete this file before public release.

---

## Frontmatter

```yaml
name: paperclip-heartbeat
interval: 30m
active_hours: "00:00-23:59"
priority: high
```

**Why 30m interval:** Balances responsiveness with resource usage. Too fast (5m) burns RPC calls and may rate-limit. Too slow (2h) means agents miss time-sensitive tasks.

**After testing:** Is 30m the right cadence? If tasks are rarely added, 1h might be better. If we run daily tasks with tight windows, 15m might be needed. Tune based on task refresh rate.

**Why 24/7 active hours:** MVP has no time-gated tasks. Later (Phase 18, Seasons), we might restrict heartbeats to event windows.

**Priority field:** Used by OpenClaw to determine task execution order when multiple heartbeats compete. "high" means this runs before lower-priority heartbeats.

**After testing:** Does OpenClaw actually honor the `priority` field? Check OpenClaw's heartbeat scheduler implementation.

---

## State Block

```
last_checked: null
last_task_completed: null
tasks_done_this_session: 0
consecutive_errors: 0
status: idle
```

**Pattern source:** Arkham Intelligence's "compare current vs last known state" pattern. The agent tracks its own progress to avoid redundant work.

**Why in the heartbeat file:** OpenClaw agents persist state by modifying their own HEARTBEAT.md file. The state block acts as a simple key-value store.

**After testing:** Critical questions:
1. Does the agent actually modify its own HEARTBEAT.md? Or does OpenClaw have a separate persistence mechanism?
2. If the agent rewrites the file, does it preserve the frontmatter?
3. If state persists elsewhere (e.g., `~/.openclaw/state.json`), rewrite this section to reference that location instead.
4. Is the state format correct? YAML? JSON? Freeform markdown? Test what the agent actually writes.

**Risk:** If the agent can't persist state, the heartbeat will retry already-completed tasks. The on-chain ClaimRecord PDA prevents double-claiming, so it's safe — just wasteful.

---

## Loop Steps

### Step 1: Check status (`pc status --json`)

**Why status first, not tasks:** Status tells us if the agent is registered. If not, we need `pc init` before anything else. Also, `status` is cheaper than `tasks` (single PDA fetch vs `getProgramAccounts`).

**After testing:** Does the agent check the JSON output correctly? Test edge cases:
- Not registered (agent == null)
- Registered, no tasks (available_tasks == 0)
- Registered, tasks available (available_tasks > 0)

### Step 2: Fetch tasks (`pc tasks --json`)

**Why compare against last_task_completed:** Without this, the agent could repeatedly attempt the same task it just failed at. The comparison is a simple "don't retry the most recent failure" mechanism.

**After testing:** Is this comparison actually useful? The on-chain ClaimRecord already prevents double-claiming. The main value is avoiding wasted Storacha uploads for already-claimed tasks.

### Step 3: Pick a task

**Why reward-based sorting:** In the MVP, all tasks are equally valid. Picking higher-reward tasks maximizes Clips per heartbeat cycle.

**After testing:** Consider adding heuristics:
- Task difficulty matching (agent's capabilities vs task requirements)
- Task category preference (some agents are better at technical tasks)
- Quest chain awareness (complete prerequisites before dependents)

**Missing:** The current logic doesn't handle quest chains (Phase 11). When task prerequisites land, the pick logic needs to check `prerequisite_task_id`.

### Step 4: Execute the work

**This is the vague part.** The heartbeat can't tell the agent HOW to do the work — that depends on the task content. The agent reads `content.instructions` and uses its own capabilities.

**After testing:** Does the agent actually execute tasks meaningfully? Or does it just submit generic proofs? If the latter, we need better task descriptions and stronger proof requirements.

### Step 5: Submit proof (`pc do`)

**Error handling is critical here.** The three expected errors are:
1. "already claimed" — skip (benign, means another heartbeat already got it)
2. "task fully claimed" — skip (all slots taken)
3. Storacha upload failure — retry once, then skip

**After testing:** Are there other errors we're not handling? Monitor real error logs for unexpected failure modes.

### Step 6: Continue or sleep

**Why cap at 5 tasks:** Prevents runaway loops. If there are 100 available tasks, the agent shouldn't try all 100 in one heartbeat — that could take hours and block other heartbeats.

**After testing:** Is 5 the right cap? Depends on task execution time:
- If tasks take 10s each → 5 tasks = ~1min, cap could be higher
- If tasks take 5min each → 5 tasks = ~25min, cap is reasonable
- If tasks take 30min each → cap should be 1–2

---

## Error Recovery Table

**Pattern source:** Sentry skill's retry-and-backoff pattern + Vercel's "retry_count" field.

**Why consecutive_errors threshold:** Three strikes = cooldown. This prevents the agent from hammering a broken endpoint indefinitely.

**After testing:**
- Is the wallet file check necessary? Agents typically have persistent wallets.
- Should we add a "total errors" counter for long-term health monitoring?
- Does the agent actually implement the recovery logic, or does it ignore the table and just retry?

---

## General Notes for OpenClaw Testing

### How OpenClaw Processes HEARTBEAT.md

- [ ] Confirm: Does OpenClaw parse the frontmatter for `interval`?
- [ ] Confirm: Does OpenClaw execute the numbered steps sequentially?
- [ ] Confirm: Does the agent modify the State block between cycles?
- [ ] Confirm: What happens when two heartbeat cycles overlap?
- [ ] Confirm: Can the agent run shell commands from heartbeat instructions?

### State Persistence Questions

- [ ] Where does OpenClaw persist heartbeat state? (in the file? in memory? in a DB?)
- [ ] If the agent crashes mid-cycle, does it resume or restart?
- [ ] If state is in the file, does rewriting HEARTBEAT.md lose the frontmatter?

### Timing Questions

- [ ] Is the 30m interval measured from cycle-start or cycle-end?
- [ ] If a cycle takes 20m, does the next cycle start at 30m or 50m?
- [ ] Is there a max execution time per heartbeat cycle?

### Integration Questions

- [ ] Can the heartbeat access env vars set in the skill's config?
- [ ] Does the heartbeat have access to the same tools listed in SKILL.md?
- [ ] Can heartbeat output be monitored/logged by the agent framework?
