# Cache Eviction Playground

An educational Angular app that simulates a fixed-capacity cache in browser memory. You add named items, access them, and watch FIFO, LRU, or LFU decide which items are evicted, with a plain-English explanation for every eviction.

> This is a teaching simulation held in browser memory only. It does not read or change your browser's real HTTP cache, Cache Storage, or localStorage.

## Requirements

- Node.js 22.23.3 (verified)
- npm 10.9.9 (verified)
- Angular 22.2.2 and its CLI/build packages
- TypeScript 6.0.x (installed by the Angular CLI)

The lockfile (`package-lock.json`) is committed so installs are reproducible.

## Setup and commands

```bash
npm install          # install dependencies
npm start            # dev server at http://localhost:4200
npm run build        # production build into dist/
npm test             # Vitest in watch mode
npm run test:run     # run the test suite once
npm run format       # format supported files with Prettier
npm run format:check # verify formatting without writing
```

Tests and formatting use the installed CLI-generated Vitest and Prettier setups.

## How to use it

1. Choose a strategy (FIFO, LRU, or LFU) and a capacity. Capacity can only be changed while the simulation is at step 0; after the first accepted operation it is locked until you reset. Before accepting the first Add, Access, or strategy change, the app validates and applies the capacity currently entered, even if the field has not lost focus. Invalid capacity blocks the operation and stays editable so you can correct it.
2. Add items with a key and a size, and access keys (existing or missing) with the Access controls or the per-card buttons. Submit either form by pressing Enter in its fields or clicking its submit button; each submission performs one operation without reloading the page.
3. Watch the segmented capacity bar, the insertion-order item cards, the separate "Eviction priority" list, the statistics, and the event log.
4. Use **Load guided example** for a deterministic eight-step scenario, then advance it one step at a time with **Next step**.

### Meet Byte and take a tour

Byte, the cache keeper, welcomes you whenever the page loads. Choose **Start tour** to follow 14 short explanations of the controls and results. The current area stays clear with a border while the surrounding page darkens. The `$$` badge is temporary artwork for Byte; capacity still represents abstract space, not money.

Use **Back** and **Next** at your own pace, or leave with **Skip tour**, **Finish tour**, or Escape. **Take a tour** in the header restarts the introduction. The tour preserves your current entries, drafts, validation feedback, statistics, and guided-example progress. Highlighted controls are inactive during the modal tour; you can try them after closing it.

On narrow screens, the explanation moves into a bottom sheet and its text can scroll. On extremely short screens, the explanation takes priority over a spotlight that cannot fit. Tab into the explanation to scroll it with the keyboard. If the browser cannot open a native modal dialog, the same content appears as ordinary closable help without blocking the simulator. Dismissal is not stored, so refreshing shows the welcome again.

## Simulation conventions

- **Logical time.** A deterministic step counter starts at 0 and increments once per accepted insertion, explicit access (including a miss), or actual strategy change. Invalid operations and re-selecting the current strategy are no-ops.
- **Entries.** Each entry stores `key`, `size`, `insertionStep`, `lastAccessStep`, and `accessCount`. Access count tracks explicit successful accesses, not insertion. Frequency and recency are recorded under every strategy so switching strategies uses real history.
- **Validation.** Keys are trimmed, must be 1–40 characters, and are matched case-sensitively. Sizes and capacity are whole numbers from 1 to 100. Editing a field clears its previous error while preserving errors on other fields; the next submission validates it again, and capacity is also validated when its field changes. Once capacity is valid, Add checks key and size together so both input errors can appear in one attempt. Clearing an error while editing does not accept an operation or change simulation state. Duplicate resident keys and items larger than capacity are rejected, and a rejected insertion never evicts anything. Keys can be reused after eviction.
- **Add.** With free space, the item is inserted with no evictions. Otherwise, items are evicted one at a time according to the active strategy until the new item fits, and the new item is inserted only afterward so it cannot evict itself. Exact fits are allowed and usage never exceeds capacity.
- **Access.** A resident key is a hit that updates `lastAccessStep` and `accessCount`. A missing key is a miss and nothing is inserted. An empty or invalid key is a validation error, not a miss.
- **Statistics.** Only explicit access operations count as hits or misses. The hit rate is shown as an em dash before the first access and as a percentage with one decimal afterward. The eviction count is a lifetime counter.
- **Event log.** The latest 50 events are shown newest first. Insertion events list every eviction in its actual order with the reason. Lifetime counters are not reset when older events fall out of the log.

