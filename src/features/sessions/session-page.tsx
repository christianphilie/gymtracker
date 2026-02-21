import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SessionExerciseSet } from "@/db/types";
import {
  completeSession,
  formatWeightLabel,
  getLastCompletedSetsByExercise,
  getSessionById,
  updateSessionSet
} from "@/db/repository";
import { formatDateTime } from "@/lib/utils";

export function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { t, weightUnit } = useSettings();
  const numericSessionId = Number(sessionId);

  const payload = useLiveQuery(async () => {
    if (Number.isNaN(numericSessionId)) {
      return null;
    }

    const sessionPayload = await getSessionById(numericSessionId);
    if (!sessionPayload) {
      return null;
    }

    const lastByExercise = await getLastCompletedSetsByExercise(
      sessionPayload.session.workoutId,
      sessionPayload.session.id
    );

    return {
      ...sessionPayload,
      lastByExercise
    };
  }, [numericSessionId]);

  const groupedSets = useMemo(() => {
    const map = new Map<number, SessionExerciseSet[]>();

    for (const set of payload?.sets ?? []) {
      const current = map.get(set.exerciseId) ?? [];
      current.push(set);
      map.set(set.exerciseId, current);
    }

    for (const [exerciseId, sets] of map.entries()) {
      map.set(
        exerciseId,
        sets.sort((a, b) => a.templateSetOrder - b.templateSetOrder)
      );
    }

    return map;
  }, [payload?.sets]);

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Session not found.</p>;
  }

  const isCompleted = payload.session.status === "completed";

  return (
    <section className="space-y-4 pb-16">
      <Card>
        <CardHeader>
          <CardTitle>{payload.workout.workout.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{formatDateTime(payload.session.startedAt)}</p>
        </CardHeader>
      </Card>

      {payload.workout.exercises.map((block, exerciseIndex) => {
        const exerciseId = block.exercise.id!;
        const sets = groupedSets.get(exerciseId) ?? [];
        const lastSnapshot = payload.lastByExercise[exerciseId];

        return (
          <Card key={exerciseId}>
            <CardHeader className="space-y-2">
              <CardTitle>
                {exerciseIndex + 1}. {block.exercise.name}
              </CardTitle>
              {lastSnapshot && (
                <p className="text-xs text-muted-foreground">
                  {t("lastSession")}: {formatDateTime(lastSnapshot.completedAt)}
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-2">
              {sets.map((set, setIndex) => {
                const lastSet = lastSnapshot?.sets?.[setIndex];

                return (
                  <div key={set.id} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                    <div className="col-span-12 text-xs text-muted-foreground">
                      #{setIndex + 1} Soll: {set.targetReps} x {formatWeightLabel(set.targetWeight, weightUnit)}
                      {lastSet &&
                        ` | ${t("lastSession")}: ${lastSet.actualReps ?? "-"} x ${formatWeightLabel(
                          lastSet.actualWeight,
                          weightUnit
                        )}`}
                    </div>
                    <div className="col-span-4">
                      <Input
                        type="number"
                        min={0}
                        value={set.actualReps ?? ""}
                        placeholder={String(set.targetReps)}
                        disabled={isCompleted}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          void updateSessionSet(set.id!, {
                            actualReps: Number.isNaN(value) ? undefined : value
                          });
                        }}
                      />
                    </div>
                    <div className="col-span-5">
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        value={set.actualWeight ?? ""}
                        placeholder={String(set.targetWeight)}
                        disabled={isCompleted}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          void updateSessionSet(set.id!, {
                            actualWeight: Number.isNaN(value) ? undefined : value
                          });
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <Button
                        variant={set.completed ? "default" : "outline"}
                        className="w-full"
                        disabled={isCompleted}
                        onClick={() => {
                          void updateSessionSet(set.id!, {
                            completed: !set.completed
                          });
                        }}
                      >
                        {set.completed ? t("done") : "Set"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {!isCompleted && (
        <div className="sticky bottom-16 rounded-lg border bg-background p-3 sm:bottom-4">
          <Button
            className="w-full"
            onClick={async () => {
              await completeSession(numericSessionId);
              toast.success(t("sessionCompleted"));
              navigate("/");
            }}
          >
            {t("completeSession")}
          </Button>
        </div>
      )}
    </section>
  );
}
