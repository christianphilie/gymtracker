# Gymtracker

Minimal workout tracking PWA (React + TypeScript + Tailwind + shadcn-style components + Dexie).

## Features (V1)

- Multiple workouts with exercises and planned sets
- Session tracking with target vs actual reps/weight and set check-off
- Last-session snapshot per exercise
- JSON import with conservative auto-repair preview
- Prompt-copy helper for LLM-based plan conversion
- Local persistence (IndexedDB) without login/backend
- PWA-ready static app
- German/English UI toggle and global weight unit (kg/lb)

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Project Docs

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/TECH_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/TODO.md`
- `docs/AGENT_HANDOFF.md`
- `docs/SECURITY_NOTES.md`
- `docs/TRAINING_PLAN_IMPORT_SCHEMA_V1.json`
