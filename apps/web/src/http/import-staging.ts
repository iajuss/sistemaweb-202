import { randomUUID } from "node:crypto";

import type { AuthorizedOperation } from "@panella/application";

import { assertWalletImportOperation } from "../../../../packages/adapters/src/repositories/tenant-repository.js";

/**
 * Where an uploaded wallet waits between the preview and the commit.
 *
 * The preview is required to write nothing, and the commit is required to
 * import the very bytes the operator saw previewed. Something therefore has to
 * hold the file across two requests. The alternative — sending it back to the
 * browser in a hidden field and taking it again on the next post — would put a
 * spreadsheet full of CPFs into a page's markup, so the bytes stay here.
 *
 * Three properties make the token safe to hand to a browser:
 *
 * - It is **random**, never derived from the file. A token computed from the
 *   contents would be an oracle for whether a given file was ever uploaded.
 * - It is **scoped**: the tenant and wallet are recorded from the authorized
 *   operation, and a token presented under any other is not found. Holding the
 *   token is not authorization.
 * - It **expires and is spent**. A preview the operator abandoned must not keep
 *   other people's CPFs in memory for the life of the process.
 *
 * This is process memory, which is the same limit the demo's key vault already
 * has (pendency F-5): a preview does not survive a restart. It is deliberately
 * not a database table — staged bytes are not a record of anything, and giving
 * them a home in storage would mean retention and purge rules for a file the
 * operator has not yet decided to import.
 */

export interface StagedWalletFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

export interface WalletImportStaging {
  stage(operation: AuthorizedOperation, file: StagedWalletFile): string;
  take(operation: AuthorizedOperation, token: string): StagedWalletFile | null;
}

export interface ImportStagingOptions {
  readonly ttlMs?: number;
  readonly capacity?: number;
  readonly now?: () => number;
}

interface StagedEntry {
  readonly tenantId: string;
  readonly walletId: string;
  readonly file: StagedWalletFile;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_CAPACITY = 16;

export function createInMemoryImportStaging(
  options: ImportStagingOptions = {},
): WalletImportStaging {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const now = options.now ?? (() => Date.now());
  // Insertion-ordered, which is what makes evicting the oldest a `keys().next()`.
  const entries = new Map<string, StagedEntry>();

  function scopeOf(operation: AuthorizedOperation): {
    readonly tenantId: string;
    readonly walletId: string;
  } {
    // The same guard the repositories use, and for the same reason: only an
    // operation the issuer issued for an import may reach this.
    const context = assertWalletImportOperation(operation.principal, operation);
    return { tenantId: context.tenantId, walletId: operation.walletId };
  }

  function dropExpired(): void {
    const instant = now();
    for (const [token, entry] of entries) {
      if (entry.expiresAt <= instant) {
        entries.delete(token);
      }
    }
  }

  return {
    stage(operation, file) {
      const scope = scopeOf(operation);
      dropExpired();
      while (entries.size >= capacity) {
        const oldest = entries.keys().next();
        if (oldest.done) {
          break;
        }
        entries.delete(oldest.value);
      }

      const token = randomUUID();
      entries.set(token, { ...scope, file, expiresAt: now() + ttlMs });
      return token;
    },

    take(operation, token) {
      const scope = scopeOf(operation);
      dropExpired();
      const entry = entries.get(token);
      if (
        !entry ||
        entry.tenantId !== scope.tenantId ||
        entry.walletId !== scope.walletId
      ) {
        return null;
      }
      entries.delete(token);
      return entry.file;
    },
  };
}
