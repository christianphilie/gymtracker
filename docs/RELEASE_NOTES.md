# Release Notes

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
