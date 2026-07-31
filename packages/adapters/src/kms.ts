import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { z } from "zod";

export interface CpfAssociatedData {
  readonly tenantId: string;
  readonly debtorId: string;
}

export interface AuditSkeleton {
  readonly pseudonymousDebtorId: string;
  readonly tenantId: string;
  readonly retainedAt: string;
  readonly reason: "TITULAR_REQUEST";
}

export interface EncryptedCpfRecord extends CpfAssociatedData {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly keyReference: string;
  readonly cpfHmac: string;
  readonly hmacKeyReference: string;
  readonly audit: AuditSkeleton;
}

export type DebtorReadResult =
  | {
      readonly readState: "ACTIVE";
      readonly cpf: string;
      readonly audit: AuditSkeleton;
    }
  | {
      readonly readState: "ELIMINADO_A_PEDIDO_DO_TITULAR";
      readonly audit: AuditSkeleton;
    };

interface CipherKeyVault {
  createKey(context: CpfAssociatedData): Promise<{
    readonly reference: string;
    readonly key: Buffer;
  }>;
  readKey(reference: string): Promise<Buffer | null>;
  destroyKey(context: CpfAssociatedData): Promise<void>;
}

interface HmacSecretVault {
  readActiveSecret(tenantId: string): Promise<{
    readonly reference: string;
    readonly version: string;
    readonly secret: Buffer;
  }>;
  rotate(tenantId: string): Promise<{
    readonly previousVersion: string;
    readonly activeVersion: string;
  }>;
}

interface StoredCipherKey extends CpfAssociatedData {
  readonly key: Buffer;
}

function scopeKey(context: CpfAssociatedData): string {
  return `${context.tenantId.length}:${context.tenantId}|${context.debtorId.length}:${context.debtorId}`;
}

function associatedData(context: CpfAssociatedData): Buffer {
  return Buffer.from(scopeKey(context), "utf8");
}

function assertCpf(cpf: string): void {
  if (!/^\d{11}$/.test(cpf)) {
    throw new Error("INVALID_CPF_FORMAT");
  }
}

class InMemoryCipherKeyVault implements CipherKeyVault {
  private readonly keysByReference = new Map<string, StoredCipherKey>();
  private readonly referenceByScope = new Map<string, string>();

  public async createKey(context: CpfAssociatedData): Promise<{
    readonly reference: string;
    readonly key: Buffer;
  }> {
    const existingReference = this.referenceByScope.get(scopeKey(context));
    const existing = existingReference
      ? this.keysByReference.get(existingReference)
      : undefined;
    if (existingReference && existing) {
      return { reference: existingReference, key: existing.key };
    }

    const reference = `debtor-key:${randomUUID()}`;
    const key = randomBytes(32);
    this.keysByReference.set(reference, { ...context, key });
    this.referenceByScope.set(scopeKey(context), reference);
    return { reference, key };
  }

  public async readKey(reference: string): Promise<Buffer | null> {
    const stored = this.keysByReference.get(reference);
    return stored?.key ?? null;
  }

  public async destroyKey(context: CpfAssociatedData): Promise<void> {
    const scopedReference = this.referenceByScope.get(scopeKey(context));
    if (!scopedReference) {
      return;
    }

    this.referenceByScope.delete(scopeKey(context));
    this.keysByReference.delete(scopedReference);
  }
}

interface StoredHmacSecret {
  readonly version: string;
  readonly secret: Buffer;
}

class InMemoryHmacSecretVault implements HmacSecretVault {
  private readonly secrets = new Map<string, StoredHmacSecret>();

  private active(tenantId: string): StoredHmacSecret {
    const existing = this.secrets.get(tenantId);
    if (existing) {
      return existing;
    }

    const created = { version: "1", secret: randomBytes(32) };
    this.secrets.set(tenantId, created);
    return created;
  }

  public async readActiveSecret(tenantId: string): Promise<{
    readonly reference: string;
    readonly version: string;
    readonly secret: Buffer;
  }> {
    const active = this.active(tenantId);
    return {
      reference: `hmac-secret:${tenantId}:${active.version}`,
      version: active.version,
      secret: active.secret,
    };
  }

