import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "border border-border bg-background text-foreground",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground"
        }
      }}
    />
  );
}
