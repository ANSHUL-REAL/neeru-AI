/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function openRouterKey(req: IncomingMessage): string {
  const header = req.headers["x-openrouter-key"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.VITE_OPENROUTER_API_KEY ||
    fromHeader ||
    ""
  );
}

function briefPlugin(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split("?")[0];
    if (url !== "/api/openrouter" && url !== "/api/brief") {
      next();
      return;
    }
    if (req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          configured: Boolean(process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY),
        }),
      );
      return;
    }
    if (req.method !== "POST") {
      next();
      return;
    }
    const key = openRouterKey(req);
    if (!key) {
      res.statusCode = 501;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "OPENROUTER_API_KEY missing" }));
      return;
    }
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://127.0.0.1:5173",
          "X-Title": "Neeru",
        },
        body: JSON.stringify(body),
      });
      const json = (await upstream.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      const text = json.choices?.[0]?.message?.content ?? null;
      res.statusCode = upstream.ok ? 200 : upstream.status;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          text,
          error: json.error?.message ?? (upstream.ok ? null : `OpenRouter HTTP ${upstream.status}`),
        }),
      );
    } catch (err) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "brief failed" }));
    }
  };
  return {
    name: "neeru-brief",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), briefPlugin()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
