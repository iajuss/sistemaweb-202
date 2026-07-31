import { describe, expect, it, vi } from "vitest";

import * as domain from "@panella/domain";

import {
  DevInsecureIdentityProvider,
  type VerifiedPrincipal,
} from "./identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type IdentityActorRepository,
} from "./keycloak.js";

const identityRepository: IdentityActorRepository = {
  findByIdentity: async ({ provider, subject }) =>
    provider === "https://identity.example/realms/acme" &&
    subject === "human-subject"
      ? {
          actorId: "human-a",
          tenantId: "tenant-a",
          kind: "HUMAN",
          roles: ["ANALISTA_DOSSIE"],
        }
      : null,
};

async function issueDevelopmentPrincipal(input: {
  readonly subject: string;
  readonly origin:
    | "HUMAN_KEYCLOAK"
    | "AGENT_MACHINE_CREDENTIAL"
    | "SYSTEM_WORKER";
}) {
  vi.stubEnv("NODE_ENV", "development");
  const provider = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  });
  const identityInput = {
    issuer: "https://identity.example/realms/acme",
    subject: input.subject,
  };
  switch (input.origin) {
    case "HUMAN_KEYCLOAK":
      return provider.authenticateHumanKeycloak(identityInput);
    case "AGENT_MACHINE_CREDENTIAL":
      return provider.authenticateMachineAgent(identityInput);
    case "SYSTEM_WORKER":
      return provider.authenticateSystemWorker(identityInput);
  }
}

describe("identity middleware", () => {
  it("does not structurally type a caller object as a verified principal", () => {
    const structuralPrincipal = {
      issuer: "internal://attacker",
      subject: "attacker",
      origin: "SYSTEM_WORKER" as const,
    };
    // @ts-expect-error VerifiedPrincipal carries a module-private brand.
    const impossiblePrincipal: VerifiedPrincipal = structuralPrincipal;

    expect(impossiblePrincipal).toBe(structuralPrincipal);
  });

  it("does not expose the actor issuer through the public domain contract", () => {
    expect(domain).not.toHaveProperty("issueAuthenticatedActor");
  });

  it("refuses construction outside development", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(
      () =>
        new DevInsecureIdentityProvider({
          allowInsecureDevelopmentIdentity: true,
        }),
    ).toThrow("DEV_INSECURE_IDENTITY_PROVIDER_FORBIDDEN");
  });

  it("requires an explicit development opt-in before issuing a principal", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(
      () => new DevInsecureIdentityProvider({}),
    ).toThrow("EXPLICIT_DEVELOPMENT_IDENTITY_OPT_IN_REQUIRED");
  });

  it("refuses to issue a principal from a detached method outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const issueSystemWorker =
      DevInsecureIdentityProvider.prototype.authenticateSystemWorker;

    expect(() =>
      issueSystemWorker({
        issuer: "internal://attacker",
        subject: "attacker-subject",
      }),
    ).toThrow("DEV_INSECURE_IDENTITY_PROVIDER_FORBIDDEN");
  });

  it("refuses to issue a principal from an instance that never ran the opt-in constructor", () => {
    vi.stubEnv("NODE_ENV", "development");
    const withoutOptIn = Object.create(
      DevInsecureIdentityProvider.prototype,
    ) as DevInsecureIdentityProvider;

    expect(() =>
      withoutOptIn.authenticateSystemWorker({
        issuer: "internal://attacker",
        subject: "attacker-subject",
      }),
    ).toThrow("DEV_INSECURE_IDENTITY_PROVIDER_FORBIDDEN");
  });

  it("rejects a principal reflected from a legitimate principal constructor", async () => {
    const legitimate = await issueDevelopmentPrincipal({
      subject: "human-subject",
      origin: "HUMAN_KEYCLOAK",
    });
    const Constructor = legitimate.constructor as new (input: unknown) => VerifiedPrincipal;
    expect(() =>
      Reflect.construct(Constructor, [{
        issuer: "internal://attacker",
        subject: "attacker",
        origin: "SYSTEM_WORKER",
      }]),
    ).toThrow(
      "VERIFIED_PRINCIPAL_ISSUANCE_FORBIDDEN",
    );
    const reflectedIssuer = Reflect.get(Constructor, "issue") as (
      authority: object,
      input: unknown,
      origin: string,
    ) => VerifiedPrincipal;
    expect(() =>
      reflectedIssuer(
        Object.freeze({}),
        { issuer: "internal://attacker", subject: "attacker" },
        "SYSTEM_WORKER",
      ),
    ).toThrow("VERIFIED_PRINCIPAL_ISSUANCE_FORBIDDEN");
  });

  it("determines each development origin from its distinct issuance path", () => {
    vi.stubEnv("NODE_ENV", "development");
    const provider = new DevInsecureIdentityProvider({
      allowInsecureDevelopmentIdentity: true,
    });

    expect(
      provider.authenticateHumanKeycloak({
        issuer: "https://identity.example/realms/acme",
        subject: "human-subject",
      }),
    ).toMatchObject({ origin: "HUMAN_KEYCLOAK" });
    expect(
      provider.authenticateMachineAgent({
        issuer: "https://identity.example/realms/acme",
        subject: "machine-subject",
      }),
    ).toMatchObject({ origin: "AGENT_MACHINE_CREDENTIAL" });
    expect(
      provider.authenticateSystemWorker({
        issuer: "internal://workers",
        subject: "worker-subject",
      }),
    ).toMatchObject({ origin: "SYSTEM_WORKER" });
    expect(provider).not.toHaveProperty("authenticate");
  });
});

