# Project Status

Consolidated status and backlog document replacing the older split between implementation/status planning docs and `docs/TODO.md`.

`docs/RELEASE_NOTES.md` is the source of truth for shipped changes. This file should track current focus and open backlog, not duplicate a long "Done" list.

## Current Focus

1. Test coverage for import, session lifecycle, destructive flows, and backup/update-safety paths
2. Security triage for dev-tooling `npm audit` findings
3. Add a basic ErrorBoundary and user-friendly fallback UI
4. Xcode/iOS wrapper migration prep (WebView storage/API parity, file import/export behavior, routing behavior)
5. Continue modular refactors for remaining large feature files (`workout-editor-page`, `session-page`)
6. General UX polish and hardening

## Next Up (Prioritized Backlog)

1. Add targeted tests for active-session resume/discard/template-overwrite flows
2. Add tests for destructive flows (`deleteWorkout`, `clearAllData`) and confirm-dialog behavior
3. Add tests for backup export/import integrity across all IndexedDB tables
4. Add tests for automatic update safety snapshots (create, retain latest 3, restore)
5. Add tests for weight-unit conversion behavior across template and session values
6. Add tests for `/api/ai-import` and `/api/exercise-info`, plus fallback UX when backend env is missing
7. Add tests for history session edit/delete actions (including DB integrity after remove)
8. Add tests for rest-timer behavior (starts on first completed set, configurable 1/2/3/5 minute threshold)
9. Add tests for top-bar timer pause/resume interactions and reset-on-new-check behavior

## Completed Milestones

1. Project scaffold with Vite + React + TypeScript
2. Tailwind tokenized theme and local shadcn-style UI primitives
3. Dexie schema and repository layer
4. Workout dashboard + editor (including drag/drop reordering and deletion)
5. Active session flow with autosave/resume/discard/complete
6. Session history with edit/delete
7. AI/manual import with validation, repair preview, and prompt-based fallback flow
8. Full backup export/import for all IndexedDB tables
9. Automatic update safety snapshots + restore flow
10. PWA setup and Vercel SPA routing baseline
11. Bottom tab shell, route-aware headers, and active session quick resume
12. `x2` exercise support across templates, sessions, history, and stats
13. Weekly statistics view plus configurable weekly goals in settings
14. Dark mode (Light / Dark / System) and broader settings polish (icons, grouped cards, dialogs)
15. Ongoing maintainability refactor: dashboard/statistics pages, settings tabs, and repository domains were split into smaller focused modules without behavior changes

## Later / Optional Backlog

1. Workout archive/delete
2. Richer history filters (date ranges, PR highlights, volume rollups)
3. Optional cloud/login phase (V2+): evaluate a lightweight backend path (for example Vercel serverless + Supabase) and a first-login Dexie migration strategy
4. Revisit the `x2` concept only if current semantics/UX prove confusing in real use (otherwise keep current model)
5. Home page enhancement ideas (today card, quick actions, recently used shortcuts, weekly highlights, recommended next workout, unfinished drafts, reminders)

## References

1. `docs/RELEASE_NOTES.md` for shipped features and fixes (chronological)
2. `docs/SECURITY_NOTES.md` for audit snapshot + triage guidance
3. `docs/PRODUCT_REQUIREMENTS.md` for functional scope expectations
4. `docs/TECH_SPEC.md` for implementation-level architecture notes
