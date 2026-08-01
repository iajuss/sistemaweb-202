import { describe, expect, it } from "vitest";

import { parseMultipartFormData } from "./multipart.js";

/**
 * A browser uploads a spreadsheet as `multipart/form-data` and nothing in
 * `node:http` decodes it. The rule this file holds: the payload is **bytes**
 * from end to end. Decoding an XLSX as text to find a boundary corrupts every
 * byte that is not valid UTF-8, which in a workbook is most of them.
 */

const BOUNDARY = "----limiteDeTeste";

function part(headers: string, content: Uint8Array): Uint8Array {
  const prefix = Buffer.from(`--${BOUNDARY}\r\n${headers}\r\n\r\n`, "utf8");
  return Buffer.concat([prefix, Buffer.from(content), Buffer.from("\r\n", "utf8")]);
}

function body(...parts: readonly Uint8Array[]): Uint8Array {
  return Buffer.concat([
    ...parts.map((value) => Buffer.from(value)),
    Buffer.from(`--${BOUNDARY}--\r\n`, "utf8"),
  ]);
}

const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

describe("multipart/form-data", () => {
  it("returns a file part with its bytes untouched", () => {
    // A zip signature, a NUL and a stray CR: none of these survive a round trip
    // through a text decoder, and all of them appear in a real workbook.
    const workbook = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x0d, 0xff]);

    const parts = parseMultipartFormData(
      CONTENT_TYPE,
      body(
        part(
          'Content-Disposition: form-data; name="arquivo"; filename="carteira.xlsx"\r\n' +
            "Content-Type: application/octet-stream",
          workbook,
        ),
      ),
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].name).toBe("arquivo");
    expect(parts[0].filename).toBe("carteira.xlsx");
    expect([...parts[0].bytes]).toEqual([...workbook]);
  });

  it("returns a text field next to the file", () => {
    const parts = parseMultipartFormData(
      CONTENT_TYPE,
      body(
        part('Content-Disposition: form-data; name="preparo"', Buffer.from("p-1")),
        part(
          'Content-Disposition: form-data; name="arquivo"; filename="c.csv"',
          Buffer.from("id_externo\n"),
        ),
      ),
    );

    expect(parts.map((entry) => entry.name)).toEqual(["preparo", "arquivo"]);
    expect(Buffer.from(parts[0].bytes).toString("utf8")).toBe("p-1");
    expect(parts[0].filename).toBeNull();
  });

  it("refuses a content type that declares no boundary", () => {
    expect(() =>
      parseMultipartFormData("multipart/form-data", body()),
    ).toThrow("UPLOAD_INVALIDO");
  });

  it("refuses a truncated upload instead of importing what arrived", () => {
    // The closing boundary never came, so the connection dropped mid-file. A
    // wallet imported from half a spreadsheet is worse than a failed upload.
    const truncated = part(
      'Content-Disposition: form-data; name="arquivo"; filename="c.csv"',
      Buffer.from("id_externo;nome\nTIT-001;JOSE"),
    );

    expect(() => parseMultipartFormData(CONTENT_TYPE, truncated)).toThrow(
      "UPLOAD_INVALIDO",
    );
  });

  it("accepts a boundary the browser wrapped in quotes", () => {
    const parts = parseMultipartFormData(
      `multipart/form-data; boundary="${BOUNDARY}"`,
      body(part('Content-Disposition: form-data; name="preparo"', Buffer.from("p-1"))),
    );

    expect(parts).toHaveLength(1);
  });
});
