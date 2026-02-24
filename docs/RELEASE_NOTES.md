# Release Notes

## Unreleased

---

## 1.2.0 - 2026-02-24

### Added
1. Local exercise catalog matching for exercise info generation (instead of fully generating target muscles/coaching text from AI), including a curated multilingual exercise catalog and canonical 3-level muscle taxonomy for stable stats mapping.
2. Automatic exercise-info enrichment in the workout editor when exercises are added, renamed, or edited (with local cache reuse and local frontend fallback matching when the API route is unavailable).
3. Clickable multi-suggestion pills for ambiguous or fuzzy exercise names in the workout editor (e.g. multiple triceps pushdown variants).
4. One-time background backfill for existing users that fills missing exercise infos and missing catalog match metadata for template exercises without opening the workout editor.

### Changed
1. Exercise info popups now display the matched catalog exercise name as the dialog title to make mismatches easier to spot.
2. Exercise target-muscle rows now use user-friendly middle/detail muscle labels with lighter secondary detail text in-line.
3. Workout-editor notes labels no longer show the note icon (the icon remains available in active session views).
4. Privacy copy now mentions that exercise names may be sent to an AI API for matching in future/optional fallback scenarios, while workout import copy keeps the short AI-processing notice.

### Fixed
1. Automatic exercise-info assignment no longer overwrites newer workout-editor input state after async matching responses (race-condition fix).
2. Auto-matching retries no longer loop continuously for unchanged non-matching exercise names, which stopped save-button disabled/enabled flicker.
3. Fuzzy exercise matching now handles simple typos better (e.g. missing letters) via additional character-similarity scoring.

## 1.1.1 - 2026-02-24

### Added
1. Workout editor now asks in an in-app dialog before removing and regenerating exercise AI info when all exercises already have info.

### Changed
1. Exercise-info generation wording now frames the action as creating info with AI (instead of loading) and adds a short UI notice that workout data is briefly sent to an AI API for processing.
2. Muscle-groups empty-state hint copy was rewritten, centered, and padded directly inside the card for clearer guidance.
3. AI import privacy hint no longer claims that submitted text is not stored permanently.

### Fixed
1. Exercise-info AI prompts now enforce the selected app language more explicitly, including informal German (`du/dein`) in generated execution tips and coaching tips.

## 1.1.0 - 2026-02-24

### Added
1. Weekly goals (workouts, calories, weight volume) in personal settings, including progress cards in the weekly statistics view.
2. Starter workout action now seeds two sample workouts (Upper Body / Lower Body) for quicker onboarding and testing.
3. Weekly statistics now include total workout duration, plus an optional weekly duration goal in personal settings and stats progress cards.
4. Completed session history editing now supports changing session start and end date/time after the fact.
5. Exercise info enrichment via Groq: per-exercise target-muscle weighting + execution/coaching tips with reusable info popups in workout editor, active session, and history views.
6. Weekly Data view now includes a muscle-group radar visualization (Reps/Sets/Weight modes) plus a radio-style weekly session timeline (Mon-Sun axis with clickable session markers).
7. Home workout cards now show an estimated workout duration (based on template sets/reps plus configured rest-timer duration) and can highlight a recommended next workout when no workout was tracked today and no session is active.
8. Home view now includes a compact "My Weekly Goal" section with a dropdown to choose one weekly goal progress card.

