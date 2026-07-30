import {
  authorize,
  createTenantContext,
  type Actor,
  type AuthorizationAction,
  type AuthorizationDecision,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";

export interface WalletAuthorizationRepository {
  findWallet(
    context: TenantContext,
    walletId: string,
  ): Promise<{ readonly id: string; readonly tenantId: string } | null>;
  findGrant(
    context: TenantContext,
    actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null>;
  containsCpf(
    context: TenantContext,
    walletId: string,
    cpfIndex: string,
  ): Promise<boolean>;
}

export interface CpfIndexer {
  indexCpf(cpf: string, tenantId: string): Promise<string>;
}

async function actorWithRuntimeGrant(
  actor: Actor,
  walletId: string,
  context: TenantContext,
  repository: WalletAuthorizationRepository,
): Promise<Actor> {
  if (actor.kind === "HUMAN") {
    return actor;
  }

  const grant = await repository.findGrant(context, actor.id, walletId);
  return {
    ...actor,
    walletGrants: grant
      ? [
          {
            tenantId: grant.tenantId,
            walletId: grant.walletId,
            actions: [...grant.actions],
          },
        ]
      : [],
  };
}

export async function authorizeActor(
  actor: Actor,
  walletId: string,
  action: AuthorizationAction,
  repository: WalletAuthorizationRepository,
): Promise<AuthorizationDecision> {
  const context = createTenantContext(actor);
  const wallet = await repository.findWallet(context, walletId);
  if (!wallet || wallet.tenantId !== context.tenantId) {
    return { allowed: false };
  }

  const runtimeActor = await actorWithRuntimeGrant(
    actor,
    walletId,
    context,
    repository,
  );
  return authorize(runtimeActor, walletId, action);
}

export async function authorizeWalletCpfLookup(
  actor: Actor,
  walletId: string,
  cpf: string,
  repository: WalletAuthorizationRepository,
  cpfIndexer: CpfIndexer,
): Promise<AuthorizationDecision> {
  const decision = await authorizeActor(
    actor,
    walletId,
    "READ_DOSSIER",
    repository,
  );
  if (!decision.allowed) {
    return decision;
  }

  const context = createTenantContext(actor);
  const cpfIndex = await cpfIndexer.indexCpf(cpf, context.tenantId);
  return {
    allowed: await repository.containsCpf(context, walletId, cpfIndex),
  };
}
