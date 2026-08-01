import { parseWalletCsv } from "./csv.js";
import { parseWalletXlsx } from "./xlsx.js";
import type { ParsedWalletFile } from "./parsed-file.js";

/**
 * One entry point for a file whose format nobody declared.
 *
 * The operator picks a file; the browser sends whatever the workstation's
 * registry associates with the extension, which for XLSX is routinely
 * `application/octet-stream`. Trusting that header — or the extension — would
 * put the choice of parser in the hands of the request. The zip local file
 * header is what an XLSX actually is, so that is what decides.
 */

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= ZIP_SIGNATURE.length &&
    ZIP_SIGNATURE.every((byte, position) => bytes[position] === byte)
  );
}

export function parseWalletFile(bytes: Uint8Array): ParsedWalletFile {
  return isZip(bytes) ? parseWalletXlsx(bytes) : parseWalletCsv(bytes);
}
