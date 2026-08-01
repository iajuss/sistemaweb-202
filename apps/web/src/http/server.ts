import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createRouter, type HttpRequest, type RouterDependencies } from "./router.js";

/**
 * Binds the pure router to `node:http`. No framework, and no new dependency:
 * the handlers are values in, values out, so this file is the only part that
 * knows what a socket is. Task 12 can wrap the same router in Next.js without
 * touching anything above.
 *
 * **This server cannot run in production.** Issuing a `VerifiedPrincipal`
 * outside `NODE_ENV=development` fails closed on every call (ADR 021), so a
 * production start authenticates nobody. That is the intended behaviour until
 * JWT/JWKS validation lands — pendency P-1.
 */

const MAX_BODY_BYTES = 1_048_576;
/**
 * An uploaded wallet is a spreadsheet, not a JSON document, so it gets its own
 * ceiling. Eight megabytes is far more than a client's title export and still
 * small enough that a process cannot be pushed over by one request.
 */
const MAX_UPLOAD_BYTES = 8 * 1_048_576;

async function collect(
  message: IncomingMessage,
  limit: number,
): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of message) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.byteLength;
    if (size > limit) {
      throw new Error("CORPO_GRANDE_DEMAIS");
    }
    chunks.push(buffer);
  }
  return chunks;
}

/**
 * Three body shapes, decided by the declared content type and never guessed:
 * an upload stays **bytes** (decoding a workbook as text corrupts it), a form
 * post becomes a record of fields, and everything else is JSON as before.
 */
async function readBody(message: IncomingMessage): Promise<unknown> {
  const contentType = message.headers["content-type"] ?? "";

  if (/^multipart\/form-data/i.test(contentType)) {
    const chunks = await collect(message, MAX_UPLOAD_BYTES);
    return new Uint8Array(Buffer.concat(chunks));
  }

  const chunks = await collect(message, MAX_BODY_BYTES);
  if (chunks.length === 0) {
    return null;
  }
  const text = Buffer.concat(chunks).toString("utf8");

  if (/^application\/x-www-form-urlencoded/i.test(contentType)) {
    return Object.fromEntries(new URLSearchParams(text));
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("CORPO_NAO_E_JSON");
  }
}

function toHttpRequest(
  message: IncomingMessage,
  body: unknown,
): HttpRequest {
  // `host` is only ever used to parse the relative URL. Nothing downstream
  // reads it, so a forged Host header cannot influence routing or identity.
  const url = new URL(message.url ?? "/", "http://localhost");
  return {
    method: message.method ?? "GET",
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(
      Object.entries(message.headers).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
    body,
  };
}

export function createHttpServer(deps: RouterDependencies) {
  const route = createRouter(deps);

  return createServer((message: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      try {
        const body = await readBody(message);
        const result = await route(toHttpRequest(message, body));
        const payload =
          typeof result.body === "string"
            ? result.body
            : JSON.stringify(result.body);
        response.writeHead(result.status, {
          "content-type": result.contentType ?? "application/json; charset=utf-8",
          // The dossier is personal data about a named person. Nothing on this
          // surface may be cached by a proxy on the way back.
          "cache-control": "no-store",
          ...result.headers,
        });
        response.end(payload);
      } catch (error) {
        // The message is a code, never the request: a body that failed to
        // parse may hold a CPF, and echoing it would put it in a log.
        const codigo = error instanceof Error ? error.message : "ERRO_INTERNO";
        response.writeHead(400, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(JSON.stringify({ erro: codigo }));
      }
    })();
  });
}