  public async rotate(tenantId: string): Promise<{
    readonly previousVersion: string;
    readonly activeVersion: string;
  }> {
    const previous = this.active(tenantId);
    const activeVersion = String(Number.parseInt(previous.version, 10) + 1);
    this.secrets.set(tenantId, {
      version: activeVersion,
      secret: randomBytes(32),
    });
    return { previousVersion: previous.version, activeVersion };
  }
}

export class CpfCryptoService {
  private readonly destroyedScopes = new Set<string>();

  public constructor(
    private readonly cipherKeys: CipherKeyVault,
    private readonly hmacSecrets: HmacSecretVault,
  ) {}

  public async indexCpf(cpf: string, tenantId: string): Promise<string> {
    assertCpf(cpf);
    const hmac = await this.hmacSecrets.readActiveSecret(tenantId);
    return createHmac("sha256", hmac.secret).update(cpf, "utf8").digest("hex");
  }

  public async encryptCpf(
    cpf: string,
    context: CpfAssociatedData,
    audit: AuditSkeleton,
  ): Promise<EncryptedCpfRecord> {
    assertCpf(cpf);
    if (audit.tenantId !== context.tenantId) {
      throw new Error("TENANT_SCOPE_MISMATCH");
    }

    const [cipherKey, hmacSecret] = await Promise.all([
      this.cipherKeys.createKey(context),
      this.hmacSecrets.readActiveSecret(context.tenantId),
    ]);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", cipherKey.key, iv);
    cipher.setAAD(associatedData(context));
    const ciphertext = Buffer.concat([
      cipher.update(cpf, "utf8"),
      cipher.final(),
    ]);

    return {
      ...context,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyReference: cipherKey.reference,
      cpfHmac: createHmac("sha256", hmacSecret.secret)
        .update(cpf, "utf8")
        .digest("hex"),
      hmacKeyReference: hmacSecret.reference,
      audit,
    };
  }

  public async decryptCpf(record: EncryptedCpfRecord): Promise<string> {
    const context = {
      tenantId: record.tenantId,
      debtorId: record.debtorId,
    };
    const key = await this.cipherKeys.readKey(record.keyReference);
    if (!key) {
      throw new Error("DEBTOR_KEY_NOT_AVAILABLE");
    }

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(record.iv, "base64"),
      );
      decipher.setAAD(associatedData(context));
      decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("AEAD_AUTH_FAILED");
    }
  }

  public async destroyDebtorKey(context: CpfAssociatedData): Promise<void> {
    await this.cipherKeys.destroyKey(context);
    this.destroyedScopes.add(scopeKey(context));
  }

  public async readDebtor(
    record: EncryptedCpfRecord,
  ): Promise<DebtorReadResult> {
    const key = await this.cipherKeys.readKey(record.keyReference);
    if (!key) {
      if (!this.destroyedScopes.has(scopeKey(record))) {
        throw new Error("DEBTOR_KEY_REFERENCE_INVALID");
      }
      return {
        readState: "ELIMINADO_A_PEDIDO_DO_TITULAR",
        audit: record.audit,
      };
    }

    return {
      readState: "ACTIVE",
      cpf: await this.decryptCpf(record),
      audit: record.audit,
    };
  }

  public async rotateHmacKey(tenantId: string): Promise<{
    readonly reindexRequired: true;
    readonly previousVersion: string;
    readonly activeVersion: string;
  }> {
    const rotation = await this.hmacSecrets.rotate(tenantId);
    return { reindexRequired: true, ...rotation };
  }
}

export function createInMemoryCpfCrypto(): CpfCryptoService {
  return new CpfCryptoService(
    new InMemoryCipherKeyVault(),
    new InMemoryHmacSecretVault(),
  );
}

export const AwsKmsConfigurationSchema = z
  .object({
    cipherKeyArn: z.string().min(1),
    hmacSecretArn: z.string().min(1),
  })
  .strict()
  .refine(
    (configuration) =>
      configuration.cipherKeyArn !== configuration.hmacSecretArn,
    { message: "SEPARATE_HMAC_SECRET_REQUIRED" },
  );

export type AwsKmsConfiguration = z.infer<
  typeof AwsKmsConfigurationSchema
>;
