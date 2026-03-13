import { Flag, Import, X } from "lucide-react";
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button className={DANGER_BUTTON_CLASS} onClick={onConfirm}>
            <X className="mr-2 h-4 w-4" />
            {t("discardSession")}
          </Button>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button variant="outline" onClick={onCompleteWithoutTemplate}>
            <Flag className="mr-2 h-4 w-4" />
            {t("completeWithoutTemplate")}
          </Button>
          <Button className="sm:min-w-[230px]" onClick={onCompleteWithTemplate}>
            <Import className="mr-2 h-4 w-4" />
            {t("completeWithTemplate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReorderModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  t: (key: TranslationKey) => string;
}

export function ReorderModeDialog({ open, onOpenChange, onConfirm, t }: ReorderModeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reorderMode")}</DialogTitle>
          <DialogDescription>{t("reorderModeDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={onConfirm}>{t("reorderModeStart")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReverseSessionOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function ReverseSessionOrderDialog({
  open,
  onOpenChange,
  onConfirm,
  t
}: ReverseSessionOrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reverseSessionExerciseOrder")}</DialogTitle>
          <DialogDescription>{t("reverseSessionExerciseOrderConfirm")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={onConfirm}>{t("reverseSessionExerciseOrder")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
