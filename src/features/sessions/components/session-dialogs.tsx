import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { TranslationKey } from "@/i18n/translations";

const DANGER_BUTTON_CLASS = "border-red-700 bg-red-700 text-white hover:bg-red-800";

interface DeleteExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function DeleteExerciseDialog({ open, onOpenChange, onConfirm, t }: DeleteExerciseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("removeExercise")}</DialogTitle>
          <DialogDescription>{t("deleteExerciseConfirm")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button className={DANGER_BUTTON_CLASS} onClick={onConfirm}>{t("removeExercise")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DiscardSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function DiscardSessionDialog({ open, onOpenChange, onConfirm, t }: DiscardSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("discardSession")}</DialogTitle>
          <DialogDescription>{t("discardSessionConfirm")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button className={DANGER_BUTTON_CLASS} onClick={onConfirm}>{t("discardSession")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CompleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleteWithoutTemplate: () => Promise<void>;
  onCompleteWithTemplate: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function CompleteSessionDialog({
  open,
  onOpenChange,
  onCompleteWithoutTemplate,
  onCompleteWithTemplate,
  t
}: CompleteSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("completeSession")}</DialogTitle>
          <DialogDescription>{t("completeSessionTemplatePrompt")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button variant="outline" onClick={onCompleteWithoutTemplate}>{t("completeWithoutTemplate")}</Button>
          <Button className="sm:min-w-[230px]" onClick={onCompleteWithTemplate}>{t("completeWithTemplate")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
