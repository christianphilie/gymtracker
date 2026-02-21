import { useSettings } from "@/app/settings-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clearAllData } from "@/db/repository";
import type { AppLanguage, WeightUnit } from "@/db/types";
import { toast } from "sonner";

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

  const handleClearAllData = async () => {
    const shouldClear = window.confirm(t("clearAllDataConfirm"));
    if (!shouldClear) {
      return;
    }

    await clearAllData();
    toast.success(t("allDataDeleted"));
  };

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

      <Card>
        <CardHeader>
          <CardTitle>{t("settings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            onClick={() => void handleClearAllData()}
          >
            {t("clearAllData")}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
