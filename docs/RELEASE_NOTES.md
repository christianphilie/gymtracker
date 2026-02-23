# Release Notes

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
