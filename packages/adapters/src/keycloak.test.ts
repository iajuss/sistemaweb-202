import { describe, expect, it } from "vitest";

import { mapVerifiedKeycloakActor } from "./keycloak.js";

describe("mapVerifiedKeycloakActor", () => {
  it("uses issuer and subject as the stable human identity", () => {
    expect(
      mapVerifiedKeycloakActor(
        {
          iss: "https://identity.example/realms/acme",
          sub: "8f139166-862c-4d8b-9737-820fb1fba16a",
        },
        {
          actorId: "human-a",
          tenantId: "tenant-a",
          kind: "HUMAN",
          roles: ["ANALISTA_DOSSIE"],
        },
      ),
    ).toMatchObject({
      id: "human-a",
      provider: "https://identity.example/realms/acme",
      subject: "8f139166-862c-4d8b-9737-820fb1fba16a",
      kind: "HUMAN",
      tenantId: "tenant-a",
    });
  });

  it("keeps the verified service-account subject as the agent identity", () => {
    expect(
      mapVerifiedKeycloakActor(
        {
          iss: "https://identity.example/realms/acme",
          sub: "service-account-collection-agent",
        },
        {
          actorId: "agent-a",
          tenantId: "tenant-a",
          kind: "AGENT",
          roles: [],
        },
      ),
    ).toEqual({
      id: "agent-a",
      provider: "https://identity.example/realms/acme",
      subject: "service-account-collection-agent",
      kind: "AGENT",
      tenantId: "tenant-a",
      roles: [],
      walletGrants: [],
    });
  });

  it("rejects claims without both standard OIDC identity fields", () => {
    expect(() =>
      mapVerifiedKeycloakActor(
        { iss: "https://identity.example/realms/acme" },
        {
          actorId: "agent-a",
          tenantId: "tenant-a",
          kind: "AGENT",
          roles: [],
        },
      ),
    ).toThrow();
  });
});