### Eviction priority

The same priority function drives both real evictions and the visible priority list, so the explanation can never disagree with the engine.

| Strategy | First candidate           | Tie-breakers                                              |
| -------- | ------------------------- | --------------------------------------------------------- |
| FIFO     | Smallest `insertionStep`  | Key ascending                                             |
| LRU      | Smallest `lastAccessStep` | Smallest `insertionStep`, then key                        |
| LFU      | Smallest `accessCount`    | Smallest `lastAccessStep`, then `insertionStep`, then key |

FIFO ignores accesses. LRU treats insertion as the initial recency. LFU counts frequency only within an entry's current residency; an evicted-and-reinserted key starts fresh. There is no aging, TTL, size-weighted priority, or optimal packing.

### Guided example

Capacity is 10 and the selected strategy is retained. The eight steps are: Add A(3), Add B(3), Add C(3), Access A, Access A, Access B, Access C, Add D(4). At step 8, FIFO and LRU evict A, while LFU evicts B; usage becomes 10 / 10 and the statistics are 4 hits, 0 misses, and 100.0%. Manual controls stay disabled while the example is loaded; use **Reset**, change strategy, and reload to compare another policy.

## Architecture

- `src/app/cache-engine/` — pure TypeScript, independent of Angular: models, validation, priority calculation, state transitions, guided-example commands, and event descriptions.
- `src/app/components/cache-view/` — segmented capacity bar, insertion-order item cards, and the eviction priority list.
- `src/app/components/event-log/` — typed event presentation.
- `src/app/components/playground-controls/` — standalone Configuration and controls panel with native Add and Access forms, component-scoped styles, typed signal inputs, and typed draft-edit and operation outputs.
- `src/app/components/tutorial-tour/` — reusable Byte tour, typed step content, scoped target markers, pure spotlight geometry, and modal lifecycle with responsive positioning and focus restoration.
- `src/app/app.ts` — container that owns simulation state, raw form drafts, field errors, validation, and example progress, executes commands, and derives usage, statistics, and priority.

State is stored once and derived values (used capacity, hit rate, priority order) are computed rather than duplicated. The engine is written with straightforward sorting and loops because capacity is deliberately small; linked lists and heaps would add complexity for no benefit.

`PlaygroundControls` renders the parent's drafts and errors and emits edits and operation requests. `App` keeps a single source for draft and error state so capacity validation, card accesses, Reset, and guided mode stay coordinated. Draft updates replace their objects rather than mutating inputs. Form submission requests execution; the parent clears only the submitted fields after an explicit successful command result and preserves them on rejection.

Each visible field error has a stable ID and is associated with its input through `aria-describedby`, allowing assistive technology to identify the error as that field's description. The association is removed when the error disappears, including while correcting a draft. Existing labels, `aria-invalid`, and error alerts remain in place.

All engine commands, including Reset and guided steps, use one execution path in `App`. The engine returns an explicit success or failure: success includes the updated snapshot and the event produced by that command, or `null` when no event was produced; failure includes the original snapshot and validation issues. Status announcements use only the returned event, so an accepted no-op cannot announce an old log entry. Guided progress advances only after success; a rejected step remains available for retry, and retrying clears the previous validation feedback.

## Tests

`npm run test:run` (or `npx ng test --watch=false`) runs:

- **Engine tests** — insertion without eviction, exact fits, multi-item eviction order, rejected operations leaving state untouched, hit/miss behavior, all three priority policies and their explicit comparator tie-breakers (including key comparison), strategy-specific eviction reasons, fresh metadata after re-insertion, strategy switches, trimmed and case-sensitive keys, `__proto__` as an ordinary key, the guided example under every strategy, zero-access hit rate, capacity invariants, input immutability including during a real eviction, the 50-event log cap, explicit command outcomes with rejection recovery and event-free success, and unknown commands and strategies throwing without changing caller-owned state.
- **UI tests** — controls-component requests, raw draft edits and input immutability, submission cancellation, disabled controls, stable field-error descriptions with no references to absent errors, and parent integration for add/access flows, simultaneous Add errors, independent error clearing and description removal on editing, capacity locking and reset, rejected-draft recovery, duplicate-key and oversized-item revalidation, card access, the displayed eviction priority and its metrics after strategy changes, no-op status handling, and the guided-example step controls including rejected-step retry.
- **Tutorial tests** — automatic welcome, every step and target, Back/Next/Skip/Finish/replay, dismissal and focus recovery, missing targets, guided-mode and empty-state explanations, listener/observer cleanup, unsupported/refused dialog recovery, stale close events, coalesced measurements, and preservation of manual and guided simulation state. Pure geometry cases cover placement on all four sides, clipping, visible-viewport offsets, narrow and short screens, and invalid measurements. Dialog and layout mocks verify orchestration; native modality, real focus containment, and visual alignment require the manual browser checks below.

