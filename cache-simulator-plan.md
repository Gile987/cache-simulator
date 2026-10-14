# Cache Eviction Playground — LLM implementation brief

Build a small, polished Angular application following this brief. Inspect the workspace and repository instructions first; reuse an existing application or scaffold a new one if needed. Implement the working MVP rather than returning another plan. Make routine decisions independently and ask only about genuine blockers. Do not deploy.

## 1. Goal

Create an interactive, visual simulation of a cache with limited capacity. Users insert named items, access them, and see which items are evicted under FIFO, LRU, or LFU. Every eviction must have an understandable explanation.

This is an educational simulation in browser memory. It does not inspect or modify the browser's actual HTTP cache, Cache Storage, or localStorage. Display this distinction briefly in the interface.

## 2. Stack and constraints

- Use Angular 22.2.2, the latest stable version verified for this project on 2026-10-13. Exclude prerelease builds. Use compatible Angular CLI/packages, Node.js, and TypeScript; verify their engine and peer requirements before installation. Official references: https://github.com/angular/angular/releases and https://angular.dev/reference/versions.
- Standalone components, Signals, computed state, OnPush change detection, and @if/@for with stable tracking keys.
- Strict TypeScript and Angular template checking. No any, unsafe double assertions, or non-null assertions used to silence errors.
- Use native HTML controls and SCSS. No UI framework, chart library, canvas, or animation library is necessary.
- Keep the simulation engine in pure TypeScript, independent of Angular.
- No source-code comments unless requested; explain design decisions in the README.
- No backend, accounts, external APIs, persistence, NgRx, or unnecessary RxJS.
- Use the CLI-generated compatible testing setup and commit the package lockfile.

## 3. MVP scope and interface

One page with four sections:

### Configuration and controls

- Strategy selector: FIFO, LRU, LFU, with a short explanation of the selected strategy.
- Capacity input, initially 10 abstract units.
- Item key and size inputs, plus Add item.
- Access-key input and Access button. This lets users access missing keys as well as existing items.
- Reset simulation and Load guided example actions.

Capacity and size must be safe integers between 1 and 100 inclusive. Units are abstract weights, not bytes or measured memory usage. Trim keys, require 1–40 characters, and match keys case-sensitively. Duplicate keys are rejected rather than updated in the MVP. A key can be reused after eviction.

### Cache visualization

- A segmented capacity bar: each segment's width represents its item's size divided by capacity; unused capacity stays visibly empty.
- Below it, readable item cards in insertion order with key, size, insertion step, last-access step, and access count. Cards include an Access button.
- Keep text in cards, not inside potentially tiny bar segments. Do not rely on color alone to identify items.
- Show used capacity as a number, for example 7 / 10 units.
- Show an explicit empty state.
- Show a separate ordered list labeled “Eviction priority,” with the first candidate clearly identified. Its ordering must reflect the selected strategy without rearranging the insertion-order cards.
- Explain that the list is evaluated if an insertion needs room; it does not mean an item will be removed immediately.

### Statistics

- Hits, misses, hit rate, and total eviction count.
- Only explicit Access operations count as hits or misses. Insertion is not an access request.
- Show hit rate as an em dash before the first access and as a percentage with one decimal place afterward.

### Event log

- Show the most recent 50 operation events, newest first, with logical step numbers and plain-English outcomes.
- Each insertion event lists any evictions in their actual order and explains why they were selected.
- Example: “Added D (4 units). Evicted A (3 units) because it was the least recently accessed item. Usage: 10 / 10.”
- If multiple items must be evicted, show all of them in that operation's event.
- Access events show hit or miss. Strategy changes are logged too.
- Keep validation errors next to controls; invalid operations do not enter the log.

Use a clean developer-tool layout, responsive columns that stack on narrow screens, visible keyboard focus, accessible labels, and a polite status region for operation summaries. Render item keys through Angular interpolation, never innerHTML. Avoid elaborate animation and drag-and-drop.

## 4. Exact simulation semantics

### State and time

Use a deterministic logical step counter instead of Date.now(). Start at 0 and increment once per accepted insertion, explicit access (including a miss), or actual strategy change. Invalid operations and selecting the current strategy are no-ops. Reset returns the step to 0.

Each cache entry stores a key, size, insertionStep, lastAccessStep, and accessCount. On insertion, insertionStep and lastAccessStep equal the current operation step; accessCount starts at 0. Access count represents explicit successful accesses, not insertion.

Use readonly models where practical, a Strategy string union, typed commands, and discriminated operation-result/event unions. Model cache entries with a Map or an entry list rather than using untrusted keys as plain-object properties. Do not mutate caller-owned input state.

### Add item

1. Validate the key and size, reject duplicate resident keys, and reject items larger than the current capacity.
2. All validation happens before advancing time or changing state. A rejected insertion must never evict anything.
3. If there is sufficient free space, insert the item without evictions.
4. Otherwise, evict existing items one at a time according to the active strategy until the new item fits.
5. Insert the new item only after making room, so it cannot be selected as its own eviction victim.
6. An exact fit is allowed. Never let used capacity exceed capacity.

### Access item

- Resident key: increment hits, increment that entry's accessCount, and set lastAccessStep to the operation step. Do not change insertionStep or size.
- Missing key: increment misses; do not insert anything automatically.
- Empty/invalid key: validation error, not a miss.
- Update frequency and recency metadata under every strategy, so switching strategies uses the real session history.

### Eviction ordering