describe("mapVerifiedKeycloakActor", () => {
  it("resolves tenant-local actor data from a verified human principal", async () => {
    const principal = await issueDevelopmentPrincipal({
      subject: "human-subject",
      origin: "HUMAN_KEYCLOAK",
    });

    await expect(
      mapVerifiedKeycloakActor(principal, identityRepository),
    ).resolves.toMatchObject({
      actor: {
        id: "human-a",
        provider: "https://identity.example/realms/acme",
        subject: "human-subject",
        kind: "HUMAN",
        tenantId: "tenant-a",
        issuanceOrigin: "HUMAN_KEYCLOAK",
      },
      principal,
    });
  });

  it("ignores a caller-controlled profile argument", async () => {
    const principal = await issueDevelopmentPrincipal({
      subject: "human-subject",
      origin: "HUMAN_KEYCLOAK",
    });

    const identity = await (
      mapVerifiedKeycloakActor as unknown as (
        principal: VerifiedPrincipal,
        repository: IdentityActorRepository,
        callerProfile: unknown,
      ) => ReturnType<typeof mapVerifiedKeycloakActor>
    )(
      principal,
      identityRepository,
      {
        actorId: "attacker-controlled",
        tenantId: "tenant-b",
        kind: "AGENT",
        roles: ["ADMIN_TENANT"],
      },
    );

    expect(identity.actor).toMatchObject({
      id: "human-a",
      tenantId: "tenant-a",
      kind: "HUMAN",
      roles: ["ANALISTA_DOSSIE"],
    });
  });

  it("rejects a structural principal before resolving any profile", async () => {
    await expect(
      mapVerifiedKeycloakActor(
        {
          issuer: "https://identity.example/realms/acme",
          subject: "human-subject",
          origin: "HUMAN_KEYCLOAK",
        } as unknown as VerifiedPrincipal,
        identityRepository,
      ),
    ).rejects.toThrow("VERIFIED_PRINCIPAL_REQUIRED");
  });

  it("rejects a verified principal when no persisted identity mapping exists", async () => {
    const principal = await issueDevelopmentPrincipal({
      subject: "unknown-subject",
      origin: "AGENT_MACHINE_CREDENTIAL",
    });

    await expect(
      mapVerifiedKeycloakActor(principal, identityRepository),
    ).rejects.toThrow("IDENTITY_MAPPING_NOT_FOUND");
  });

  it("rejects a persisted actor kind that does not match the validated origin", async () => {
    const principal = await issueDevelopmentPrincipal({
      subject: "human-subject",
      origin: "HUMAN_KEYCLOAK",
    });
    const mismatchedRepository: IdentityActorRepository = {
      findByIdentity: async () => ({
        actorId: "agent-a",
        tenantId: "tenant-a",
        kind: "AGENT",
        roles: [],
      }),
    };

    await expect(
      mapVerifiedKeycloakActor(principal, mismatchedRepository),
    ).rejects.toThrow("IDENTITY_ORIGIN_KIND_MISMATCH");
  });
});
