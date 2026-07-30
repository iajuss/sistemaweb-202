import { describe, expect, it } from "vitest";

import { issueAuthenticatedActor, type Actor } from "./actor.js";
import {
  authorize,
  createTenantContext,
  type AuthorizationAction,
} from "./authorization.js";

const analyst: Actor = {
  id: "human-analyst",
  kind: "HUMAN",
  provider: "https://identity.example/realms/acme",
  subject: "analyst-subject",
  tenantId: "tenant-a",
  roles: ["ANALISTA_DOSSIE"],
  walletGrants: [],
};

describe("authorize", () => {
  it("denies an agent a wallet grant from another tenant", () => {
    const agent: Actor = {
      id: "agent-a",
      kind: "AGENT",
      provider: "https://identity.example/realms/acme",
      subject: "service-account-agent-a",
      tenantId: "tenant-a",
      roles: [],
      walletGrants: [
        {
          tenantId: "tenant-b",
          walletId: "wallet-b",
          actions: ["READ_DOSSIER"],
        },
      ],
    };

    expect(authorize(agent, "wallet-b", "READ_DOSSIER")).toEqual({
      allowed: false,
    });
  });

  it("does not grant dossier access to a tenant administrator", () => {
    const administrator: Actor = {
      ...analyst,
      id: "human-admin",
      subject: "admin-subject",
      roles: ["ADMIN_TENANT"],
    };

    expect(
      authorize(administrator, "wallet-a", "READ_DOSSIER"),
    ).toEqual({ allowed: false });
    expect(
      authorize(administrator, "wallet-a", "MANAGE_GRANTS"),
    ).toEqual({ allowed: true });
  });

  it.each([
    ["HUMAN", analyst],
    [
      "AGENT",
      {
        ...analyst,
        id: "agent-a",
        kind: "AGENT" as const,
        roles: [],
        walletGrants: [
          {
            tenantId: "tenant-a",
            walletId: "wallet-a",
            actions: ["READ_DOSSIER" as AuthorizationAction],
          },
        ],
      },
    ],
    [
      "SYSTEM",
      {
        ...analyst,
        id: "worker-a",
        kind: "SYSTEM" as const,
        roles: [],
        walletGrants: [
          {
            tenantId: "tenant-a",
            walletId: "wallet-a",
            actions: ["RUN_SOURCE" as AuthorizationAction],
          },
        ],
      },
    ],
  ])("requires a tenant-scoped runtime decision for %s actors", (_kind, actor) => {
    const action = actor.kind === "SYSTEM" ? "RUN_SOURCE" : "READ_DOSSIER";

    expect(authorize(actor, "wallet-a", action)).toEqual({ allowed: true });
    expect(authorize(actor, "wallet-without-access", action)).toEqual({
      allowed: actor.kind === "HUMAN",
    });
  });
});

describe("createTenantContext", () => {
  it("rejects an actor-shaped value that was not issued after authentication", () => {
    expect(() => createTenantContext(analyst)).toThrow(
      "AUTHENTICATED_ACTOR_REQUIRED",
    );
  });

  it("rejects an actor without a tenant instead of creating a global context", () => {
    const unscoped = { ...analyst, tenantId: undefined };

    expect(() => createTenantContext(issueAuthenticatedActor(unscoped))).toThrow(
      "TENANT_CONTEXT_REQUIRED",
    );
  });
});
