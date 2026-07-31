import { createHash, randomUUID } from "node:crypto";

import {
  quarantineTitleRow,
  validateTitleRow,
  type AcceptedTitleRow,
  type QuarantineReason,
  type QuarantinedTitleRow,
  type RawTitleRow,
} from "@panella/domain";

import type { AuthenticatedOperationIdentity } from "./authorize-actor.js";
import {
  authorizeOperation,
  type AuthorizedOperation,
  type OperationPrincipal,
  type WalletAuthorizationRepository,
} from "./authorize-actor.js";

/**
 * The parser boundary. A file format is a plugable implementation detail: the
 * importer only needs cells and the line the operator will look at.
 */
export interface ParsedWalletRowInput {
  readonly rowNumber: number;
  readonly values: RawTitleRow;
}

export interface WalletFileParser {
  parse(bytes: Uint8Array): { readonly rows: readonly ParsedWalletRowInput[] };
}

export interface WalletImportPreview {
  readonly fileHash: string;
  readonly accepted: readonly AcceptedTitleRow[];
  readonly quarantined: readonly QuarantinedTitleRow[];
}

export interface WalletImportReport extends WalletImportPreview {
  readonly importId: string;
  readonly created: number;
  readonly updated: number;
}

export interface ImportedTitleRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly walletId: string;
  readonly debtorId: string;
  readonly externalId: string;
  readonly name: string;
  readonly amountCents: bigint;
  readonly dueDate: Date;
}

export interface WalletImportAuditEntry {
  readonly importId: string;
  readonly tenantId: string;
  readonly walletId: string;
  readonly actorId: string;
  readonly fileHash: string;
  readonly importedAt: string;
  readonly acceptedRows: number;
  readonly quarantinedRows: number;
  readonly quarantineReasons: Readonly<Record<string, number>>;
}

export interface WalletImportStore {
  readonly titles: {
    upsertByExternalId(
      principal: OperationPrincipal,
      operation: AuthorizedOperation,
      title: ImportedTitleRecord,
    ): Promise<"CRIADO" | "ATUALIZADO">;
  };
  readonly debtors: {
    resolveByCpf(
      principal: OperationPrincipal,
      operation: AuthorizedOperation,
      cpf: string,
    ): Promise<string>;
  };
  readonly imports: {
    record(
      principal: OperationPrincipal,
      operation: AuthorizedOperation,
      entry: WalletImportAuditEntry,
    ): Promise<void>;
  };
}

function hashBytes(bytes: Uint8Array): string {
  // The hash proves which file was imported. The bytes themselves are never
  // logged, echoed into the report, or kept after the rows are validated.
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Validates a file without writing anything. There is no store parameter and
 * no port to pass one through: a dry run that could mutate is not a dry run,
 * and the cheapest way to guarantee that is to make it unrepresentable.
 */
export function previewWalletImport(
  bytes: Uint8Array,
  parser: WalletFileParser,
): WalletImportPreview {
  const accepted: AcceptedTitleRow[] = [];
  const quarantined: QuarantinedTitleRow[] = [];
  const seenExternalIds = new Set<string>();

  for (const row of parser.parse(bytes).rows) {
    const validated = validateTitleRow(row.values, row.rowNumber);
    if (validated.status === "QUARENTENA") {
      quarantined.push(validated);
      continue;
    }

    // Only visible above one row: the same external id twice in one file means
    // one of the two is wrong, and guessing which would be worse than saying so.
    if (seenExternalIds.has(validated.externalId)) {
      quarantined.push(
        quarantineTitleRow(row.rowNumber, "ID_EXTERNO_DUPLICADO"),
      );
      continue;
    }

    seenExternalIds.add(validated.externalId);
    accepted.push(validated);
  }

  return { fileHash: hashBytes(bytes), accepted, quarantined };
}

function countReasons(
  quarantined: readonly QuarantinedTitleRow[],
): Readonly<Record<string, number>> {
  const counts: Partial<Record<QuarantineReason, number>> = {};
  for (const record of quarantined) {
    counts[record.reason] = (counts[record.reason] ?? 0) + 1;
  }
  return counts as Readonly<Record<string, number>>;
}

function titleId(
  tenantId: string,
  walletId: string,
  externalId: string,
): string {
  // Derived, not random: re-importing the same file has to land on the same
  // rows, and a deterministic id makes that true without a read-before-write.
  return createHash("sha256")
    .update(`${tenantId.length}:${tenantId}|${walletId.length}:${walletId}|${externalId}`)
    .digest("hex")
    .slice(0, 32);
}

export interface CommitWalletImportInput {
  readonly identity: AuthenticatedOperationIdentity;
  readonly walletId: string;
  readonly bytes: Uint8Array;
  readonly parser: WalletFileParser;
  readonly authorization: WalletAuthorizationRepository;
  readonly store: WalletImportStore;
  readonly now?: () => Date;
  readonly newImportId?: () => string;
}

export async function commitWalletImport(
  input: CommitWalletImportInput,
): Promise<WalletImportReport> {
  const operation = await authorizeOperation(
    input.identity,
    input.walletId,
    "IMPORT_WALLET",
    input.authorization,
  );
  if (!operation) {
    throw new Error("IMPORTACAO_NAO_AUTORIZADA");
  }

  const preview = previewWalletImport(input.bytes, input.parser);
  const { principal, context } = operation;
  const importId = (input.newImportId ?? randomUUID)();
  let created = 0;
  let updated = 0;

  for (const row of preview.accepted) {
    const debtorId = await input.store.debtors.resolveByCpf(
      principal,
      operation,
      row.cpfDigits,
    );
    const outcome = await input.store.titles.upsertByExternalId(
      principal,
      operation,
      {
        id: titleId(context.tenantId, input.walletId, row.externalId),
        tenantId: context.tenantId,
        walletId: input.walletId,
        debtorId,
        externalId: row.externalId,
        name: row.name,
        amountCents: row.amount.toCents(),
        dueDate: row.dueDate,
      },
    );
    if (outcome === "CRIADO") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  await input.store.imports.record(principal, operation, {
    importId,
    tenantId: context.tenantId,
    walletId: input.walletId,
    actorId: context.actor.id,
    fileHash: preview.fileHash,
    importedAt: (input.now ?? (() => new Date()))().toISOString(),
    acceptedRows: preview.accepted.length,
    quarantinedRows: preview.quarantined.length,
    quarantineReasons: countReasons(preview.quarantined),
  });

  return { ...preview, importId, created, updated };
}
