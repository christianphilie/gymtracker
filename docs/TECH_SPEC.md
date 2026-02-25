# Technical Specification

## Stack
1. Vite + React 18 + TypeScript.
2. Tailwind CSS (monochrome theme tokens, dark mode via `.dark` class).
3. shadcn-style UI primitives (local components).
4. Dexie + IndexedDB persistence.
5. React Router v6.
6. zod validation for import schema.
7. vite-plugin-pwa for installability/offline shell.
8. zod validation for full-app backup import payload.
9. AI helper endpoints in `api/` (`/api/ai-import`, `/api/exercise-info`) for server-side Groq-backed features (local dev via Vite middleware, production via server runtime).
10. Lucide React for icons (ISC license).

## App Architecture
1. `src/app/`:
- Router, settings context.

2. `src/components/`:
- Shared UI primitives and app shell.

3. `src/db/`:
- Dexie schema/types/repository.

4. `src/features/`:
- dashboard, workouts, sessions, history, import, settings, legal, privacy.

5. `api/`:
- Server-side handlers used in local dev (via Vite middleware) and production runtime (`/api/ai-import`, `/api/exercise-info`).

## Data Model (Dexie)
1. `settings`: language, weightUnit, colorScheme, restTimerSeconds.
2. `workouts`: workout container.
3. `exercises`: workout template exercises (`isTemplate` marker).
4. `exerciseTemplateSets`: planned sets.
5. `sessions`: active/completed sessions.
6. `sessionExerciseSets`: session-local exercise rows with:
- `sessionExerciseKey` (stable key per exercise inside a session),
- optional `templateExerciseId` for mapped template exercises,
- exercise metadata snapshot (`exerciseName`, `exerciseNotes`, `exerciseOrder`),
- `isTemplateExercise` flag,
- target/actual values + completion state.
7. `updateSafetySnapshots`: automatic rollback checkpoints created once per detected app version change.

## Session Lifecycle Rules
1. Only one active session per workout at a time.
2. Starting a workout resumes the active session if present.
3. Active session values are persisted immediately (autosave behavior).
4. Discarding a session removes all session rows and history impact; requires explicit user confirmation.
5. Completing a session can optionally rewrite workout template exercises/sets from session results.
6. Extras created during a session are shown in previous-session hints, but do not auto-extend a fresh template-based session unless user selects template overwrite at completion.
7. Deleting a workout cascades through template exercises/sets and all related sessions/session sets.
8. Global reset (`clearAllData`) clears all persisted entities including settings and update safety snapshots; it does not auto-recreate a starter workout.
9. Previous-session comparison hints must be derived from completed sets only.
10. On app version change, the app stores one full safety snapshot before users continue normal usage.
11. Unit switch (`kg/lb`) converts stored template/session weights; no unit relabel-only mode.
12. Rest timer starts after the first checked set and uses a configurable duration from settings (1/2/3/5 minutes), with a separate on/off toggle.
13. Rest timer can be paused/resumed manually and resets when a newer set completion timestamp appears.
14. Completed sessions are mutable via history tooling (edit values/check-state or delete whole session with confirmation).

## Starter Workout Provisioning
1. The app does not seed a workout automatically on first launch.
2. If no workouts exist, the dashboard renders an intro screen with three explicit options:
- use a starter workout,
- create a workout manually,
- import workouts with AI.
3. `ensureDefaultWorkout` is used as an explicit starter-workout action (dashboard intro CTA), not as startup bootstrap logic.
4. `ensureDefaultWorkout` returns early when workouts already exist, so repeated clicks or race conditions do not create duplicate starter workouts.

## Mobile Viewport Behavior
1. Viewport is locked to app-like scale (manual pinch zoom disabled by design requirement).
2. Form controls use non-zooming input font size to avoid iOS auto-focus zoom.

## JSON Import Contract (V1)
```json
{
  "schemaVersion": "1.0",
  "locale": "de",
  "workouts": [
    {
      "name": "Upper Body A",
      "exercises": [
        {
          "name": "Bench Press",
          "notes": "Optional",
          "sets": [
            { "targetReps": 8, "targetWeight": 60 }
          ]
        }
      ]
    }
  ]
}
```

## Full Backup Contract (V1)
1. Backup payload contains:
- `backupVersion` (currently `1.0`),
- `appVersion` (from `package.json`),
- `dbSchemaVersion` (current Dexie schema),
- `exportedAt`,
- `data` object with full snapshots of all IndexedDB tables.
2. Import is strict-validated before write.
3. Restore is replace-mode only (existing local data is fully overwritten after explicit confirmation).
4. Backup transfer is the V1 mechanism for cross-device migration without accounts/backend.

## AI Endpoints
1. Client can submit plain plan text to `/api/ai-import`.
2. Workout editor can request exercise metadata enrichment via `/api/exercise-info`.
3. Endpoints use deployment secret `GROQ_API_KEY` and model `llama-3.3-70b-versatile`.
4. Frontend keeps local validation/preview behavior for import and has local fallback handling when AI endpoints are unavailable.

## Conservative Auto-Repair Rules
1. Allowed:
- String -> number conversions.
- Alias mapping: `reps -> targetReps`, `weight -> targetWeight`.
- Trim strings.
- Remove invalid/empty rows.

2. Not allowed:
- Guess missing semantic values.
- Silent imports without preview confirmation.

## Known Tradeoffs
1. No backend means no real-time cross-device sync (backup transfer is manual).
2. PWA offline is intentionally basic for V1.
3. Import merge policy may create duplicates by design.
4. Session/template model plus operational safety checkpoints add migration complexity (versioned Dexie migrations; see `src/app/version.ts` for the current schema constant).
