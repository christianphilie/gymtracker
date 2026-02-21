# TODO Backlog

## Doing Next
1. Security triage for `npm audit` findings.
2. Test coverage for import and session logic.
3. Basic ErrorBoundary + user-friendly fallback UI.
4. Add targeted tests for active-session resume/discard/template-overwrite flows.
5. Add tests for destructive flows (`deleteWorkout`, `clearAllData`) and confirm-dialog behavior.
6. Add tests for backup export/import integrity across all IndexedDB tables.

## Later
1. Workout archive/delete.
2. Better history view (beyond last session snapshot).
3. Optional cloud/login phase (V2+).

## Done
1. App scaffold and architecture.
2. Monochrome Tailwind/shadcn-style implementation.
3. Local persistence with Dexie.
4. Session tracking with target/actual values.
5. Import with schema validation and repair preview.
6. DE/EN + kg/lb settings.
7. Session autosave/resume/discard lifecycle with optional template overwrite on completion.
8. Full app backup export/import flow for device transfer.
