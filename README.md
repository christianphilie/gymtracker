# Gymtracker

Minimal workout tracking PWA (React + TypeScript + Tailwind + shadcn-style components + Dexie).

## Features (V1)

- Multiple workouts with exercises and planned sets
- Session tracking with target vs actual reps/weight and set check-off
- Last-session snapshot per exercise
- Session history per workout
- JSON import with conservative auto-repair preview
- Prompt-copy helper for LLM-based plan conversion
- Direct AI import tab (server-side endpoint)
- Full app backup export/import (device transfer)
- Local persistence (IndexedDB) without login/backend
- PWA-ready static app
- German/English UI toggle and global weight unit (kg/lb)
- Configurable rest timer duration (2/3/5 minutes)
- In-app version display (Settings)

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

## Publish (for friends)

### Vercel (recommended)
1. Push this repo to GitHub.
2. Go to [Vercel](https://vercel.com) and import the GitHub repository.
3. Keep default Vite settings:
- Build command: `npm run build`
- Output directory: `dist`
4. Add environment variable for AI import endpoint:
- `OPENAI_API_KEY` (required for `/api/ai-import`)
- `OPENAI_MODEL` (optional, defaults to `gpt-4.1-mini`)
5. Deploy.
6. Share the generated HTTPS URL.

`vercel.json` is included so client-side routes (React Router) work correctly on direct opens.

### Add to Home Screen (iPhone)
1. Open the deployed URL in Safari.
2. Tap `Share`.
3. Tap `Add to Home Screen`.
4. Confirm.

## Project Docs

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/RELEASE_NOTES.md`
- `docs/TECH_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/TODO.md`
- `docs/AGENT_HANDOFF.md`
- `docs/SECURITY_NOTES.md`
- `docs/TRAINING_PLAN_IMPORT_SCHEMA_V1.json`
