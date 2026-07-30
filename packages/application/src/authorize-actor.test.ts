import { describe, expect, it } from "vitest";

import type {
  Actor,
  AuthorizationAction,
  TenantContext,
  WalletGrant,
} from "@panella/domain";

import {
  authorizeActor,
  authorizeWalletCpfLookup,
  type WalletAuthorizationRepository,
} from "./authorize-actor.js";

interface WalletFixture {
  readonly id: string;
  readonly tenantId: string;
  readonly cpfIndexes: readonly string[];
}

class WalletRepositoryFixture implements WalletAuthorizationRepository {
  public constructor(
    private readonly wallets: readonly WalletFixture[],
    private readonly grants: readonly (WalletGrant & {
      readonly actorId: string;
    })[],
  ) {}

  public async findWallet(
    context: TenantContext,
    walletId: string,
  ): Promise<{ readonly id: string; readonly tenantId: string } | null> {
    return (
      this.wallets.find(
        (wallet) =>
          wallet.id === walletId && wallet.tenantId === context.tenantId,
      ) ?? null
    );
  }

  public async findGrant(
    context: TenantContext,
    actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return (
      this.grants.find(
        (grant) =>
          grant.actorId === actorId &&
          grant.walletId === walletId &&
          grant.tenantId === context.tenantId,
      ) ?? null
    );
  }

  public async containsCpf(
    context: TenantContext,
    walletId: string,
    cpfIndex: string,
  ): Promise<boolean> {
    return Boolean(
      this.wallets.find(
        (wallet) =>
          wallet.id === walletId &&
          wallet.tenantId === context.tenantId &&
          wallet.cpfIndexes.includes(cpfIndex),
      ),
    );
  }
}

const agent: Actor = {
  id: "agent-a",
  kind: "AGENT",
  provider: "https://identity.example/realms/acme",
  subject: "service-account-agent-a",
  tenantId: "tenant-a",
  roles: [],
  walletGrants: [],
};

const cpfIndexer = {
  indexCpf: async (cpf: string, tenantId: string) =>
    `hmac:${tenantId}:${cpf}`,
};

describe("authorizeActor", () => {
  it.each(["HUMAN", "AGENT", "SYSTEM"] as const)(
    "runs runtime authorization for a %s actor",
    async (kind) => {
      const action: AuthorizationAction =
        kind === "SYSTEM" ? "RUN_SOURCE" : "READ_DOSSIER";
      const roles = kind === "HUMAN" ? ["ANALISTA_DOSSIE" as const] : [];
      const repository = new WalletRepositoryFixture(
        [{ id: "wallet-a", tenantId: "tenant-a", cpfIndexes: [] }],
        kind === "HUMAN"
          ? []
          : [
              {
                actorId: `${kind.toLowerCase()}-a`,
                tenantId: "tenant-a",
                walletId: "wallet-a",
                actions: [action],
              },
            ],
      );
      const candidate: Actor = {
        ...agent,
        id: `${kind.toLowerCase()}-a`,
        kind,
        roles,
      };

      await expect(
        authorizeActor(candidate, "wallet-a", action, repository),
      ).resolves.toEqual({ allowed: true });
    },
  );

  it("denies a wallet that belongs to another tenant before loading grants", async () => {
    const repository = new WalletRepositoryFixture(
      [{ id: "wallet-b", tenantId: "tenant-b", cpfIndexes: [] }],
      [
        {
          actorId: "agent-a",
          tenantId: "tenant-b",
          walletId: "wallet-b",
          actions: ["READ_DOSSIER"],
        },
      ],
    );

    await expect(
      authorizeActor(agent, "wallet-b", "READ_DOSSIER", repository),
    ).resolves.toEqual({ allowed: false });
  });
});

describe("authorizeWalletCpfLookup", () => {
  it("rejects a CPF that is not present in the authorized imported wallet", async () => {
    const repository = new WalletRepositoryFixture(
      [
        {
          id: "wallet-a",
          tenantId: "tenant-a",
          cpfIndexes: ["hmac:tenant-a:52998224725"],
        },
      ],
      [
        {
          actorId: "agent-a",
          tenantId: "tenant-a",
          walletId: "wallet-a",
          actions: ["READ_DOSSIER"],
        },
      ],
    );

    await expect(
      authorizeWalletCpfLookup(
        agent,
        "wallet-a",
        "11144477735",
        repository,
        cpfIndexer,
      ),
    ).resolves.toEqual({ allowed: false });
  });

  it("allows a CPF already present in the authorized imported wallet", async () => {
    const repository = new WalletRepositoryFixture(
      [
        {
          id: "wallet-a",
          tenantId: "tenant-a",
          cpfIndexes: ["hmac:tenant-a:52998224725"],
        },
      ],
      [
        {
          actorId: "agent-a",
          tenantId: "tenant-a",
          walletId: "wallet-a",
          actions: ["READ_DOSSIER"],
        },
      ],
    );

    await expect(
      authorizeWalletCpfLookup(
        agent,
        "wallet-a",
        "52998224725",
        repository,
        cpfIndexer,
      ),
    ).resolves.toEqual({ allowed: true });
  });
});
