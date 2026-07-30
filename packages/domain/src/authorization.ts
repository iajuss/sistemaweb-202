import type {
  Actor,
  AuthorizationAction,
  HumanRole,
  WalletGrant,
} from "./actor.js";
import { ActorSchema, assertAuthenticatedActor } from "./actor.js";

export type { AuthorizationAction, WalletGrant } from "./actor.js";

export interface TenantContext {
  readonly tenantId: string;
  readonly actor: Actor;
}

const runtimeTenantContexts = new WeakSet<TenantContext>();

export interface TenantScopedRepository<T> {
  save(context: TenantContext, value: T): Promise<void>;
  find(context: TenantContext, id: string): Promise<T | null>;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
}

const HUMAN_PERMISSIONS: Readonly<
  Record<HumanRole, readonly AuthorizationAction[]>
> = {
  ADMIN_TENANT: ["MANAGE_GRANTS"],
  ANALISTA_DOSSIE: ["READ_DOSSIER"],
  OPERADOR_COBRANCA: ["READ_ACTIONABLE"],
  ENCARREGADO_LGPD: ["READ_AUDIT"],
};

function grantAllows(
  actor: Actor,
  grant: WalletGrant,
  walletId: string,
  action: AuthorizationAction,
): boolean {
  return (
    grant.tenantId === actor.tenantId &&
    grant.walletId === walletId &&
    grant.actions.includes(action)
  );
}

export function authorize(
  actor: Actor,
  walletId: string,
  action: AuthorizationAction,
): AuthorizationDecision {
  const parsedActor = ActorSchema.safeParse(actor);
  if (!parsedActor.success || !parsedActor.data.tenantId) {
    return { allowed: false };
  }
  const runtimeActor = parsedActor.data;

  if (runtimeActor.kind === "HUMAN") {
    return {
      allowed: runtimeActor.roles.some((role) =>
        HUMAN_PERMISSIONS[role].includes(action),
      ),
    };
  }

  return {
    allowed: runtimeActor.walletGrants.some((grant) =>
      grantAllows(runtimeActor, grant, walletId, action),
    ),
  };
}

export function createTenantContext(actor: Actor): TenantContext {
  assertAuthenticatedActor(actor);
  const parsedActor = ActorSchema.safeParse(actor);
  if (!parsedActor.success) {
    throw new Error("INVALID_ACTOR");
  }
  if (!parsedActor.data.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const context: TenantContext = Object.freeze({
    tenantId: parsedActor.data.tenantId,
    actor: parsedActor.data,
  });
  runtimeTenantContexts.add(context);
  return context;
}

export function assertTenantContext(context: TenantContext): void {
  if (!runtimeTenantContexts.has(context)) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }

  const parsedActor = ActorSchema.safeParse(context.actor);
  if (
    !parsedActor.success ||
    !parsedActor.data.tenantId ||
    parsedActor.data.tenantId !== context.tenantId
  ) {
    throw new Error("INVALID_TENANT_CONTEXT");
  }
}
