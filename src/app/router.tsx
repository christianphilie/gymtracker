import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/features/home/home-page";
import { WeeklyDataPage } from "@/features/statistics/weekly-data-page";
import { AddWorkoutChoicePage } from "@/features/workouts/add-workout-choice-page";
import { WorkoutEditorPage } from "@/features/workouts/workout-editor-page";
import { SessionPage } from "@/features/sessions/session-page";
import { ImportPage } from "@/features/import/import-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { WorkoutHistoryPage } from "@/features/history/workout-history-page";
import { LegalPage } from "@/features/legal/legal-page";
import { PrivacyPage } from "@/features/privacy/privacy-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "statistics", element: <WeeklyDataPage /> },
      { path: "workouts/add", element: <AddWorkoutChoicePage /> },
      { path: "workouts/new", element: <WorkoutEditorPage mode="create" /> },
      { path: "workouts/:workoutId/edit", element: <WorkoutEditorPage mode="edit" /> },
      { path: "workouts/:workoutId/history", element: <WorkoutHistoryPage /> },
      { path: "sessions/:sessionId", element: <SessionPage /> },
      { path: "import", element: <ImportPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "legal", element: <LegalPage /> },
      { path: "privacy", element: <PrivacyPage /> }
    ]
  }
]);
