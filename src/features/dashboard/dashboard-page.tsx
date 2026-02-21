import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/db";
import { startSession } from "@/db/repository";
import { useSettings } from "@/app/settings-context";

export function DashboardPage() {
  const { t } = useSettings();
  const navigate = useNavigate();

  const workouts = useLiveQuery(async () => {
    const list = await db.workouts.orderBy("createdAt").reverse().toArray();
    const workoutIds = list.map((workout) => workout.id).filter((id): id is number => !!id);
    const exercises = workoutIds.length ? await db.exercises.where("workoutId").anyOf(workoutIds).toArray() : [];

    const exerciseCountByWorkout = new Map<number, number>();
    for (const exercise of exercises) {
      exerciseCountByWorkout.set(exercise.workoutId, (exerciseCountByWorkout.get(exercise.workoutId) ?? 0) + 1);
    }

    return list.map((workout) => ({
      ...workout,
      exerciseCount: exerciseCountByWorkout.get(workout.id ?? -1) ?? 0
    }));
  }, []);

  const hasWorkouts = useMemo(() => (workouts?.length ?? 0) > 0, [workouts]);

  const handleStartSession = async (workoutId: number) => {
    try {
      const sessionId = await startSession(workoutId);
      navigate(`/sessions/${sessionId}`);
    } catch {
      toast.error(t("invalidImport"));
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">{t("workouts")}</h1>
        <Button size="sm" onClick={() => navigate("/workouts/new")}>
          {t("newWorkout")}
        </Button>
      </div>

      {!hasWorkouts && (
        <Card>
          <CardHeader>
            <CardTitle>{t("noWorkouts")}</CardTitle>
          </CardHeader>
          <CardFooter className="gap-2">
            <Button onClick={() => navigate("/workouts/new")}>{t("createWorkout")}</Button>
            <Button variant="outline" onClick={() => navigate("/import")}>
              {t("openImport")}
            </Button>
          </CardFooter>
        </Card>
      )}

      {workouts?.map((workout) => (
        <Card key={workout.id}>
          <CardHeader>
            <CardTitle>{workout.name}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {workout.exerciseCount} {t("exercises")}
          </CardContent>
          <CardFooter className="gap-2">
            <Button onClick={() => handleStartSession(workout.id!)}>{t("startSession")}</Button>
            <Button variant="outline" onClick={() => navigate(`/workouts/${workout.id}/edit`)}>
              {t("edit")}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}
