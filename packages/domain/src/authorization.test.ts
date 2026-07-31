import { describe, expect, it } from "vitest";

import type { Actor } from "./actor.js";
import {
  assertTenantContext,
  authorize,
  createTenantContext,
  type AuthorizationAction,
} from "./authorization.js";

const analyst: Actor = {
  id: "human-analyst",
  kind: "HUMAN",
  provider: "https://identity.example/realms/acme",
  subject: "analyst-subject",
  issuanceOrigin: "HUMAN_KEYCLOAK",
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
      issuanceOrigin: "AGENT_MACHINE_CREDENTIAL",
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

  /**
   * The separation the role-redacted views rest on. These pass today; they
   * exist so that widening the table fails something. Giving the audit role an
   * operational action, or the operator the audit trail, is the relaxation the
   * `AGENTS.md` invariant forbids.
   */
  it("keeps the audit role out of operational wallet access", () => {
    const encarregado: Actor = {
      ...analyst,
      id: "human-dpo",
      subject: "dpo-subject",
      roles: ["ENCARREGADO_LGPD"],
    };

    expect(authorize(encarregado, "wallet-a", "READ_AUDIT")).toEqual({
      allowed: true,
    });
    expect(authorize(encarregado, "wallet-a", "READ_DOSSIER")).toEqual({
      allowed: false,
    });
    expect(authorize(encarregado, "wallet-a", "READ_ACTIONABLE")).toEqual({
      allowed: false,
    });
  });

  it("keeps the collection operator out of the audit trail and the full dossier", () => {
    const operador: Actor = {
      ...analyst,
      id: "human-operator",
      subject: "operator-subject",
      roles: ["OPERADOR_COBRANCA"],
    };

    expect(authorize(operador, "wallet-a", "READ_ACTIONABLE")).toEqual({
      allowed: true,
    });
    expect(authorize(operador, "wallet-a", "READ_AUDIT")).toEqual({
      allowed: false,
    });
    expect(authorize(operador, "wallet-a", "READ_DOSSIER")).toEqual({
      allowed: false,
    });
  });

  it.each([
    ["HUMAN", analyst],
    [
      "AGENT",
      {
        ...analyst,
        id: "agent-a",
        kind: "AGENT" as const,
        issuanceOrigin: "AGENT_MACHINE_CREDENTIAL" as const,
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
        issuanceOrigin: "SYSTEM_WORKER" as const,
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
  it("preserves the mapped actor reference instead of re-parsing a clone", () => {
    const context = createTenantContext(analyst);

    expect(context.actor).toBe(analyst);
  });

  it("rejects an actor without a tenant instead of creating a global context", () => {
    const unscoped = { ...analyst, tenantId: undefined };

    expect(() => createTenantContext(unscoped)).toThrow("TENANT_CONTEXT_REQUIRED");
  });
});

/**
 * ADR 019: a runtime guard needs a test that fails when it is removed. Defect
 * I-4 listed `INVALID_TENANT_CONTEXT` among six guards that had none.
 *
 * The falsifying case is a context whose actor changed **after** the context
 * was built. `createTenantContext` validates the actor and freezes the context,
 * but it deliberately keeps the caller's actor reference rather than cloning it
 * — and freezing a context does not freeze the object it points at. So a
 * mutable actor can be registered, mutated, and then presented as if it still
 * agreed with the tenant it was registered under.
 */
describe("assertTenantContext", () => {
  it("refuses a registered context whose actor no longer agrees on the tenant", () => {
    const mutable: Actor = {
      ...analyst,
      tenantId: "tenant-a",
    };
    const context = createTenantContext(mutable);

    expect(() => assertTenantContext(context)).not.toThrow();

    (mutable as { tenantId: string }).tenantId = "tenant-b";

    expect(() => assertTenantContext(context)).toThrow("INVALID_TENANT_CONTEXT");
  });

  it("still refuses a context that was never issued at all", () => {
    // The other half of the same guard, and the reason the check above is not
    // enough on its own: registration and agreement are two properties.
    const forged = { tenantId: "tenant-a", actor: analyst };

    expect(() => assertTenantContext(forged)).toThrow("TENANT_CONTEXT_REQUIRED");
  });
});