### Manual browser checks

Browser checks are performed manually by the user; automated verification uses the existing unit tests and production build.

First check Byte's welcome and choose **Skip tour** before following the simulator checks below. For the complete tutorial checks, use the [tutorial manual checklist](TUTORIAL-PLAN.md#10-manual-browser-checklist-for-the-user). In particular, replay after entering drafts or advancing the guided example; verify the highlighted region and explanation at desktop and 390 px widths, at 200% zoom, and in a short landscape viewport; check Tab/Shift+Tab containment and Escape; and confirm no highlighted Add, Reset, or Load button can be activated through the overlay.

1. Run `npm start` and open `http://localhost:4200/`. Check the Configuration and controls panel at desktop width and a narrow width around 390 px. Fields and buttons should remain usable without horizontal scrolling. Use Tab to confirm visible keyboard focus.
2. Enter capacity `0`, key `A`, and size `3`. Press Enter in the Add key field. Expect a capacity error, retained drafts, no cache entries, and no logged operations. Correct capacity to `10` and press Enter in the size field. Expect one item and one Step 1 event, cleared Add fields, locked capacity, and no page reload.
3. Enter `A` and size `3` again and click Add item. Expect a duplicate-key error, retained drafts, and no new event. Change the key to `B` and press Enter. Expect one additional entry and event, cleared Add fields, and no remaining Add error. Also check empty, fractional, and out-of-range sizes display the app's custom errors without adding an item.
4. Enter `A` in Access and press Enter. Expect exactly one hit and one new event. Click Access with a missing key and expect exactly one miss. Enter another Access draft and click a resident card's Access button: expect a hit while the Access draft stays intact. Submitting an empty Access key should show an error without recording a miss.
5. Click Reset simulation. Expect empty entries and statistics, cleared drafts and errors, and an editable capacity retaining its last accepted value. Set capacity to `20` and leave the field, then enter `0` and attempt Add. Reset again and confirm capacity returns to `20`.
6. Select LFU and click Load guided example. Expect capacity `10`, cleared errors, and disabled manual inputs and submit buttons with visible disabled styling. Advance all eight steps: expect B evicted, usage `10 / 10`, four hits, zero misses, and a disabled Next step button. Reset should restore enabled manual controls.
7. After a successful Add, select the current strategy again. Expect no new event or step and the existing status to remain unchanged. Submit a duplicate key or an empty Access key: expect the appropriate field error while the previous successful status remains. Correct the draft and submit: expect one new event, cleared submitted fields, and a status describing that operation. Reset should clear the log and show the reset message.
8. Run the guided example under FIFO, LRU, and LFU, resetting between runs. Confirm priority metrics show insertion steps for FIFO, last-access steps for LRU, and access counts for LFU. At the final step, FIFO and LRU should evict A and LFU should evict B. Check that insert, hit, miss, and strategy-change log messages and status descriptions still match their operations, and that key, size, Access, and capacity errors appear beside the appropriate controls.
9. Reset and set Capacity to `10`, leave Add key and size empty, and click Add item. Expect both field errors and no new event. Type `A` into Key: its error should disappear while the size error stays. Enter `1.5` into Size: its previous error should disappear; submitting should show a whole-number error without adding an item. Correct Size to `3` and submit: expect one insertion and cleared Add fields. Try adding `A` again: after a duplicate-key error, add a trailing space to the key and confirm the error clears while typing but returns on submission. Changing the key to `B` should allow submission. Repeat error-and-correction checks for Access and editable Capacity, confirming edits alone never record an operation.
10. Reset, leave both Add fields empty, and submit. Right-click the Add Key input and choose Inspect: it should have `aria-describedby="item-key-error"`, matching the ID on its error paragraph. Size should likewise refer to `item-size-error`. Type a key: its error paragraph and `aria-describedby` should disappear while Size retains its association. Correct Size and confirm its association disappears too. Repeat with empty Access and invalid Capacity (`0`), checking `access-key-error` and `capacity-error`. If you use a screen reader, focus each invalid field and verify its error is available as the field's description; after editing, the old error should no longer be that field's description. Use Tab and Shift+Tab to confirm the controls retain keyboard focus feedback.