### Changed
1. Settings UX was refactored and polished with reusable card/title patterns, additional icons, and animated reveal/hide behavior for timer duration and weekly-goal inputs.
2. Bottom-tab active states now map nested views to their parent section tabs (e.g. workout editor -> Workouts, workout history -> Statistics, legal/privacy -> Settings).
3. `×2` exercise labels now use the multiplication symbol consistently, and the workout-editor toggle moved next to the sets section.
4. Long exercise names now stay left-aligned when wrapping in editor, active session, and history cards.
5. German completion action text was clarified from "Session übernehmen" to "Werte übernehmen".
6. Import screen wording and layout were simplified: clearer "text-only" Gymtracker-KI path vs. "Aus Datei erstellen" (own AI + prompt + JSON paste flow), with renamed JSON-processing action text.
7. Dashboard "Meine Workouts" now places the add-workout action as a compact secondary button in the section header instead of a full-width button at the bottom.
8. Exercise info popup typography and action placement were refined (smaller, denser content; cleaner icon placement in exercise cards).
9. Statistics screen was retitled to "Wochendaten" / "Weekly Data" and reorganized into cleaner sections (summary tiles, Sessions, Weekly Goals, Muscle Groups) with separator lines and less nested card chrome.
10. Active session screen now has compact top-right discard/complete icon actions and a smaller inline "Add exercise" button.
11. Session header set-progress badge is now tappable and marks the next set below the lowest already-completed set (instead of the first unchecked set globally).
12. Dashboard routing now uses feature-specific entry files (`HomePage`, `WeeklyDataPage`) and shared weekly-statistics helpers were extracted from the dashboard page into `weekly-data-utils`.
13. Settings app tab order now shows the locker-note toggle before the rest-timer card; weekly-goal inputs were cleaned up (no placeholders, workout-goal unit suffix), and the backup import hint text was simplified.
14. Session-edit dialog now uses a compact save action in the header (top-right) instead of the default close icon.

### Fixed
1. Local `npm run dev` now serves in-repo `/api/ai-import` and `/api/exercise-info` handlers through Vite middleware, so AI features work during development with `.env` keys.
2. Exercise-info loading no longer shows a false error toast when data was successfully fetched and merged; the loader now skips exercises that already have stored info.
3. Weekly muscle-group stats now resolve exercise AI info more robustly for historical sessions by falling back to current template data via `(workoutId + exerciseName)` when template IDs changed after edits.
4. Backup export/import schema now preserves `x2Enabled` on template exercises and session exercise sets.

### Docs
1. Agent notes were consolidated into `docs/AGENTS.md` (root `AGENTS.md` kept as a small shim).
2. `docs/IMPLEMENTATION_PLAN.md` and `docs/IMPLEMENTATION_STATUS.md` were consolidated into `docs/PROJECT_STATUS.md`.
3. `README.md` was refreshed to reflect current features, starter workouts, weekly goals, and docs layout.
4. `docs/TODO.md` backlog and done items were updated to reflect duration goals, session timing edits, exercise-info enrichment, and local dev API middleware support.

## 1.0.0 - 2026-02-24

### Added
1. `2x` exercise flag support across workout templates, active sessions, and session history (including subtle `2x` tags in the UI).
2. `2xEnabled` import support in the JSON import schema, repair pipeline, prompt templates, and direct Groq AI import instructions.
3. Dedicated bottom-tab navigation with tabs for Workouts, Statistics, Settings, plus a contextual active-session tab when a session is running.

### Changed
1. App layout now uses a persistent mobile-style floating bottom tab bar and a unified top title row with route-aware icons/titles.
2. Dashboard was split into separate Workouts and Statistics views, with weekly stats moved to `/statistics`.
3. Footer content (GitHub/legal/privacy) moved out of the global shell and now appears in Settings only.
4. Weekly/statistical calculations now respect the `2x` flag for set count, reps, total volume, and calorie estimates.
5. Calorie values in dashboard/history are now prefixed with `~` to clarify they are rough estimates.
6. Starter full-body workout marks the biceps exercise as `2x` by default.
7. Active session behavior is now single-session-only: starting another workout while a session is active resumes the existing active session instead.
8. Header rest timer and set-progress indicators were restyled into compact boxed widgets with bottom-edge progress bars.

### Fixed
1. Bottom-tab active-state width animation no longer causes the whole bar to "breathe" during transitions (fixed slot widths).

