import { attachDatabasePool } from "@neon/functions";
import { createRemoteJWKSet } from "jose";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool } from "pg";
import { handleRequest, type ApiDependencies } from "./main.js";

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : undefined;
if (pool) attachDatabasePool(pool);

const jwks = process.env.NEON_AUTH_JWKS_URL
  ? createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL))
  : undefined;

const dependencies: ApiDependencies = {
  ...(jwks ? { jwks } : {}),
  ...(process.env.NEON_AUTH_BASE_URL ? { issuer: process.env.NEON_AUTH_BASE_URL } : {}),
  ...(pool ? { pool } : {}),
};

const MAX_REQUEST_BYTES = 1_048_576;

function headerValue(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(", ") : String(value);
}

/**
 * Neon Functions exposes the web-standard fetch(Request) contract. This
 * adapter keeps the existing Node HTTP router as the single API source of
 * truth while translating the request/response boundary.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    let body = Buffer.alloc(0);
    if (request.body && request.method !== "GET" && request.method !== "HEAD") {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_REQUEST_BYTES) {
        return Response.json({ error: "request_body_too_large" }, { status: 413 });
      }
      body = Buffer.from(bytes);
    }

    const url = new URL(request.url);
    const requestStream = new PassThrough();
    const incoming = requestStream as unknown as IncomingMessage;
    Object.assign(incoming, {
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers.entries()) as IncomingMessage["headers"],
    });
    requestStream.end(body);

    const responseHeaders = new Headers();
    let statusCode = 200;
    let responseBody = "";
    const outgoing = {
      setHeader(name: string, value: number | string | readonly string[]) {
        responseHeaders.set(name, headerValue(value));
        return this;
      },
      writeHead(status: number, headers?: Record<string, unknown>) {
        statusCode = status;
        for (const [name, value] of Object.entries(headers ?? {})) {
          if (value !== undefined && value !== null) responseHeaders.set(name, headerValue(value));
        }
        return this;
      },
      end(chunk?: unknown) {
        if (chunk !== undefined && chunk !== null) {
          responseBody = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        }
        return this;
      },
    } as unknown as ServerResponse;

    try {
      await handleRequest(incoming, outgoing, dependencies);
    } catch {
      console.error("PONDOK OS API function request failed");
      statusCode = 500;
      responseHeaders.set("content-type", "application/json; charset=utf-8");
      responseHeaders.set("cache-control", "no-store");
      responseBody = JSON.stringify({ error: "internal_server_error" });
    }

    const suppressBody = request.method === "HEAD" || [204, 205, 304].includes(statusCode);
    return new Response(suppressBody ? null : responseBody, {
      status: statusCode,
      headers: responseHeaders,
    });
  },
};
