# Technical Specification

## Stack
1. Vite + React 18 + TypeScript.
2. Tailwind CSS (monochrome theme tokens).
3. shadcn-style UI primitives (local components).
4. Dexie + IndexedDB persistence.
5. React Router v6.
6. zod validation for import schema.
7. vite-plugin-pwa for installability/offline shell.

## App Architecture
1. `src/app/`:
- Router, settings context.

2. `src/components/`:
- Shared UI primitives and app shell.

3. `src/db/`:
- Dexie schema/types/repository.

4. `src/features/`:
- dashboard, workouts, sessions, import, settings.

## Data Model (Dexie)
1. `settings`: language, weightUnit.
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

## Session Lifecycle Rules
1. Only one active session per workout at a time.
2. Starting a workout resumes the active session if present.
3. Active session values are persisted immediately (autosave behavior).
4. Discarding a session removes all session rows and history impact.
5. Completing a session can optionally rewrite workout template exercises/sets from session results.
6. Extras created during a session are shown in previous-session hints, but do not auto-extend a fresh template-based session unless user selects template overwrite at completion.

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
1. No backend means no cross-device sync.
2. PWA offline is intentionally basic for V1.
3. Import merge policy may create duplicates by design.
4. Session/template model adds migration complexity (Dexie schema v2).
