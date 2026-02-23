import { Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSettings } from "@/app/settings-context";

export function PrivacyPage() {
  const { t } = useSettings();

  return (
    <section className="space-y-4">
      <h1 className="inline-flex items-center gap-2 text-base font-semibold">
        <Shield className="h-4 w-4" />
        {t("privacyTitle")}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("privacyDataStorageTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{t("privacyDataStorageText")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("privacyAiTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{t("privacyAiText")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("privacyOpenSourceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            {t("privacyOpenSourceText")}{" "}
            <a
              href="https://github.com/christianphilie/gymtracker"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              GitHub
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
