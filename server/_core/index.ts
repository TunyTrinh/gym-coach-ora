import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { randomUUID } from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { closeDb } from "../db";
import { ensureBootstrapAdminAccount } from "../admin-bootstrap";
import { assertAuthEnvironment } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  assertAuthEnvironment();
  await ensureBootstrapAdminAccount();
  const app = express();
  const server = createServer(app);
  const isProduction = process.env.NODE_ENV === "production";
  const staticDir = path.resolve(process.env.STATIC_DIR ?? path.join(process.cwd(), "web"));
  const bodyLimit = process.env.REQUEST_BODY_LIMIT ?? "1mb";

  // Caddy terminates TLS on the public host; trust its forwarded protocol for secure cookies.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // These headers also protect the direct application port during development and internal deployments.
  app.use((req, res, next) => {
    const suppliedRequestId = req.header("x-request-id");
    const requestId = suppliedRequestId && /^[A-Za-z0-9._-]{8,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // Preview remains cross-origin. Production serves one same-origin PWA and API.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isSameOrigin = !origin || (() => {
      try {
        return new URL(origin).host === req.get("host");
      } catch {
        return false;
      }
    })();
    if (origin && (!isProduction || isSameOrigin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Current API mutations are metadata-only. Keep a conservative limit rather than accepting 50 MB by default.
  app.use(express.json({ limit: bodyLimit, strict: true }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: false }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  if (isProduction) {
    app.use(express.static(staticDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("sw.js") || filePath.endsWith("manifest.json") || filePath.endsWith("release.json") || filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    }));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "API route not found" });
        return;
      }
      // The HTML entry selects the hashed JavaScript bundle. Never allow a
      // proxy, browser, or older service worker to retain it across releases.
      res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] received ${signal}; closing HTTP server`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    server.close((error) => {
      clearTimeout(forceExit);
      if (error) {
        console.error("[api] shutdown error", error);
        process.exit(1);
      }
      void closeDb().catch((databaseError) => {
        console.error("[api] database shutdown error", databaseError);
      }).finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch((error) => {
  console.error("[api] startup failed", error);
  process.exitCode = 1;
});
