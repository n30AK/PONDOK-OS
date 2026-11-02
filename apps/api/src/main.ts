import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export const SERVICE_NAME = "pondok-os-api";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(body));
}

export function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (pathname === "/health/live") {
    sendJson(response, 200, { status: "ok", service: SERVICE_NAME });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

export function createApiServer() {
  return createServer(handleRequest);
}

function start(): void {
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const server = createApiServer();
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`PONDOK OS API listening on port ${port}\n`);
  });

  const shutdown = (signal: string) => {
    process.stdout.write(`Received ${signal}; closing HTTP server\n`);
    server.close((error) => {
      if (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start();
}
