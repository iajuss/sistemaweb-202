import { describe, expect, it, vi } from "vitest";

import {
  createTenantContext,
  issueAuthenticatedActor,
  type Actor,
  type TenantContext,
} from "@panella/domain";
import type { PrismaClient } from "@prisma/client";

const prismaClientFixture = vi.hoisted(() => ({
  client: undefined as PrismaClient | undefined,
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    public constructor() {
      return prismaClientFixture.client as PrismaClient;
    }
  },
  Prisma: { JsonNull: null },
}));

import {
  createPrismaObservationRepository,
} from "./prisma-observation-repository.js";

const context: TenantContext = createTenantContext(issueAuthenticatedActor({
  id: "worker-a",
  kind: "SYSTEM",
  provider: "internal://workers",
  subject: "worker-a",
  tenantId: "tenant-a",
  roles: [],
  walletGrants: [],
} satisfies Actor));

describe("Prisma observation repository", () => {
  it("rejects a Prisma client override at the production repository factory", () => {
    expect(() =>
      createPrismaObservationRepository({
        client: {} as PrismaClient,
      } as unknown as string),
    ).toThrow("PRISMA_CLIENT_OVERRIDE_FORBIDDEN");
  });

  it("sets the transaction-local tenant after rejecting bypass roles and before a query", async () => {
    const events: string[] = [];
    let applicationRoleChecked = false;
    let localTenant: string | undefined;
    const transaction = {
      $queryRaw: async () => {
        events.push("ROLE_CHECK");
        applicationRoleChecked = true;
        return [{ isSuperuser: false, canBypassRls: false }];
      },
      $queryRawUnsafe: async (_statement: string, tenantId: string) => {
        if (!applicationRoleChecked) {
          throw new Error("ROLE_CHECK_REQUIRED");
        }
        events.push(`SET_LOCAL:${tenantId}`);
        localTenant = tenantId;
        return [{ set_config: tenantId }];
      },
      observation: {
        findUnique: async () => {
          if (localTenant !== "tenant-a") {
            throw new Error("RLS_TENANT_NOT_SET");
          }
          events.push("FIND");
          return {
            id: "observation-a",
            tenantId: "tenant-a",
            debtorId: "debtor-a",
            source: "PGFN_DADOS_ABERTOS",
            status: "ENCONTRADO",
            queryParams: { scope: "fixture" },
            payload: null,
            collectedAt: new Date("2026-07-30T12:00:00.000Z"),
          };
        },
      },
    };
    const client = {
      $transaction: async <Result>(
        operation: (tx: typeof transaction) => Promise<Result>,
      ): Promise<Result> => operation(transaction),
    };
    prismaClientFixture.client = client as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();

    await expect(
      repository.observations.find(context, "observation-a"),
    ).resolves.toMatchObject({
      id: "observation-a",
      tenantId: "tenant-a",
    });
    expect(events).toEqual([
      "ROLE_CHECK",
      "SET_LOCAL:tenant-a",
      "FIND",
    ]);
  });

  it("rejects a database role with BYPASSRLS before an observation query", async () => {
    const events: string[] = [];
    const transaction = {
      $queryRaw: async () => {
        events.push("ROLE_CHECK");
        return [{ isSuperuser: false, canBypassRls: true }];
      },
      $queryRawUnsafe: async () => {
        events.push("SET_LOCAL");
        return [];
      },
      observation: {
        findUnique: async () => {
          events.push("FIND");
          return null;
        },
      },
    };
    const client = {
      $transaction: async <Result>(
        operation: (tx: typeof transaction) => Promise<Result>,
      ): Promise<Result> => operation(transaction),
    };
    prismaClientFixture.client = client as unknown as PrismaClient;
    const repository = createPrismaObservationRepository();

    await expect(
      repository.observations.find(context, "observation-a"),
    ).rejects.toThrow("APPLICATION_DATABASE_ROLE_MUST_ENFORCE_RLS");
    expect(events).toEqual(["ROLE_CHECK"]);
  });
});
