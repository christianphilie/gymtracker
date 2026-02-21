# Implementation Plan

## Phase 1: Foundation
Status: Completed
- Vite + React + TypeScript setup
- Tailwind theme tokens
- Shared app shell and router

## Phase 2: Local Data Layer
Status: Completed
- Dexie schema
- Repository abstraction
- Settings bootstrap

## Phase 3: Core Workflows
Status: Completed
- Dashboard and workout cards
- Workout editor
- Session tracking with target/actual and check-off
- Last session snapshot in active flow

## Phase 4: Import Differentiator
Status: Completed
- LLM prompt copy helper
- JSON paste + file upload
- Validation + conservative repair + preview
- Import persistence

## Phase 5: Stabilization
Status: In Progress
- Automated tests
- Security triage for dev tooling vulnerabilities
- UX copy cleanup and states

## Phase 6: Optional V1.1
Status: Planned
- Workout archive/delete
- Expanded history view
- Export/restore backup

## Definition of Done (V1)
1. Build passes (`npm run build`).
2. Core flows are functional without backend/login.
3. Import flow safe-guards malformed JSON.
4. Mobile-first layout has no horizontal scrolling in core flows.
