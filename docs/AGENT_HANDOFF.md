# Agent Handoff Guide

## Quick Start
1. `npm install`
2. `npm run dev`
3. `npm run build`

## Primary Entrypoints
1. Router: `src/app/router.tsx`
2. Global settings/i18n: `src/app/settings-context.tsx`
3. DB schema: `src/db/db.ts`
4. Repository API: `src/db/repository.ts`
5. Feature pages: `src/features/*`

## Design Rules (Must Keep)
1. Monochrome (black/white/gray only).
2. Simple borders over heavy shadows.
3. Mobile-first, no horizontal scroll on iPhone core flows.
4. Use existing shared primitives in `src/components/ui/`.

## Data Rules (Must Keep)
1. No login/backend in V1.
2. Persist in IndexedDB only.
3. Completed sessions are read-only.
4. Import is preview-first; no silent auto-import.

## Extension Guidelines
1. Prefer repository-level changes over direct table access in feature pages.
2. Add/adjust zod schema when changing import format.
3. Keep route-level pages small; move logic to feature helpers when growing.
4. Add tests before changing import/repair behavior.

## Suggested Next Milestone
1. Stabilization release:
- tests,
- vulnerability triage,
- minor UX polish,
- optional archive/delete.
