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
9. Add tests for `/api/ai-import` plus fallback UX when backend env is missing.
10. Add tests for rest-timer behavior (starts on first completed set, configurable 2/3/5 minute threshold).
11. Add tests for history session edit/delete actions (including DB integrity after remove).
12. Add tests for top-bar timer pause/resume interactions and reset-on-new-check behavior.

## Later
1. Workout archive/delete.
2. Richer history filters (date ranges, PR highlights, volume rollups).
3. Optional cloud/login phase (V2+): consider Vercel serverless functions + Supabase (Postgres + Row-Level Security) for a lightweight backend that requires zero infrastructure management. Auth via Supabase Auth (magic link / Google OAuth). All existing Dexie data would migrate on first login.

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
14. Default full-body workout seeded on first launch and after data reset.
15. Settings page redesign: icons per card, Satzpausen-Timer first, Sprache+Einheit side-by-side, Datenverwaltung section heading.
16. Update-safety notice dismissable with localStorage persistence.
17. Import page: title outside card, two renamed tabs, "Datei hochladen" tab removed.
18. Session history: title/subtitle swapped, ChartNoAxesCombined icon.
19. Dashboard: discard confirmation dialog, plain-button empty state, Import button added.
20. Import button removed from non-session header.
21. Legal page (`/legal`) with Lucide ISC + Apache-2.0 + MIT attributions; linked from footer and settings.
22. `ensureDefaultWorkout` localStorage-flag fix (no re-seed after manual delete; StrictMode safe).
