# Product Requirements (V1)

## Goal
Build a lightweight workout tracking web app (PWA) as a better notes replacement for gym sessions.

## Target User
People who already have a training plan (e.g., from coach/PDF) and want fast logging during workouts.

## Core Use Cases
1. Create and manage multiple workouts.
2. Define exercises and planned sets (target reps + target weight).
3. Start a workout session and track actual values per set.
4. See last session values per exercise while training.
5. Import workout plans via AI-generated JSON.

## Out of Scope (V1)
1. Login and backend sync.
2. Multi-device cloud sync.
3. Advanced analytics.
4. Editing completed sessions.
5. Backup/export restore.

## Functional Requirements
1. Workout CRUD:
- Create workout with 1..n exercises.
- Each exercise has 1..n sets.

2. Session tracking:
- Start session from workout template.
- Pre-fill target values.
- Enter actual reps/weight.
- Mark set done.
- Complete session (read-only afterwards).

3. History display:
- Show latest completed snapshot per exercise in active session.

4. Import:
- JSON import via paste and file upload.
- Strict schema validation + conservative auto-repair.
- Preview repair changes before import.
- Merge policy in V1: always create new entries.

5. Settings:
- Language: DE/EN.
- Weight unit: kg/lb.

## Non-Functional Requirements
1. Mobile-first UX, iPhone-friendly.
2. PWA installable, basic offline for app shell and local data.
3. Local-only storage (IndexedDB).
4. Monochrome visual style (minimal, Vercel/shadcn-like).

## Acceptance Criteria (Current)
1. User can fully track a session without backend/login.
2. Import flow can transform and validate LLM JSON payloads.
3. Last-session context appears in active session UI.
4. UI remains consistent across all screens.
