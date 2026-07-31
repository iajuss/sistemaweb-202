import {
  ActorSchema,
  IdentityRefSchema,
  type Actor,
  type ActorKind,
  type HumanRole,
} from "@panella/domain";
import { z } from "zod";

import {
  assertVerifiedPrincipal,
  type PrincipalIssuanceOrigin,
  type VerifiedPrincipal,
} from "./identity-middleware.js";

const ResolvedActorProfileSchema = z
  .object({
    actorId: z.string().min(1),
    tenantId: z.string().min(1),
    kind: z.enum(["HUMAN", "AGENT", "SYSTEM"]),
    roles: z.array(
      z.enum([
        "ADMIN_TENANT",
        "ANALISTA_DOSSIE",
        "OPERADOR_COBRANCA",
        "ENCARREGADO_LGPD",
      ]),
    ),
  })
  .strict();

export interface ResolvedActorProfile {
  readonly actorId: string;
  readonly tenantId: string;
  readonly kind: ActorKind;
  readonly roles: readonly HumanRole[];
}

export interface IdentityActorRepository {
  findByIdentity(identity: {
    readonly provider: string;
    readonly subject: string;
  }): Promise<ResolvedActorProfile | null>;
}

export interface AuthenticatedIdentity {
  readonly principal: VerifiedPrincipal;
  readonly actor: Actor;
}

const authenticatedIdentities = new WeakSet<AuthenticatedIdentity>();

function expectedActorKind(origin: PrincipalIssuanceOrigin): ActorKind {
  switch (origin) {
    case "HUMAN_KEYCLOAK":
      return "HUMAN";
    case "AGENT_MACHINE_CREDENTIAL":
      return "AGENT";
    case "SYSTEM_WORKER":
      return "SYSTEM";
  }
}

function freezeActor(actor: Actor): Actor {
  const walletGrants = actor.walletGrants.map((grant) =>
    Object.freeze({ ...grant, actions: Object.freeze([...grant.actions]) }),
  );
  return Object.freeze({
    ...actor,
    roles: Object.freeze([...actor.roles]),
    walletGrants: Object.freeze(walletGrants),
  }) as Actor;
}

export function assertAuthenticatedIdentity(
  identity: AuthenticatedIdentity,
): asserts identity is AuthenticatedIdentity {
  if (!authenticatedIdentities.has(identity)) {
    throw new Error("AUTHENTICATED_IDENTITY_REQUIRED");
  }
  assertVerifiedPrincipal(identity.principal);
  if (
    identity.actor.provider !== identity.principal.issuer ||
    identity.actor.subject !== identity.principal.subject ||
    identity.actor.issuanceOrigin !== identity.principal.origin
  ) {
    throw new Error("AUTHENTICATED_IDENTITY_REQUIRED");
  }
}

/**
 * Maps only a middleware-verified principal. Tenant, actor type, role and
 * grants come from tenant-local persistence, never from the request.
 */
export async function mapVerifiedKeycloakActor(
  principal: VerifiedPrincipal,
  identities: IdentityActorRepository,
): Promise<AuthenticatedIdentity> {
  assertVerifiedPrincipal(principal);
  const identityRef = IdentityRefSchema.parse({
    provider: principal.issuer,
    subject: principal.subject,
  });
  const profile = await identities.findByIdentity(identityRef);
  if (!profile) {
    throw new Error("IDENTITY_MAPPING_NOT_FOUND");
  }

  const resolved = ResolvedActorProfileSchema.parse(profile);
  if (resolved.kind !== expectedActorKind(principal.origin)) {
    throw new Error("IDENTITY_ORIGIN_KIND_MISMATCH");
  }

  const actor = freezeActor(
    ActorSchema.parse({
      id: resolved.actorId,
      kind: resolved.kind,
      provider: identityRef.provider,
      subject: identityRef.subject,
      issuanceOrigin: principal.origin,
      tenantId: resolved.tenantId,
      roles: resolved.roles,
      walletGrants: [],
    }),
  );
  const authenticatedIdentity = Object.freeze({ principal, actor });
  authenticatedIdentities.add(authenticatedIdentity);
  return authenticatedIdentity;
}
