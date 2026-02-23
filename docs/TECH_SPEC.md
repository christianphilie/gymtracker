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
9. Optional Vercel serverless function for AI import (`/api/ai-import`).
10. Lucide React for icons (ISC license).

## App Architecture
1. `src/app/`:
- Router, settings context.

2. `src/components/`:
- Shared UI primitives and app shell.

3. `src/db/`:
- Dexie schema/types/repository.

4. `src/features/`:
- dashboard, workouts, sessions, history, import, settings, legal.

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
8. Global reset (`clearAllData`) clears all persisted entities including settings and update safety snapshots, and removes the `gymtracker:default-workout-seeded` localStorage flag.
9. Previous-session comparison hints must be derived from completed sets only.
10. On app version change, the app stores one full safety snapshot before users continue normal usage.
11. Unit switch (`kg/lb`) converts stored template/session weights; no unit relabel-only mode.
12. Rest timer starts after first checked set and uses configurable duration from settings (2/3/5 minutes).
13. Rest timer can be paused/resumed manually and resets when a newer set completion timestamp appears.
14. Completed sessions are mutable via history tooling (edit values/check-state or delete whole session with confirmation).

## Default Workout Seeding
1. `ensureDefaultWorkout` seeds a default full-body workout on first app launch and after `clearAllData`.
2. A localStorage flag `gymtracker:default-workout-seeded` is set **synchronously** before the async Dexie write to prevent React StrictMode double-invocation from creating two workouts.
3. The flag is checked at the start of `ensureDefaultWorkout`; if present, the function returns immediately.
4. `clearAllData` removes the flag so the seed runs again after a full reset.
5. Manually deleting all workouts does NOT remove the flag — no re-seed occurs.

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

## AI Import Endpoint
1. Client can submit plain plan text to `/api/ai-import`.
2. Endpoint uses deployment secret `GROQ_API_KEY` and model `llama-3.3-70b-versatile`; returns JSON text.
3. Frontend still runs local preview/validation flow before import persistence.

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
4. Session/template model plus operational safety checkpoints add migration complexity (Dexie schema v5).
