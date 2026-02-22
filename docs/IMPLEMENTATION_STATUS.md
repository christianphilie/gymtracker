# Implementation Status

## Completed
1. Project scaffold with Vite React TS.
2. Tailwind + monochrome tokenized styling.
3. shadcn-style UI primitives added locally.
4. Dexie schema and repository layer.
5. Dashboard with workout listing and session start.
6. Workout create/edit flow with exercise/set editor.
7. Active session flow with target/actual and set check-off.
8. Last completed snapshot per exercise in session view.
9. Import flow with:
- prompt copy,
- paste/file input,
- strict validation,
- conservative auto-repair,
- preview before import.
10. Settings page for language + weight unit.
11. PWA configuration and icons.
12. Runtime fix: `SettingsProvider` no longer writes in liveQuery context.
13. Router configuration stabilized for current React Router v6 type constraints.
14. Header navigation switched to icon actions in title bar (dashboard-only quick actions).
15. Active session progress indicator in header (`completed/total` + progress bar).
16. Dashboard now surfaces active sessions and supports resume behavior.
17. Session lifecycle implemented:
- autosave state in active session,
- discard flow (no history impact),
- completion dialog with optional template overwrite.
18. Session UX update:
- check icon controls,
- non-sticky completion actions,
- multiply sign (`×`) and unit inline inputs,
- previous-session extras shown as informational hints only.
19. Exercise/session note and icon polish in editor + session views.
20. Dexie schema v2 migration for session exercise model (`sessionExerciseKey`, template mapping, metadata snapshot).
21. PWA icon pack refreshed for homescreen usage (`pwa-192`, `pwa-512`, `apple-touch-icon`) with white background branding.
22. Deployment baseline added via `vercel.json` rewrite config for SPA routing.
23. Dashboard now separates active sessions from regular workouts with dedicated status and resume CTA.
24. Workout editor now supports full workout deletion with cascading cleanup of sessions/session sets.
25. Settings now include full data reset action (`clearAllData`) behind explicit confirmation.
26. Session/import UX polish:
- collapsible \"add exercise\" block,
- completion dialog footer wraps reliably on mobile,
- import page includes prompt guidance and explicit JSON upload label.
27. Previous-session hints now consider only completed (checked) sets.
28. Mobile zoom behavior constrained for app-like UX (manual zoom disabled + input focus zoom prevention).
29. Homescreen icon refreshed to match title-bar dumbbell mark on white background.
30. Header quick-action icons are now globally visible except during active session progress view; workout edit action bar is no longer sticky.
31. Workout deletion now uses in-app dialog styling instead of browser-native confirm UI.
32. App version is now surfaced in settings and sourced from `package.json`.
33. Full data portability flow added:
- export all IndexedDB data as JSON backup,
- import backup with schema validation,
- explicit overwrite confirmation before restore.
34. Release notes and versioning policy added for agent continuity.
35. Update-safety strategy added:
- automatic snapshot on first launch after version change,
- restore action in settings with confirmation,
- retention policy capped to the latest 3 snapshots.
36. UI refresh:
- light gray app background,
- white cards/buttons with subtle Vercel-like shadow,
- pill-shaped action buttons.
37. Session UX expansion:
- collapsible exercise cards,
- decimal-friendly iPhone inputs with select-on-focus and blur validation,
- inline target-vs-actual hints,
- remove set/exercise actions in active sessions.
38. Workout editor now supports:
- native drag-and-drop exercise reordering with handle icon,
- collapsible exercise cards,
- plus-only add actions with cancel flow.
39. Session history view added per workout (`/workouts/:workoutId/history`) and linked from dashboard cards.
40. Active-session dashboard cards now include icon-only discard action.
41. Header active-session status now includes:
- elapsed timer since latest check-off,
- auto-switch to completion flag action when all sets are done.
42. AI import endpoint added (`/api/ai-import`) with server-side secret usage (`OPENAI_API_KEY`) and UI tab integration.
43. Data model and repository were extended for:
- session history queries,
- robust weight-unit conversion during settings switch.
44. Weight unit switching now converts persisted weights across templates and session data.
45. Settings now support configurable rest timer duration (2/3/5 minutes) persisted in IndexedDB.
46. Session/workout editor inputs now use stronger select-on-focus behavior and larger inline value hints (`×`, unit, struck-through targets).
47. Dashboard workout cards were refined:
- last-session timestamp moved to top-right,
- history/edit controls grouped in card footer,
- filled play icon for start/resume CTA.
48. Notifications now use white cards and localized success copy for workout create/update actions.

## Open TODOs (Priority)
1. P0: Add automated tests (unit + integration) for import repair and session flows.
2. P0: Run full dependency vulnerability triage and patch/override where possible.
3. P1: Improve workout/session UX copy (final language review and tone consistency).
4. P1: Add empty/loading/error states consistently across all screens.
5. P1: Add optional delete/archive for workouts.
6. P2: Add migration test fixtures and rollback notes for Dexie schema v2.
7. P2: Add optional demo seed toggle for local development.
8. P2: Add automated backup restore tests (schema validation + DB integrity checks).
9. P2: Add tests for update-safety snapshot lifecycle (version change detection, retention cap, restore integrity).
10. P2: Add integration tests for drag-and-drop reorder and session history rendering.
11. P2: Add tests for weight-unit conversion correctness across template and session data.
12. P2: Add API contract tests for `/api/ai-import` error and success paths.

## Open Bugs / Risks
1. `npm audit --omit=dev` is clean (0 production vulnerabilities); current 16 highs are in dev/build tooling chain.
2. No explicit ErrorBoundary in app shell.
3. Import merge strategy intentionally creates duplicates on repeated imports.
