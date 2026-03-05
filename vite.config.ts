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

function createDeploymentBrandingPlugin(): Plugin {
  return {
    name: "deployment-branding",
    transformIndexHtml(html) {
      const isProductionRelease = process.env.RELEASE_CHANNEL === "production";
      const replacements = {
        "__APP_MANIFEST__": isProductionRelease ? "/site.webmanifest" : "/site-beta.webmanifest",
        "__APP_ICON_SVG__": isProductionRelease ? "/favicon.svg" : "/favicon-beta.svg",
        "__APP_ICON_192__": isProductionRelease ? "/icon-192.png" : "/icon-192-beta.png",
        "__APP_ICON_512__": isProductionRelease ? "/icon-512.png" : "/icon-512-beta.png",
        "__APPLE_TOUCH_ICON__": isProductionRelease ? "/apple-touch-icon.png" : "/apple-touch-icon-beta.png"
      };

      return Object.entries(replacements).reduce(
        (currentHtml, [placeholder, value]) => currentHtml.replaceAll(placeholder, value),
        html
      );
    }
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      createDevApiPlugin(),
      createDeploymentBrandingPlugin(),
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.svg",
          "favicon-beta.svg",
          "icon-192.png",
          "icon-512.png",
          "apple-touch-icon.png",
          "icon-192-beta.png",
          "icon-512-beta.png",
          "apple-touch-icon-beta.png",
          "site.webmanifest",
          "site-beta.webmanifest"
        ],
        manifest: false,
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"]
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