## Design decisions

- The engine is pure and framework-free so its rules can be tested directly and the UI only renders state.
- A single shared priority function backs both eviction and the priority list to keep them consistent.
- One logical step counter replaces wall-clock time so runs are deterministic and reproducible.
- Signals with OnPush change detection and `@if`/`@for` with stable tracking keys keep rendering predictable.
- Native HTML controls and SCSS avoid UI, chart, canvas, and animation dependencies.
- Byte's tour uses one native modal dialog with a transparent backdrop and four dim panels around the measured target. Dedicated `data-tour` markers keep targeting independent of presentation classes and tests. Only tutorial view state changes; the engine and command path are reused without tutorial-specific behavior. Render callbacks and coalesced animation frames schedule measurement; observers, listeners, temporary scroll styles, and focus are cleaned up on dismissal and destruction. The component reserves temporary document space so even targets near the page bottom can scroll above the explanation sheet.
- Add and Access use separate native forms with Angular submit listeners that prevent page navigation. Signal drafts retain raw input strings for custom validation; `novalidate` lets the app show its own field errors for invalid numeric values.
- Controls use typed native template references to pass raw input `.value` strings and the strategy select element to their handlers. The draft handler retains disabled-field guards, and strategy changes retain validation and selection restoration. This avoids generic event-target parsing while preserving empty and numeric drafts, field errors, and parent-owned state.
- Event formatting is shared: the framework-free engine owns the access, strategy, unit, and usage descriptions, and the event log reuses them for its summaries while still rendering every eviction as its own structured list item. This keeps the status line, log summary, and pluralization consistent (a one-unit item or eviction reads `1 unit`) without coupling engine code to Angular.
- Command dispatch, history handling, eviction policies, displayed priority metrics, event summaries, access results, control requests, and validation routing use exhaustive switches with a shared framework-free `assertNever` guard. Adding an unhandled union member produces a compiler error at its handler; unexpected runtime values throw instead of silently using Reset, LFU, or another existing branch. Cases that share behavior remain grouped.
- Both application and test TypeScript configurations inherit `noUnusedLocals`, `noUnusedParameters`, and `noUncheckedIndexedAccess`. These checks catch unused declarations and require array lookups to account for missing entries. Access retrieves and guards the resident entry before updating its metadata, preserving the existing hit and miss behavior without type assertions.
- Type-only dependencies use `import type` or inline `type` modifiers, while components, Angular APIs, engine functions, and constants retain runtime imports. The shared configuration enables [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html) with the existing `module: preserve` setup, making import erasure explicit and requiring type-only imports for interfaces and aliases. Compatibility is verified through application and test compilation, the Angular production build, and the test suite.
- Supported strategies are declared once as a readonly `STRATEGIES` tuple, and the `Strategy` union is derived from it, so the type, the dropdown order, and the typed descriptions cannot drift apart. The numeric and key inputs reuse the shared validation constants (`MIN_VALUE`, `MAX_VALUE`, `MAX_KEY_LENGTH`) instead of repeating their literals, so changing a limit updates validation and the rendered controls together.
- Runtime dependencies are limited to the Angular packages the app imports (`core`, `common`, `compiler`, `platform-browser`), `rxjs`, and `tslib`. The unused `@angular/router` and `@angular/forms` packages were removed after the native-form decision; `@angular/common` and `@angular/compiler` remain because they are required and optional peers of the packages the app uses. `package.json` adds `format`, `format:check`, and `test:run` scripts so formatting and one-shot tests reuse the existing Prettier and Vitest tooling.

## Limitations and deferred work

- No side-by-side strategy comparison, automatic playback, undo, timeline scrubbing, TTL, cache warming, random workloads, real browser-cache integration, exports/imports, persistence, custom policies, or deployment.
- Capacity is abstract units, not bytes or measured memory.
