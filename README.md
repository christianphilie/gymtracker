# 🏋️ Gymtracker

A minimalist workout tracking app built as a PWA — for people who already have a training plan and want to log their sessions quickly and without distractions. No backend, no login, everything stored locally.

## ✨ Features

### Workout Management

* Create and edit multiple workouts with any number of exercises and sets
* Define target values per set (reps × weight)
* Reorder exercises via drag & drop
* Mark exercises as `×2` (e.g. unilateral work) so stats count volume correctly

### Session Tracking

* Start a session from a workout template
* Resume the current active session from anywhere in the app
* Target values are prefilled, actual values are entered directly
* Check off sets individually
* Values from the last session are shown as a reference during training
* Add additional exercises and sets during a session
* Finish a session (optionally apply current values to the template) or discard it
* Compact header progress + rest timer widgets with pause/resume support

### History

* View completed sessions per workout
* Edit individual sets in past sessions
* Delete sessions from history

### Statistics

* Separate weekly statistics view (workouts, exercises, sets, reps, weight, calories)
* Optional weekly goals for workouts, calories, and weight volume with progress bars

### Import

* Paste a training plan as text → AI converts it into the app format
* Alternatively: copy the prompt, use your own AI, paste the JSON result
* Conservative auto-repair with preview before import

### Settings & Data

* Language: German / English
* Weight unit: kg / lb (including automatic conversion of stored weights)
* Color scheme: Light / Dark / System
* Rest timer: 1 / 2 / 3 / 5 minutes (show/hide + configurable duration)
* Optional locker-number note in the app header
* Personal weekly goals (toggleable per goal)
* Export a full backup and import it on another device
* Reset all data

### Empty State / Starter Data

* Guided intro when no workouts exist
* Optional starter set creates two example workouts (`Upper Body` / `Lower Body` style split)

## 🛠 Tech Stack

| Area       | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Framework  | React 18 + TypeScript                                |
| Build      | Vite                                                 |
| Styling    | Tailwind CSS + shadcn-style UI components (Radix UI) |
| Database   | Dexie (IndexedDB)                                    |
| Routing    | React Router v6                                      |
| Validation | Zod                                                  |
| Icons      | Lucide React                                         |
| PWA        | vite-plugin-pwa                                      |
| Toasts     | Sonner                                               |

All data is stored locally in the browser (IndexedDB) — no server, no account.

## 🚀 Installation & Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
npm run preview
```

### Lint

```bash
npm run lint
```

## 📲 Install as App (PWA)

The app is designed as a Progressive Web App and can be installed on the home screen:

**iPhone/iPad:** Safari → Share → “Add to Home Screen”
**Android:** Chrome → Menu → “Install app”
**Desktop:** Click the install icon in the address bar

## 🤖 AI Import (optional)

The AI-powered import tab requires a server endpoint (`/api/ai-import`).
It uses `GROQ_API_KEY` as an environment variable and the model `llama-3.3-70b-versatile`.

Without this endpoint, the manual import (copy prompt → use your own AI → paste JSON) continues to work fully without any configuration.

## 📁 Project Structure

```
api/             # Optional AI import endpoint
src/
├── app/          # Router, Settings context
├── components/   # Shared UI primitives, App shell
├── db/           # Dexie schema, types, repository
└── features/     # dashboard, workouts, sessions, history, import, settings, legal
docs/             # Product requirements, tech spec, release notes, ...
```

## 📄 Docs

* [`docs/AGENTS.md`](docs/AGENTS.md) (agent/handoff notes)
* [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md)
* [`docs/TECH_SPEC.md`](docs/TECH_SPEC.md)
* [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)
* [`docs/TODO.md`](docs/TODO.md)
* [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md)
* [`docs/TRAINING_PLAN_IMPORT_SCHEMA_V1.json`](docs/TRAINING_PLAN_IMPORT_SCHEMA_V1.json)
