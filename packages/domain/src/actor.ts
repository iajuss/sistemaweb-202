import { z } from "zod";

export const ActorKindSchema = z.enum(["HUMAN", "AGENT", "SYSTEM"]);

export const HumanRoleSchema = z.enum([
  "ADMIN_TENANT",
  "ANALISTA_DOSSIE",
  "OPERADOR_COBRANCA",
  "ENCARREGADO_LGPD",
]);

export const AuthorizationActionSchema = z.enum([
  "READ_DOSSIER",
  "READ_ACTIONABLE",
  "READ_AUDIT",
  "MANAGE_GRANTS",
  "RUN_SOURCE",
]);

export const WalletGrantSchema = z
  .object({
    tenantId: z.string().min(1),
    walletId: z.string().min(1),
    actions: z.array(AuthorizationActionSchema),
  })
  .strict();

export const ActorSchema = z
  .object({
    id: z.string().min(1),
    kind: ActorKindSchema,
    provider: z.string().min(1),
    subject: z.string().min(1),
    tenantId: z.string().min(1).optional(),
    roles: z.array(HumanRoleSchema),
    walletGrants: z.array(WalletGrantSchema),
  })
  .strict();

export type ActorKind = z.infer<typeof ActorKindSchema>;
export type HumanRole = z.infer<typeof HumanRoleSchema>;
export type AuthorizationAction = z.infer<
  typeof AuthorizationActionSchema
>;
export type WalletGrant = z.infer<typeof WalletGrantSchema>;
export type Actor = z.infer<typeof ActorSchema>;

const authenticatedActors = new WeakSet<Actor>();

function freezeActor(actor: Actor): Actor {
  const walletGrants = actor.walletGrants.map((grant) =>
    Object.freeze({
      ...grant,
      actions: Object.freeze([...grant.actions]),
    }),
  );
  return Object.freeze({
    ...actor,
    roles: Object.freeze([...actor.roles]),
    walletGrants: Object.freeze(walletGrants),
  }) as Actor;
}

/**
 * Registers an immutable actor after its identity provider has verified the
 * credential and the adapter has resolved it to a tenant-local actor.
 */
export function issueAuthenticatedActor(actor: Actor): Actor {
  const issued = freezeActor(ActorSchema.parse(actor));
  authenticatedActors.add(issued);
  return issued;
}

export function assertAuthenticatedActor(actor: Actor): void {
  if (!authenticatedActors.has(actor)) {
    throw new Error("AUTHENTICATED_ACTOR_REQUIRED");
  }
}