### Docs
1. `TRAINING_PLAN_IMPORT_SCHEMA_V1.json` now documents the optional `x2Enabled` boolean field for imported exercises.

---

## 0.5.2 - 2026-02-23

### Added
1. Dashboard empty state now shows an intro chooser with explicit actions: use starter workout, create a workout, or import workouts with AI.
2. Dashboard intro now includes a less prominent "existing data" path to Settings, so users can find the backup import flow after switching app contexts/devices.

### Changed
1. Starter workout is no longer auto-seeded on app launch or after full reset; users return to the empty-state intro flow until they choose an option.
2. Workout editor (edit view) now exposes a save action in the top header and uses a separator-style footer action area (matching session action placement more closely).
3. Workout editor save/delete buttons were visually aligned with session actions (including icons); delete remains red.
4. Settings tabs now use the same trigger layout pattern as the import page for consistent active-state alignment.
5. Settings page version line no longer includes the legal link (legal page remains reachable from the global footer).
6. Dashboard/import wording updated to "Workouts mit KI importieren" / "Import workouts with AI".
7. iPhone homescreen install hint dialog is temporarily disabled in the UI for now (implementation kept in code, commented for later reuse).

### Fixed
1. Weight-unit switching (`kg`/`lb`) was hardened against duplicate conversion when concurrent settings updates occur.
2. Settings export/import action icons now match their labels (previously swapped).

### Docs
1. Technical spec, handoff guide, status, and backlog were updated to reflect the explicit intro-based starter-workout flow (no auto-seeding).
2. `IMPLEMENTATION_PLAN.md` is now marked as a historical planning snapshot; active tracking remains in status/backlog docs.

## 0.5.1 - 2026-02-22

### Added
1. Legal page (`/legal`) with full Lucide ISC license text, Apache-2.0 attributions (Dexie.js, class-variance-authority), and MIT attributions for all other runtime dependencies; linked from global app footer and settings page.
2. Dashboard: discard-session confirmation dialog — trash button on active workout cards now requires explicit confirmation before discarding.
3. Import button added to dashboard alongside "Workout hinzufügen" in both the empty state and at the bottom of the workout list.

### Changed
1. Settings page fully redesigned: added page title with Settings icon; Satzpausen-Timer card moved to first position; Sprache and Einheit cards displayed side-by-side at medium breakpoint; new "Datenverwaltung" section heading with Database icon; all cards now have matching lucide icons (Timer, Globe, Weight, SunMoon).
2. Update-safety notice is now dismissable with an X button; dismissal ID persisted in localStorage so the banner does not reappear after page reload.
3. Import page restructured: page title moved outside the card; tabs renamed to "Aus Text erstellen" and "Aus Datei erstellen"; "Datei hochladen" tab removed; AI-tab description no longer mentions PDFs.
4. Session history page: page title now shows "Session-Verlauf" with ChartNoAxesCombined icon; workout name demoted to subtitle beneath the title.
5. Dashboard empty state replaced with plain outline buttons matching the non-empty list style.
6. Import button removed from non-session header (Home + Settings buttons remain).
7. Legal link added to global app footer.

### Fixed
1. `ensureDefaultWorkout` no longer re-seeds the default workout after the user manually deletes all workouts. A localStorage flag (`gymtracker:default-workout-seeded`) is set on first successful seed and cleared only by "Alle Daten löschen". The flag is set synchronously before the async Dexie write to prevent React StrictMode double-invocation from creating two default workouts.

---

## 0.5.0 - 2026-02-22

### Added
1. Dark mode with Light / Dark / System selector in settings.
2. Default full-body machine workout on first launch and after full data reset (Beinpresse, Brustpresse, Latzug, Schulterdrücken, Bizepscurl, Trizepsdrücken – 3 × 12).
3. Apple-touch-icon (180 × 180 PNG) for iOS homescreen; gray favicon works on both light and dark browser chrome.

