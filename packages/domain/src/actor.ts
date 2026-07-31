import { z } from "zod";

export const ActorKindSchema = z.enum(["HUMAN", "AGENT", "SYSTEM"]);

export const ActorIssuanceOriginSchema = z.enum([
  "HUMAN_KEYCLOAK",
  "AGENT_MACHINE_CREDENTIAL",
  "SYSTEM_WORKER",
]);

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
    issuanceOrigin: ActorIssuanceOriginSchema,
    tenantId: z.string().min(1).optional(),
    roles: z.array(HumanRoleSchema),
    walletGrants: z.array(WalletGrantSchema),
  })
  .strict();

export type ActorKind = z.infer<typeof ActorKindSchema>;
export type ActorIssuanceOrigin = z.infer<typeof ActorIssuanceOriginSchema>;
export type HumanRole = z.infer<typeof HumanRoleSchema>;
export type AuthorizationAction = z.infer<
  typeof AuthorizationActionSchema
>;
export type WalletGrant = z.infer<typeof WalletGrantSchema>;
export type Actor = z.infer<typeof ActorSchema>;
