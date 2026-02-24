import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
import aiImportHandler from "./api/ai-import";
import exerciseInfoHandler from "./api/exercise-info";

type ApiHandler = (req: { method?: string; body?: unknown }, res: { status: (code: number) => unknown; json: (value: unknown) => void }) => Promise<void>;

function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function createDevApiPlugin(): Plugin {
  const routes = new Map<string, ApiHandler>([
    ["/api/ai-import", aiImportHandler as ApiHandler],
    ["/api/exercise-info", exerciseInfoHandler as ApiHandler]
  ]);

  return {
    name: "local-api-routes",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        const handler = routes.get(pathname);
        if (!handler) {
          next();
          return;
        }

        void (async () => {
          const rawBody = req.method === "POST" ? await readRequestBody(req as IncomingMessage) : undefined;
          let statusCode = 200;
          const apiRes = {
            status(code: number) {
              statusCode = code;
              return apiRes;
            },
            json(value: unknown) {
              if (!res.headersSent) {
                res.statusCode = statusCode;
                res.setHeader("content-type", "application/json; charset=utf-8");
              }
              res.end(JSON.stringify(value));
            }
          };

          await handler(
            {
              method: req.method,
              body: rawBody
            },
            apiRes
          );
        })().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            (res as ServerResponse).statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
          }
          res.end(JSON.stringify({ error: "Local API middleware failed", detail: message }));
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      createDevApiPlugin(),
      react(),
      VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Gymtracker",
        short_name: "Gymtracker",
        description: "Simple workout tracker PWA",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"]
      }
      })
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url))
      }
    }
  };
});
