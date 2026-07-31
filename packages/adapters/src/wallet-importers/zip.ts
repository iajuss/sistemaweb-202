import { inflateRawSync } from "node:zlib";

/**
 * The slice of ZIP an XLSX actually uses. See ADR 022 for why this is written
 * here instead of installed: XLSX is a published container format, not a third
 * party contract, and the alternative was a dependency tree or a stale package.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATE = 8;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const data = view(bytes);
  // The record is last but carries a variable-length comment, so it is found
  // by scanning back from the end rather than by a fixed offset.
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (data.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  return -1;
}

export function readZipEntries(bytes: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) {
    throw new Error("XLSX_INVALIDO");
  }

  const data = view(bytes);
  const entryCount = data.getUint16(endOffset + 10, true);
  let cursor = data.getUint32(endOffset + 16, true);
  const entries = new Map<string, Uint8Array>();

  for (let index = 0; index < entryCount; index += 1) {
    if (data.getUint32(cursor, true) !== CENTRAL_FILE_HEADER) {
      throw new Error("XLSX_INVALIDO");
    }

    const method = data.getUint16(cursor + 10, true);
    const compressedSize = data.getUint32(cursor + 20, true);
    const nameLength = data.getUint16(cursor + 28, true);
    const extraLength = data.getUint16(cursor + 30, true);
    const commentLength = data.getUint16(cursor + 32, true);
    const localOffset = data.getUint32(cursor + 42, true);
    const name = new TextDecoder("utf-8").decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );

    if (data.getUint32(localOffset, true) !== LOCAL_FILE_HEADER) {
      throw new Error("XLSX_INVALIDO");
    }
    // The local header's own extra field may differ in length from the central
    // one, so the data offset is computed from the local header alone.
    const dataOffset =
      localOffset +
      30 +
      data.getUint16(localOffset + 26, true) +
      data.getUint16(localOffset + 28, true);
    const stored = bytes.subarray(dataOffset, dataOffset + compressedSize);

    if (method === STORED) {
      entries.set(name, stored);
    } else if (method === DEFLATE) {
      entries.set(name, inflateRawSync(stored));
    } else {
      throw new Error("XLSX_COMPRESSAO_NAO_SUPORTADA");
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
