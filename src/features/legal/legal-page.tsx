import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSettings } from "@/app/settings-context";

const ISC_LICENSE = `ISC License

Copyright (c) 2022 Lucide Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

interface LicenseEntry {
  name: string;
  license: string;
  copyright: string;
  url: string;
}

const MIT_DEPS: LicenseEntry[] = [
  { name: "React", license: "MIT", copyright: "Copyright (c) Meta Platforms, Inc. and affiliates.", url: "https://github.com/facebook/react" },
  { name: "React DOM", license: "MIT", copyright: "Copyright (c) Meta Platforms, Inc. and affiliates.", url: "https://github.com/facebook/react" },
  { name: "React Router", license: "MIT", copyright: "Copyright (c) Remix Software Inc.", url: "https://github.com/remix-run/react-router" },
  { name: "@radix-ui (Dialog, Tabs, Slot, …)", license: "MIT", copyright: "Copyright (c) 2022 WorkOS", url: "https://github.com/radix-ui/primitives" },
  { name: "Sonner", license: "MIT", copyright: "Copyright (c) 2023 Emil Kowalski", url: "https://github.com/emilkowalski/sonner" },
  { name: "clsx", license: "MIT", copyright: "Copyright (c) Luke Edwards", url: "https://github.com/lukeed/clsx" },
  { name: "tailwind-merge", license: "MIT", copyright: "Copyright (c) 2021 Dani Guardiola", url: "https://github.com/dcastil/tailwind-merge" },
  { name: "Zod", license: "MIT", copyright: "Copyright (c) 2020 Colin McDonnell", url: "https://github.com/colinhacks/zod" },
  { name: "Geist Sans (@fontsource)", license: "MIT / SIL OFL 1.1", copyright: "Copyright (c) Vercel, Inc.", url: "https://github.com/vercel/geist-font" },
];

const APACHE_DEPS: LicenseEntry[] = [
  { name: "Dexie.js", license: "Apache-2.0", copyright: "Copyright (c) 2014-2024 David Fahlander and Dexie contributors.", url: "https://github.com/dexie/Dexie.js" },
  { name: "class-variance-authority", license: "Apache-2.0", copyright: "Copyright (c) Joe Bell.", url: "https://github.com/joe-bell/cva" },
];

export function LegalPage() {
  const { t } = useSettings();

  return (
    <section className="space-y-4">
      {/* App */}
      <Card>
        <CardHeader>
          <CardTitle>GymTracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            GymTracker is open-source software released under the{" "}
            <a
              href="https://github.com/christianphilie/gymtracker/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              MIT License
            </a>
            .
          </p>
          <p>All data is stored locally on your device. No personal data is transmitted to any server.</p>
        </CardContent>
      </Card>

      {/* ISC – Lucide React (full license text required) */}
      <Card>
        <CardHeader>
          <CardTitle>Lucide React</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Icons provided by{" "}
            <a href="https://lucide.dev" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
              Lucide
            </a>{" "}
            – licensed under the ISC License.
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">
            {ISC_LICENSE}
          </pre>
        </CardContent>
      </Card>

      {/* Apache 2.0 */}
      <Card>
        <CardHeader>
          <CardTitle>Apache License 2.0</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The following libraries are licensed under the{" "}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Apache License, Version 2.0
            </a>
            :
          </p>
          <ul className="space-y-2">
            {APACHE_DEPS.map((dep) => (
              <li key={dep.name} className="rounded-md border p-2">
                <p className="font-medium text-foreground">
                  <a href={dep.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {dep.name}
                  </a>
                </p>
                <p className="text-xs">{dep.copyright}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* MIT */}
      <Card>
        <CardHeader>
          <CardTitle>MIT License</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>The following libraries are licensed under the MIT License:</p>
          <ul className="space-y-2">
            {MIT_DEPS.map((dep) => (
              <li key={dep.name} className="rounded-md border p-2">
                <p className="font-medium text-foreground">
                  <a href={dep.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {dep.name}
                  </a>
                </p>
                <p className="text-xs">{dep.copyright}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
