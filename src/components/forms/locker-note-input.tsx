import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DoorClosedLocked } from "lucide-react";
import { useSettings } from "@/app/settings-context";
import { Input } from "@/components/ui/input";
import { db } from "@/db/db";
import { updateLockerNumber } from "@/db/repository";

export function LockerNoteInput() {
  const { t } = useSettings();
  const appSettings = useLiveQuery(async () => db.settings.get(1), []);
  const [lockerDraft, setLockerDraft] = useState("");

  useEffect(() => {
    setLockerDraft(appSettings?.lockerNumber ?? "");
  }, [appSettings?.lockerNumber]);

  useEffect(() => {
    const maybeResetLocker = async () => {
      const settings = await db.settings.get(1);
      if (!settings?.lockerNumber) return;

      const updatedDate = settings.lockerNumberUpdatedAt
        ? new Date(settings.lockerNumberUpdatedAt).toLocaleDateString("sv-SE")
        : "";

      if (updatedDate !== new Date().toLocaleDateString("sv-SE")) {
        await updateLockerNumber("");
      }
    };

    void maybeResetLocker();
    const interval = window.setInterval(() => {
      void maybeResetLocker();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const handleLockerDraftCommit = () => {
    const normalized = lockerDraft.replace(/\D/g, "").slice(0, 3);
    setLockerDraft(normalized);
    void updateLockerNumber(normalized);
  };

  return (
    <label
      className={`inline-flex h-9 items-center overflow-hidden rounded-full border border-input bg-background text-sm shadow-sm transition-all duration-200 ${
        lockerDraft ? "w-[4.5rem] gap-1 px-2" : "w-9 gap-0 px-2 focus-within:w-[4.5rem] focus-within:gap-1"
      }`}
    >
      <DoorClosedLocked className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Input
        aria-label={t("lockerNumber")}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        value={lockerDraft}
        onChange={(event) => {
          const next = event.currentTarget.value.replace(/\D/g, "").slice(0, 3);
          setLockerDraft(next);
        }}
        onFocus={(event) => {
          const target = event.currentTarget;
          window.setTimeout(() => target.select(), 0);
        }}
        onClick={(event) => {
          const target = event.currentTarget;
          window.setTimeout(() => target.select(), 0);
        }}
        onMouseUp={(event) => {
          event.preventDefault();
          const target = event.currentTarget;
          window.setTimeout(() => target.select(), 0);
        }}
        onBlur={handleLockerDraftCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        placeholder=" # "
        className="h-7 w-10 min-w-0 border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums shadow-none focus-visible:ring-0"
      />
    </label>
  );
}
