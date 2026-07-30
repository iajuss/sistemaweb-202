CREATE TYPE "ActorKind" AS ENUM ('HUMAN', 'AGENT', 'SYSTEM');
CREATE TYPE "HumanRole" AS ENUM ('ADMIN_TENANT', 'ANALISTA_DOSSIE', 'OPERADOR_COBRANCA', 'ENCARREGADO_LGPD');
CREATE TYPE "SourceStatus" AS ENUM ('ENCONTRADO', 'NAO_ENCONTRADO', 'NAO_CONSULTADO', 'ERRO_NA_FONTE');

CREATE TABLE "Tenant" (
  "id" TEXT PRIMARY KEY,
  "theme" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Wallet" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "Debtor" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cpfCiphertext" BYTEA NOT NULL,
  "cpfIv" BYTEA NOT NULL,
  "cpfAuthTag" BYTEA NOT NULL,
  "cpfHmac" TEXT NOT NULL,
  "hmacKeyReference" TEXT NOT NULL,
  "keyReference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Debtor_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Debtor_tenantId_cpfHmac_key" UNIQUE ("tenantId", "cpfHmac")
);

CREATE TABLE "Title" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "debtorId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Title_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Title_tenantId_walletId_externalId_key" UNIQUE ("tenantId", "walletId", "externalId"),
  CONSTRAINT "Title_wallet_fkey" FOREIGN KEY ("tenantId", "walletId") REFERENCES "Wallet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Title_debtor_fkey" FOREIGN KEY ("tenantId", "debtorId") REFERENCES "Debtor"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ActorIdentity" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "kind" "ActorKind" NOT NULL,
  "roles" "HumanRole"[] NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ActorIdentity_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "ActorIdentity_tenantId_provider_subject_key" UNIQUE ("tenantId", "provider", "subject")
);

CREATE TABLE "AgentWalletGrant" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "actions" TEXT[] NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AgentWalletGrant_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "AgentWalletGrant_tenantId_actorId_walletId_key" UNIQUE ("tenantId", "actorId", "walletId"),
  CONSTRAINT "AgentWalletGrant_actor_fkey" FOREIGN KEY ("tenantId", "actorId") REFERENCES "ActorIdentity"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AgentWalletGrant_wallet_fkey" FOREIGN KEY ("tenantId", "walletId") REFERENCES "Wallet"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Observation" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "debtorId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "SourceStatus" NOT NULL,
  "queryParams" JSONB NOT NULL,
  "payload" JSONB,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Observation_tenantId_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "Observation_debtor_fkey" FOREIGN KEY ("tenantId", "debtorId") REFERENCES "Debtor"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Wallet_tenantId_idx" ON "Wallet"("tenantId");
CREATE INDEX "Debtor_tenantId_idx" ON "Debtor"("tenantId");
CREATE INDEX "Title_tenantId_debtorId_idx" ON "Title"("tenantId", "debtorId");
CREATE INDEX "ActorIdentity_tenantId_idx" ON "ActorIdentity"("tenantId");
CREATE INDEX "AgentWalletGrant_tenantId_walletId_idx" ON "AgentWalletGrant"("tenantId", "walletId");
CREATE INDEX "Observation_tenantId_debtorId_source_idx" ON "Observation"("tenantId", "debtorId", "source");

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Tenant_scope" ON "Tenant"
  USING ("id" = current_setting('app.tenant_id', true))
  WITH CHECK ("id" = current_setting('app.tenant_id', true));

ALTER TABLE "Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Wallet_scope" ON "Wallet"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Debtor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Debtor" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Debtor_scope" ON "Debtor"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Title" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Title" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Title_scope" ON "Title"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ActorIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActorIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ActorIdentity_scope" ON "ActorIdentity"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "AgentWalletGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentWalletGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AgentWalletGrant_scope" ON "AgentWalletGrant"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Observation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Observation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Observation_scope" ON "Observation"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

REVOKE CREATE ON SCHEMA public FROM dossie_app;
GRANT USAGE ON SCHEMA public TO dossie_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dossie_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dossie_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dossie_app;
