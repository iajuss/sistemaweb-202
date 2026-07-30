import { describe, expect, it } from "vitest";

import {
  AwsKmsConfigurationSchema,
  createInMemoryCpfCrypto,
} from "./kms.js";

const audit = {
  pseudonymousDebtorId: "subject-7f55",
  tenantId: "tenant-a",
  retainedAt: "2026-07-30T12:00:00.000Z",
  reason: "TITULAR_REQUEST" as const,
};

describe("CPF encryption", () => {
  it("rejects ciphertext copied to another tenant or debtor", async () => {
    const crypto = createInMemoryCpfCrypto();
    const record = await crypto.encryptCpf(
      "52998224725",
      { tenantId: "tenant-a", debtorId: "debtor-a" },
      audit,
    );

    await expect(
      crypto.decryptCpf({ ...record, tenantId: "tenant-b" }),
    ).rejects.toThrow("AEAD_AUTH_FAILED");
    await expect(
      crypto.decryptCpf({ ...record, debtorId: "debtor-b" }),
    ).rejects.toThrow("AEAD_AUTH_FAILED");
  });

  it("uses a vault-held HMAC secret separate from the debtor encryption key", async () => {
    const crypto = createInMemoryCpfCrypto();
    const record = await crypto.encryptCpf(
      "52998224725",
      { tenantId: "tenant-a", debtorId: "debtor-a" },
      audit,
    );

    expect(record.cpfHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(record.cpfHmac).not.toBe(
      "bc90a46d4ff5384b04de7d791f60f5e9dc74bfc1c104ce2b37bc9d0f7e4ce668",
    );
    expect(record.keyReference).not.toBe(record.hmacKeyReference);
    await expect(
      crypto.rotateHmacKey("tenant-a"),
    ).resolves.toEqual({
      reindexRequired: true,
      previousVersion: "1",
      activeVersion: "2",
    });
  });

  it("destroys only the selected debtor key and returns the audit skeleton", async () => {
    const crypto = createInMemoryCpfCrypto();
    const recordA = await crypto.encryptCpf(
      "52998224725",
      { tenantId: "tenant-a", debtorId: "debtor-a" },
      audit,
    );
    const olderRecordA = await crypto.encryptCpf(
      "52998224725",
      { tenantId: "tenant-a", debtorId: "debtor-a" },
      audit,
    );
    const recordB = await crypto.encryptCpf(
      "11144477735",
      { tenantId: "tenant-a", debtorId: "debtor-b" },
      { ...audit, pseudonymousDebtorId: "subject-91ac" },
    );

    await crypto.destroyDebtorKey({
      tenantId: "tenant-a",
      debtorId: "debtor-a",
    });

    const eliminated = await crypto.readDebtor(recordA);
    expect(eliminated).toEqual({
      readState: "ELIMINADO_A_PEDIDO_DO_TITULAR",
      audit,
    });
    expect(eliminated).not.toHaveProperty("ciphertext");
    await expect(crypto.readDebtor(olderRecordA)).resolves.toEqual({
      readState: "ELIMINADO_A_PEDIDO_DO_TITULAR",
      audit,
    });
    await expect(crypto.decryptCpf(recordB)).resolves.toBe("11144477735");
  });
});

describe("AWS KMS configuration", () => {
  it("rejects reuse of the cipher key as the HMAC secret", () => {
    expect(() =>
      AwsKmsConfigurationSchema.parse({
        cipherKeyArn: "arn:aws:kms:sa-east-1:000000000000:key/cipher",
        hmacSecretArn: "arn:aws:kms:sa-east-1:000000000000:key/cipher",
      }),
    ).toThrow("SEPARATE_HMAC_SECRET_REQUIRED");
  });
});
