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
5. Import workout plans via AI-assisted text input or manually crafted JSON.
6. Resume active sessions safely after app/page exit.
7. Export all local data and import it on another device.
8. Review and edit completed session history per workout.

## Out of Scope (V1)
1. Login and backend sync.
2. Multi-device cloud sync.
3. Advanced analytics.
4. Real-time cloud sync across devices.

## Functional Requirements
1. Workout CRUD:
- Create workout with 1..n exercises.
- Each exercise has 1..n sets.

2. Session tracking:
- Start session from workout template.
- Pre-fill target values.
- Enter actual reps/weight.
- Mark set done.
- Auto-save all active session inputs immediately.
- Resume an already active session instead of creating duplicates.
- Allow discarding an active session with explicit confirmation (must not count as history).
- Complete session (preserved in history afterwards).
- On completion, optionally apply session values as a new workout template.
- Additional sets/exercises in session are allowed but must not auto-expand the next session template.

3. History display:
- Show latest completed snapshot per exercise in active session.
- Show additional exercises/sets from previous session as info hints only.
- Allow viewing full session history per workout with per-session stats.
- Allow editing completed session sets (reps, weight, completion state).
- Allow deleting completed sessions with confirmation.

4. Import:
- Two modes: AI-assisted (paste plan text → server generates JSON) and manual (copy prompt → use own AI → paste JSON result).
- Strict schema validation + conservative auto-repair.
- Preview repair changes before import.
- Merge policy in V1: always create new entries.

5. Settings:
- Language: DE/EN.
- Weight unit: kg/lb.
- Color scheme: Light / Dark / System.
- Rest timer duration: 2 / 3 / 5 minutes.
- Show current app version + link to legal/license page.
- Export/import full app backup (all local entities) with explicit overwrite confirmation.
- Full data reset with confirmation.
- Restore update-safety snapshot with confirmation.

6. Legal:
- License page at `/legal` required to comply with Lucide React ISC license.
- Must include: Lucide ISC full text, Dexie Apache-2.0 attribution, CVA Apache-2.0 attribution, MIT list for remaining runtime deps.

## Non-Functional Requirements
1. Mobile-first UX, iPhone-friendly.
2. PWA installable, basic offline for app shell and local data.
3. Local-only storage (IndexedDB).
4. Monochrome visual style (minimal, Vercel/shadcn-like).
5. Dark mode support via `.dark` class on `<html>`.

## Acceptance Criteria (Current)
1. User can fully track a session without backend/login.
2. Import flow can transform and validate LLM JSON payloads.
3. Last-session context appears in active session UI.
4. UI remains consistent across all screens.
5. Session progress and active-session state are clearly visible from navigation/dashboard.
6. User can review, edit, and delete completed session history entries.
7. Legal attributions comply with all runtime dependency licenses.
