/**
 * `multipart/form-data`, decoded as bytes.
 *
 * No framework and no new dependency: an upload is the one thing `node:http`
 * hands over raw, and every body parser in the ecosystem is a dependency with
 * a CVE history for exactly this format.
 *
 * **The payload never becomes a string.** A workbook is a zip, so most of its
 * bytes are not valid UTF-8; decoding it to find a boundary and encoding it
 * back would corrupt the file silently. Only the part headers — which are
 * ASCII by the grammar — are read as text.
 */

export interface MultipartPart {
  readonly name: string;
  /** `null` for a plain field: only a file part carries a filename. */
  readonly filename: string | null;
  readonly bytes: Uint8Array;
}

const DASH_DASH = "--";
const CRLF = "\r\n";

function boundaryOf(contentType: string): string {
  const declared = /;\s*boundary=("?)([^";]+)\1/i.exec(contentType);
  if (!declared) {
    throw new Error("UPLOAD_INVALIDO");
  }
  return declared[2];
}

function indexOfBytes(
  haystack: Uint8Array,
  needle: Uint8Array,
  from: number,
): number {
  outer: for (let start = from; start + needle.length <= haystack.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return start;
  }
  return -1;
}

function ascii(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "latin1"));
}

function dispositionOf(headers: string): {
  readonly name: string;
  readonly filename: string | null;
} {
  const line = headers
    .split(CRLF)
    .find((header) => /^content-disposition:/i.test(header));
  const name = line ? /;\s*name="([^"]*)"/i.exec(line) : null;
  if (!line || !name) {
    throw new Error("UPLOAD_INVALIDO");
  }
  const filename = /;\s*filename="([^"]*)"/i.exec(line);
  return { name: name[1], filename: filename ? filename[1] : null };
}

export function parseMultipartFormData(
  contentType: string,
  body: Uint8Array,
): readonly MultipartPart[] {
  const boundary = boundaryOf(contentType);
  const delimiter = ascii(`${CRLF}${DASH_DASH}${boundary}`);
  // The first boundary opens the body and so has no leading CRLF of its own.
  const opening = ascii(`${DASH_DASH}${boundary}`);
  if (indexOfBytes(body, opening, 0) !== 0) {
    throw new Error("UPLOAD_INVALIDO");
  }

  const parts: MultipartPart[] = [];
  const headerSeparator = ascii(CRLF + CRLF);
  let cursor = opening.length;

  for (;;) {
    if (
      body[cursor] === 0x2d &&
      body[cursor + 1] === 0x2d
    ) {
      // The closing delimiter: `--boundary--`. Anything after it is epilogue.
      return parts;
    }

    const headersEnd = indexOfBytes(body, headerSeparator, cursor);
    if (headersEnd < 0) {
      throw new Error("UPLOAD_INVALIDO");
    }

    const headers = Buffer.from(
      body.subarray(cursor, headersEnd),
    ).toString("latin1");
    const contentStart = headersEnd + headerSeparator.length;
    const contentEnd = indexOfBytes(body, delimiter, contentStart);
    if (contentEnd < 0) {
      // No closing delimiter: the upload was cut short. A wallet imported from
      // half a spreadsheet is worse than an upload that failed.
      throw new Error("UPLOAD_INVALIDO");
    }

    const { name, filename } = dispositionOf(headers);
    parts.push({
      name,
      filename,
      bytes: body.slice(contentStart, contentEnd),
    });
    cursor = contentEnd + delimiter.length;
  }
}
