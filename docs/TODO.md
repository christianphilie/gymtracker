# TODO Backlog

## Doing Next
1. Security triage for `npm audit` findings.
2. Test coverage for import and session logic.
3. Basic ErrorBoundary + user-friendly fallback UI.
4. Add targeted tests for active-session resume/discard/template-overwrite flows.
5. Add tests for destructive flows (`deleteWorkout`, `clearAllData`) and confirm-dialog behavior.
6. Add tests for backup export/import integrity across all IndexedDB tables.
7. Add tests for automatic update safety snapshots (create, retain 3, restore).
8. Add tests for weight-unit conversion behavior across template and session values.
9. Add tests for `/api/ai-import` and `/api/exercise-info`, plus fallback UX when backend env is missing.
10. Add tests for rest-timer behavior (starts on first completed set, configurable 1/2/3/5 minute threshold).
11. Add tests for history session edit/delete actions (including DB integrity after remove).
12. Add tests for top-bar timer pause/resume interactions and reset-on-new-check behavior.

## Later
1. Workout archive/delete.
2. Richer history filters (date ranges, PR highlights, volume rollups).
3. Optional cloud/login phase (V2+): consider Vercel serverless functions + Supabase (Postgres + Row-Level Security) for a lightweight backend that requires zero infrastructure management. Auth via Supabase Auth (magic link / Google OAuth). All existing Dexie data would migrate on first login.
4. Revisit optional "x2" exercise/set concept (likely as a clearer multiplier/intensity/tag model with explicit UX and history semantics).

## Done
1. App scaffold and architecture.
2. Monochrome Tailwind/shadcn-style implementation.
3. Local persistence with Dexie.
4. Session tracking with target/actual values.
5. Import with schema validation and repair preview.
6. DE/EN + kg/lb settings.
7. Session autosave/resume/discard lifecycle with optional template overwrite on completion.
8. Full app backup export/import flow for device transfer.
9. Automatic update safety snapshot + restore flow.
10. Workout session history screen linked from dashboard.
11. Native drag-and-drop reordering in workout editor.
12. Direct AI import tab with server-side secret handling (Groq).
13. Dark mode (Light / Dark / System) with color scheme selector in settings.
14. Starter workout template available via explicit dashboard intro action (`ensureDefaultWorkout`) instead of auto-seeding on launch/reset.
15. Settings page redesign: icons per card, Satzpausen-Timer first, Sprache+Einheit side-by-side, Datenverwaltung section heading.
16. Update-safety notice dismissable with localStorage persistence.
17. Import page: title outside card, two renamed tabs, "Datei hochladen" tab removed.
18. Session history: title/subtitle swapped, ChartNoAxesCombined icon.
19. Dashboard: discard confirmation dialog, plain-button empty state, Import button added.
20. Import button removed from non-session header.
21. Legal page (`/legal`) with Lucide ISC + Apache-2.0 + MIT attributions; linked from footer.
22. Historic: `ensureDefaultWorkout` localStorage-flag fix (later superseded by explicit intro flow without auto-seeding).
23. Dashboard intro chooser for empty state (starter workout / create manually / AI import).
24. Workout editor polish: header save action in edit view, button/icon styling alignment, and footer action separator.
25. Settings/import UI polish: tab trigger alignment consistency, export/import icon correction, and settings legal link removal.
26. Weight-unit conversion hardening to avoid duplicate conversion during concurrent settings updates.
27. UI polish for `×2` exercises: consistent multiply symbol, editor toggle placement, and better long-title alignment in editor/session/history cards.
28. Bottom-tab active state now maps nested routes to their parent section (e.g. workout edit -> Workouts, history -> Statistics).
29. Weekly goals added to personal settings (toggleable per goal) and shown as progress cards in weekly statistics.
30. Starter workout action now creates two example workouts (Upper Body + Lower Body) instead of one full-body template.
31. Settings page refactor: reusable card titles/toggle rows/dialogs, animated show/hide for timer duration and weekly-goal inputs, plus additional section icons.
32. Weekly statistics now track total workout duration and support a weekly duration goal (with icons in stats/goals and settings).
33. Session history editing now supports adjusting completed-session start/end date-time.
34. Exercise info assistant added: Groq-backed target-muscle + coaching-tip enrichment, stored in templates/session snapshots, with reusable info popups in editor/session/history.
35. Local Vite dev server now proxies in-repo `/api/*` handlers (`/api/ai-import`, `/api/exercise-info`) so Groq-backed features work during `npm run dev`.
36. Import screen wording/UX was simplified: clearer text-only Gymtracker-KI path vs. "Aus Datei erstellen" with own AI prompt/JSON flow.
37. Weekly Data view was expanded with muscle-group radar stats (Reps/Sets/Weight modes) and a clickable Mon-Sun session timeline visualization.
38. Weekly stats UI was reorganized (Wochendaten title, cleaner section separators/cards) and weekly muscle metrics now support historical fallback matching by workout + exercise name.
39. Active session UX polish: top-right discard/complete icon actions, smaller add-exercise button, and header progress tap now completes the next set in order.
