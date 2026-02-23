# Agent Handoff Guide

## Quick Start
1. `npm install`
2. `npm run dev`
3. `npm run build`
4. For Vercel deploy, keep `vercel.json` rewrite so BrowserRouter routes resolve to `index.html`.
5. For direct AI import, configure `GROQ_API_KEY` in deployment env for `/api/ai-import` (key from console.groq.com). Model: `llama-3.3-70b-versatile`.

## Versioning Policy (Must Keep)
1. Feature releases must include a version bump before shipping/publishing.
2. The source of truth is `package.json` (`version`).
3. Docs-only or internal cleanup commits do not require a version bump.
4. Every version bump must be documented in `docs/RELEASE_NOTES.md`.
5. Keep `docs/RELEASE_NOTES.md` current with an `Unreleased` section between releases.
6. UI must display the current app version in settings.

## Primary Entrypoints
1. Router: `src/app/router.tsx`
2. Global settings/i18n: `src/app/settings-context.tsx`
3. DB schema: `src/db/db.ts`
4. Repository API: `src/db/repository.ts`
5. Feature pages: `src/features/*` (dashboard, workouts, sessions, history, import, settings, legal)

## Design Rules (Must Keep)
1. Monochrome (black/white/gray only).
2. Simple borders over heavy shadows.
3. Mobile-first, no horizontal scroll on iPhone core flows.
4. Use existing shared primitives in `src/components/ui/`.
5. Page titles follow the pattern: `<Icon /> {t("pageTitle")}` as an `<h1>` with `inline-flex items-center gap-2 text-base font-semibold`.

## Data Rules (Must Keep)
1. No login/backend in V1.
2. Persist in IndexedDB only.
3. Completed sessions are editable (reps/weight/completion state) but not re-opened as active.
4. Import is preview-first; no silent auto-import.
5. Active sessions must be resumable and autosaved.
6. Discarded sessions must be fully removed and excluded from history.
7. New sessions should follow template structure; previous-session extras are informational unless user explicitly overwrites template.
8. Backup import/export must cover all IndexedDB tables, not only workout templates.
9. On app version change, create at most one automatic safety snapshot per version transition.
10. Keep only the latest three update safety snapshots.
11. Safety snapshot restore is replace-mode and must require explicit user confirmation in UI.
12. Weight unit switches must convert persisted weight values in templates and active/completed session sets.
13. The app must not auto-seed a starter workout on launch. If there are no workouts, the dashboard must show an intro with explicit choices (starter workout / create / AI import).
14. `ensureDefaultWorkout` is an explicit action used by the dashboard intro ("use starter workout"), and must be idempotent when workouts already exist.
15. `clearAllData` must not silently recreate a starter workout; the user returns to the empty intro flow.

## Extension Guidelines
1. Prefer repository-level changes over direct table access in feature pages.
2. Add/adjust zod schema when changing import format.
3. Keep route-level pages small; move logic to feature helpers when growing.
4. Add tests before changing import/repair behavior.
5. All i18n strings go in `src/i18n/translations.ts`; always add both `de` and `en` keys.

## Suggested Next Milestone
1. Stabilization release:
- tests,
- vulnerability triage,
- minor UX polish,
- optional archive/delete.
