import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSettings } from "@/app/settings-context";

const navItems = [
  { to: "/", key: "dashboard" as const },
  { to: "/import", key: "import" as const },
  { to: "/settings", key: "settings" as const }
];

export function AppShell() {
  const { t } = useSettings();

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            {t("appName")}
          </Link>
          <nav className="hidden gap-2 sm:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md border px-3 py-1.5 text-sm",
                    isActive ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary"
                  )
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background p-2 sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md border px-2 py-2 text-center text-xs",
                  isActive ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                )
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
