# Release Notes

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
