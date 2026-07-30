import {
  IdentityRefSchema,
  issueAuthenticatedActor,
  type Actor,
  type ActorKind,
  type HumanRole,
} from "@panella/domain";
import { z } from "zod";

const VerifiedOidcIdentityClaimsSchema = z
  .object({
    iss: z.string().min(1),
    sub: z.string().min(1),
  })
  .passthrough();

const ActorProfileSchema = z
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

export interface KeycloakActorProfile {
  readonly actorId: string;
  readonly tenantId: string;
  readonly kind: ActorKind;
  readonly roles: readonly HumanRole[];
}

export function mapVerifiedKeycloakActor(
  verifiedClaims: unknown,
  profile: KeycloakActorProfile,
): Actor {
  const claims = VerifiedOidcIdentityClaimsSchema.parse(verifiedClaims);
  const parsedProfile = ActorProfileSchema.parse(profile);
  const identity = IdentityRefSchema.parse({
    provider: claims.iss,
    subject: claims.sub,
  });

  return issueAuthenticatedActor({
    id: parsedProfile.actorId,
    kind: parsedProfile.kind,
    provider: identity.provider,
    subject: identity.subject,
    tenantId: parsedProfile.tenantId,
    roles: parsedProfile.roles,
    // Runtime grants are loaded from the domain repository for every request.
    walletGrants: [],
  });
}
