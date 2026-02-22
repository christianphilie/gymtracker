import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkoutById, getWorkoutSessionHistory } from "@/db/repository";
import { formatDateTime } from "@/lib/utils";

export function WorkoutHistoryPage() {
  const { workoutId } = useParams();
  const { t, weightUnit } = useSettings();
  const numericWorkoutId = Number(workoutId);

  const payload = useLiveQuery(async () => {
    if (Number.isNaN(numericWorkoutId)) {
      return null;
    }

    const [workout, history] = await Promise.all([
      getWorkoutById(numericWorkoutId),
      getWorkoutSessionHistory(numericWorkoutId)
    ]);

    return { workout, history };
  }, [numericWorkoutId]);

  const groupedHistory = useMemo(() => {
    return (payload?.history ?? []).map((entry) => {
      const grouped = new Map<string, typeof entry.sets>();
      for (const set of entry.sets) {
        const list = grouped.get(set.sessionExerciseKey) ?? [];
        list.push(set);
        grouped.set(set.sessionExerciseKey, list);
      }

      const exercises = [...grouped.values()]
        .map((sets) => sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder))
        .sort((a, b) => a[0].exerciseOrder - b[0].exerciseOrder);

      return { ...entry, exercises };
    });
  }, [payload?.history]);

  if (!payload?.workout) {
    return <p className="text-sm text-muted-foreground">Workout not found.</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("workouts")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {payload.workout.workout.name} · {t("sessions")}
          </CardTitle>
        </CardHeader>
      </Card>

      {groupedHistory.length === 0 && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">{t("noSessionHistory")}</CardContent>
        </Card>
      )}

      {groupedHistory.map((entry) => (
        <Card key={entry.session.id}>
          <CardHeader>
            <CardTitle className="text-sm">{formatDateTime(entry.session.finishedAt ?? entry.session.startedAt)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entry.exercises.map((sets) => {
              const firstSet = sets[0];
              return (
                <div key={firstSet.sessionExerciseKey} className="space-y-1">
                  <p className="text-xs font-medium">{firstSet.exerciseName}</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {sets.map((set, index) => {
                      return (
                        <p key={set.id ?? `${firstSet.sessionExerciseKey}-${index}`}>
                          #{index + 1}: {set.actualReps ?? set.targetReps} × {set.actualWeight ?? set.targetWeight} {weightUnit}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
