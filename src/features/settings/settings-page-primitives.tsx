import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface TabsOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SettingsCardTitleProps {
  icon: LucideIcon;
  children: ReactNode;
}

interface ToggleSettingRowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

interface OptionTabsCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  options: TabsOption[];
  onValueChange: (value: string) => void;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmClassName?: string;
}

export function SettingsCardTitle({ icon: Icon, children }: SettingsCardTitleProps) {
  return (
    <CardTitle className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {children}
    </CardTitle>
  );
}

export function ToggleSettingRow({ id, label, hint, checked, onCheckedChange }: ToggleSettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function OptionTabsCard({ icon, title, value, options, onValueChange }: OptionTabsCardProps) {
  return (
    <Card>
      <CardHeader>
        <SettingsCardTitle icon={icon}>{title}</SettingsCardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={value} onValueChange={onValueChange}>
          <TabsList className="w-full">
            {options.map((option) => (
              <TabsTrigger key={option.value} value={option.value} className="flex-1" disabled={option.disabled}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  confirmClassName
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button className={confirmClassName} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
