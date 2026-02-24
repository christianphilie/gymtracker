import { useNavigate } from "react-router-dom";
import { Plus, Sparkles } from "lucide-react";
import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AddWorkoutChoicePage() {
  const { t } = useSettings();
  const navigate = useNavigate();

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>{t("addWorkoutChoiceTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("addWorkoutChoiceDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="secondary"
            className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
            onClick={() => navigate("/workouts/new")}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="flex flex-col items-start">
              <span>{t("createWorkout")}</span>
              <span className="text-xs font-normal text-muted-foreground">{t("createWorkoutHint")}</span>
            </span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-3 text-left"
            onClick={() => navigate("/import")}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="flex flex-col items-start">
              <span>{t("aiGenerate")}</span>
              <span className="text-xs font-normal text-muted-foreground">{t("aiImportEntryHint")}</span>
            </span>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