### Changed
1. AI import is now the primary (default) tab; wording and description simplified for non-technical users.
2. AI generation auto-validates the result – no extra "Vorschau anzeigen" click needed.
3. KI backend switched from OpenAI to Groq (`llama-3.3-70b-versatile`). Set `GROQ_API_KEY` in Vercel → Settings → Environment Variables (key from console.groq.com).
4. Satzpausen-Timer renamed and now shows a short description in settings.
5. Timer in header always shows the elapsed time; pause state indicated by Pause/Play icon next to the time.
6. Home button replaces the Plus button in the top-bar navigation; new workout starts via dashboard.
7. New exercises default to 3 sets; notes textarea uses 2 rows.
8. Exercise and workout name inputs now show localised placeholder text.
9. Workout editor navigates to home after saving (both create and edit).
10. Dumbbell icon next to workout name in active session page; History icon in session history subtitle.
11. "Workout hinzufügen" button added at the bottom of the dashboard workout list.

## 0.4.2 - 2026-02-22

### Changed
1. Header timer now uses a compact progress-bar style matching the set-progress component.
2. Timer color mapping updated:
- green while in target range,
- orange after exceeding the configured rest duration.
3. Timer and set-progress rows now share aligned typography/spacing for visual consistency.
4. Timer pause state now uses localized text labels (`Pausiert` / `Paused`) instead of an icon.

## 0.4.1 - 2026-02-22

### Added
1. Session history now supports per-session edit and delete actions (with confirmation for delete).
2. Session history cards now include basic workout stats per entry (exercises, sets, repetitions, weight).
3. Dashboard now shows total completed workouts for the current week.

### Changed
1. Rest timer moved into the top bar next to set progress.
2. Timer can be paused/resumed by tap and resets automatically when a new set is checked.
3. Active session header now shows "since ..." inline with status badge and right-aligned last-session info.
4. Footer copy is now localized (DE/EN) and keeps the GitHub credit link.
5. Homescreen icon fallback simplified to favicon-only setup (removed extra icon asset).

## 0.4.0 - 2026-02-22

### Added
1. Session history page per workout with dashboard entry point.
2. Direct AI import flow (`/api/ai-import`) with server-side secret usage.
3. Full active-session lifecycle UX:
- resumable autosaved sessions,
- explicit discard flow,
- completion dialog with optional template overwrite.
4. Configurable rest timer duration in settings (2/3/5 minutes).

### Changed
1. Dashboard now separates active sessions from other workouts and improves card action layout.
2. Session and workout editor inputs were refined for mobile:
- decimal-friendly blur validation,
- stronger select-on-focus behavior,
- clearer inline value hints.
3. Settings now include full data reset, full backup export/import, and update-safety snapshot restore controls.
4. Monochrome Vercel-like styling pass with subtle shadows, pill actions, and tighter card consistency.
5. Weight unit switching now converts persisted template/session weights (`kg`/`lb`) instead of relabeling.

## 0.3.0 - 2026-02-21

### Added
1. Automatic update safety snapshots on first launch after a version change (keeps up to three rollback points).
2. Settings UI section to restore the latest update safety snapshot if a rollout causes data issues.

### Changed
1. Dexie schema upgraded to v3 with `updateSafetySnapshots` table for operational rollback support.
2. Backup metadata now references a central DB schema version constant.

## 0.2.0 - 2026-02-21

### Added
1. Full app data export as portable JSON backup (`settings` + all workout/session data).
2. Full app data import from backup file with schema validation and overwrite confirmation dialog.
3. Version display in settings screen.

### Changed
1. Settings data reset now uses in-app dialog styling instead of browser-native confirmation.
2. Agent handoff docs now include mandatory version bump policy for every commit.

## 0.1.0 - 2026-02-21

### Added
1. Initial public V1 baseline with workouts, sessions, JSON plan import, local persistence, PWA support, and DE/EN settings.
