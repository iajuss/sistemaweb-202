-- Wallet persistence, observation coverage and the import audit trail.
--
-- Task 6.5: titles and observations stop being in-memory values. The unique
-- index on ("tenantId", "walletId", "externalId") already exists from the first
-- migration, so idempotent re-import is enforced by the database rather than by
-- a Map key. What is added here is what the dossier needs to be composed from
-- storage, and the audit table that records who imported what.

-- The debtor name declared on the imported row. Identity resolution starts
-- from name + CPF, so a title without a name cannot serve a dossier; Task 4
-- already quarantines those rows, which is why the column is NOT NULL.
ALTER TABLE "Title" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Title" ALTER COLUMN "name" DROP DEFAULT;

-- Coverage is decided per slice: a system read in one UF has not looked at the
-- other two (ADR 014). Existing rows predate slice-aware ingestion and are
-- backfilled to the wallet slice, which is the only slice they can have come
-- from at this point in the project.
ALTER TABLE "Observation" ADD COLUMN "sliceId" TEXT NOT NULL DEFAULT 'CARTEIRA';
ALTER TABLE "Observation" ALTER COLUMN "sliceId" DROP DEFAULT;

-- Nullable because not every source publishes a reference date. Kept apart
-- from "collectedAt", which is when the fact was read, never when it was true.
ALTER TABLE "Observation" ADD COLUMN "referenceDate" TIMESTAMP(3);

CREATE INDEX "Observation_tenantId_debtorId_source_sliceId_idx"
  ON "Observation"("tenantId", "debtorId", "source", "sliceId");

CREATE TABLE "WalletImport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "walletId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL,
  "acceptedRows" INTEGER NOT NULL,
  "quarantinedRows" INTEGER NOT NULL,
  "quarantineReasons" JSONB NOT NULL,
  CONSTRAINT "WalletImport_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "WalletImport_wallet_fkey" FOREIGN KEY ("tenantId", "walletId")
    REFERENCES "Wallet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WalletImport_tenantId_walletId_idx"
  ON "WalletImport"("tenantId", "walletId");

-- Every table carrying "tenantId" is covered by forced RLS; the catalog test
-- asserts that with no exception list, so a new table without this fails.
ALTER TABLE "WalletImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletImport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "WalletImport_scope" ON "WalletImport"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Append-only, enforced by privilege rather than by convention: an import that
-- happened cannot stop having happened, and cannot be rewritten either. The
-- default privileges granted DELETE and UPDATE on every table, so both are
-- revoked here for this one.
GRANT SELECT, INSERT ON "WalletImport" TO dossie_app;
REVOKE UPDATE, DELETE ON "WalletImport" FROM dossie_app;