These are the explicit conventions of this simulator; LFU implementations can use other tie-breakers.

| Strategy | First eviction candidate | Tie-breakers |
| --- | --- | --- |
| FIFO | Smallest insertionStep | Key in ascending code-unit order |
| LRU | Smallest lastAccessStep | Smallest insertionStep, then key |
| LFU | Smallest accessCount | Smallest lastAccessStep, then insertionStep, then key |

FIFO ignores accesses when deciding eviction priority. LRU uses insertion as initial recency until an entry is accessed. LFU frequency is counted only during the entry's current residency; an evicted-and-reinserted key starts fresh. Do not add aging, TTL, size-weighted priority, or optimal packing. Size determines how much room must be freed, not which victim ranks first.

Use one shared priority function for both actual eviction and the visible priority list so the explanation cannot disagree with the engine.

### Strategy changes, capacity, and reset

- In manual mode, switching strategy preserves entries, metadata, capacity, and counters; it changes subsequent eviction decisions and the priority display. Log the switch as one step.
- Capacity can be edited only while step is 0. Lock it after the first accepted operation and explain “Reset to change capacity.” Validate and apply capacity before an operation is accepted.
- Reset clears entries, counters, errors, step, log, and guided-example state, retaining the selected strategy and last valid capacity.
- Do not add manual item deletion or item resizing in this version.

## 5. Guided example

Include one deterministic example with a Next step button. Loading it resets simulation data, sets capacity to 10, retains the selected strategy, and displays the following queue. Do not execute the steps automatically.

| Step | Operation |
| --- | --- |
| 1 | Add A, size 3 |
| 2 | Add B, size 3 |
| 3 | Add C, size 3 |
| 4 | Access A |
| 5 | Access A |
| 6 | Access B |
| 7 | Access C |
| 8 | Add D, size 4 |

Expected behavior at step 8:

- FIFO evicts A because it was inserted first.
- LRU evicts A because its last access was at step 5, before B at 6 and C at 7.
- LFU evicts B: A has 2 accesses, B and C have 1 each, and B is less recently accessed than C.
- Exactly one item is evicted and capacity becomes 10 / 10 under every strategy.
- Access statistics are 4 hits, 0 misses, and 100.0% hit rate.

While the example is loaded, disable manual Add/Access, capacity editing, and strategy switching. Keep Reset and Load guided example available. Mark completed steps and the next pending step. Disable Next step after completion and show “Example complete.” To compare another policy, Reset, change strategy, and load the example again. Keep this workflow explicit; do not build simultaneous simulations in the MVP.

## 6. Suggested architecture

- Simulator page/container: Signals for simulation state, forms, validation, and example progress; computed usage, statistics, and priority.
- Cache-view component: segmented bar and item cards, emitting typed Access actions.
- Event-log component: typed event presentation.
- Small pure TypeScript engine: models, validation, priority calculation, transitions, and guided-example commands.

Split further only when it improves readability. No routing is necessary unless already present. No service is required just to wrap pure functions. Store counts and metadata once; derive used capacity, hit rate, and priority rather than maintaining duplicate mutable values.

## 7. Build sequence

### Phase 1 — Engine

Inspect project/tooling, define models, implement validation and deterministic state transitions, and test the policy rules. Use straightforward sorting and loops; cache capacity is deliberately small, so linked lists and heaps are unnecessary.

### Phase 2 — Manual playground

Build controls, visualization, priority list, statistics, errors, and event log. Verify all manual actions and reset behavior.

### Phase 3 — Guided example and polish

Add the step-by-step example, responsive styles, keyboard access, and operation announcements. Run focused tests and a production build. Document setup commands, simulation conventions, and limitations in a concise README.

Complete the phases without stopping for approval after each. Report any environment/tooling blocker honestly. Do not claim tests passed if they could not be run.

## 8. Verification and acceptance criteria

Engine tests:
- Insertion without eviction and exact-capacity fits work.
- An insertion can evict multiple items in the correct order until sufficient capacity is available.
- Oversized, invalid, and duplicate insertions leave the entire state unchanged, including step, counters, and events.
- Hits update recency/frequency; misses do not insert entries.
- FIFO priority is unaffected by access; LRU moves accessed entries later in priority; LFU honors frequency and its tie-breakers.
- Evicted-and-reinserted entries get fresh metadata.
- Strategy switches preserve contents and history and recalculate priority.
- Special keys such as __proto__ behave like ordinary keys.
- Guided example produces the exact outcomes above under all three strategies.
- Zero-access hit rate is handled without NaN or division by zero.
- Capacity invariants hold, transitions do not mutate their input, and the event log retains only the latest 50 events without resetting lifetime counters.

Focused UI checks:
- Add/Access controls work and show field-specific validation errors.
- Capacity locks after the first accepted operation and unlocks after Reset.
- Priority display agrees with the next actual eviction.
- Guided-example controls advance one operation at a time and enforce their disabled states.
- Reset returns to an empty, usable manual playground.
- Narrow-screen layout, keyboard navigation, and status announcements work.

Done means a working installable app, passing meaningful tests, a successful production build, a usable guided example, and a README explaining how to run it. Finish by reporting implementation summary, verification commands/results, and remaining limitations.

## 9. Explicitly deferred

No side-by-side strategy comparison, automatic playback, undo, timeline scrubbing, TTL, cache warming, random workload generation, real browser-cache integration, exports/imports, persistence, custom policies, or deployment. Finish the small manual simulator and guided example before expanding it.
