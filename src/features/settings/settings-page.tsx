import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLanguage, WeightUnit } from "@/db/types";

export function SettingsPage() {
  const { t, language, setLanguage, weightUnit, setWeightUnit } = useSettings();

  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "English" }
  ];

  const weightOptions: Array<{ value: WeightUnit; label: string }> = [
    { value: "kg", label: "kg" },
    { value: "lb", label: "lb" }
  ];

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {languageOptions.map((option) => (
            <Button
              key={option.value}
              variant={language === option.value ? "default" : "outline"}
              onClick={() => void setLanguage(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("unit")}</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {weightOptions.map((option) => (
            <Button
              key={option.value}
              variant={weightUnit === option.value ? "default" : "outline"}
              onClick={() => void setWeightUnit(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
