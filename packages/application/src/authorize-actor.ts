import {
  assertAuthenticatedIdentity,
  type AuthenticatedIdentity,
} from "@panella/adapters/keycloak";
import type { VerifiedPrincipal } from "@panella/adapters/identity-middleware";
import {
  authorize,
  createTenantContext,
  type AuthorizationAction,
  type AuthorizationDecision,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";

export type OperationPrincipal = VerifiedPrincipal;
export type AuthenticatedOperationIdentity = AuthenticatedIdentity;

export interface AuthorizedWalletContext {
  readonly tenantId: string;
}

class RuntimeAuthorizedWalletContext implements AuthorizedWalletContext {
  readonly #tenantContext: TenantContext;

  public constructor(identity: AuthenticatedIdentity) {
    assertAuthenticatedIdentity(identity);
    this.#tenantContext = createTenantContext(identity.actor);
    Object.freeze(this);
    authorizedWalletContexts.add(this);
  }

  public get tenantId(): string {
    return this.#tenantContext.tenantId;
  }

  public assertPrivateState(): void {
    void this.#tenantContext;
  }
}

const authorizedWalletContexts = new WeakSet<AuthorizedWalletContext>();

function createAuthorizedWalletContext(
  identity: AuthenticatedIdentity,
): AuthorizedWalletContext {
  return new RuntimeAuthorizedWalletContext(identity);
}

function assertAuthorizedWalletContext(
  context: AuthorizedWalletContext,
): void {
  if (
    !authorizedWalletContexts.has(context) ||
    !(context instanceof RuntimeAuthorizedWalletContext)
  ) {
    throw new Error("AUTHORIZED_WALLET_CONTEXT_REQUIRED");
  }
  context.assertPrivateState();
}

export interface WalletAuthorizationRepository {
  findWallet(
    context: AuthorizedWalletContext,
    walletId: string,
  ): Promise<{ readonly id: string; readonly tenantId: string } | null>;
  findGrant(
    context: AuthorizedWalletContext,
    actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null>;
  containsCpf(
    context: AuthorizedWalletContext,
    walletId: string,
    cpfIndex: string,
  ): Promise<boolean>;
  containsDebtor(
    context: AuthorizedWalletContext,
    walletId: string,
    debtorId: string,
  ): Promise<boolean>;
}

export interface CpfIndexer {
  indexCpf(cpf: string, tenantId: string): Promise<string>;
}

export interface WalletBoundObservation {
  readonly debtorId: string;
}

export interface AuthorizedOperation {
  readonly principal: VerifiedPrincipal;
  readonly identity: AuthenticatedIdentity;
  readonly context: TenantContext;
  readonly walletId: string;
  readonly action: AuthorizationAction;
}

class RuntimeAuthorizedOperation implements AuthorizedOperation {
  readonly #principal: VerifiedPrincipal;
  readonly #identity: AuthenticatedIdentity;
  readonly #context: TenantContext;
  readonly #walletId: string;
  readonly #action: AuthorizationAction;

  public constructor(
    identity: AuthenticatedIdentity,
    context: TenantContext,
    walletId: string,
    action: AuthorizationAction,
  ) {
    this.#principal = identity.principal;
    this.#identity = identity;
    this.#context = context;
    this.#walletId = walletId;
    this.#action = action;
    Object.freeze(this);
  }

  public get principal(): VerifiedPrincipal {
    return this.#principal;
  }

  public get identity(): AuthenticatedIdentity {
    return this.#identity;
  }

  public get context(): TenantContext {
    return this.#context;
  }

  public get walletId(): string {
    return this.#walletId;
  }

  public get action(): AuthorizationAction {
    return this.#action;
  }

  public assertPrivateState(): void {
    void this.#principal;
    void this.#identity;
    void this.#context;
    void this.#walletId;
    void this.#action;
  }
}

const authorizedOperations = new WeakSet<AuthorizedOperation>();

function issueAuthorizedOperation(
  identity: AuthenticatedIdentity,
  context: TenantContext,
  walletId: string,
  action: AuthorizationAction,
): AuthorizedOperation {
  const operation = new RuntimeAuthorizedOperation(
    identity,
    context,
    walletId,
    action,
  );
  authorizedOperations.add(operation);
  return operation;
}

export function assertAuthorizedOperation(
  operation: AuthorizedOperation,
): asserts operation is AuthorizedOperation {
  if (
    !authorizedOperations.has(operation) ||
    !(operation instanceof RuntimeAuthorizedOperation)
  ) {
    throw new Error("AUTHORIZED_OPERATION_REQUIRED");
  }
  try {
    operation.assertPrivateState();
  } catch {
    throw new Error("AUTHORIZED_OPERATION_REQUIRED");
  }
}

export interface TenantObservationReader<T extends WalletBoundObservation> {
  find(
    principal: VerifiedPrincipal,
    operation: AuthorizedOperation,
    id: string,
  ): Promise<T | null>;
}

async function actorWithRuntimeGrant(
  identity: AuthenticatedIdentity,
  walletId: string,
  context: AuthorizedWalletContext,
  repository: WalletAuthorizationRepository,
) {
  if (identity.actor.kind === "HUMAN") {
    return identity.actor;
  }

  const grant = await repository.findGrant(context, identity.actor.id, walletId);
  return {
    ...identity.actor,
    walletGrants: grant
      ? [{
          tenantId: grant.tenantId,
          walletId: grant.walletId,
          actions: [...grant.actions],
        }]
      : [],
  };
}

export async function authorizeActor(
  identity: AuthenticatedIdentity,
  walletId: string,
  action: AuthorizationAction,
  repository: WalletAuthorizationRepository,
): Promise<AuthorizationDecision> {
  assertAuthenticatedIdentity(identity);
  const walletContext = createAuthorizedWalletContext(identity);
  assertAuthorizedWalletContext(walletContext);
  const wallet = await repository.findWallet(walletContext, walletId);
  if (!wallet || wallet.tenantId !== walletContext.tenantId) {
    return { allowed: false };
  }

  const runtimeActor = await actorWithRuntimeGrant(
    identity,
    walletId,
    walletContext,
    repository,
  );
  return authorize(runtimeActor, walletId, action);
}

export async function authorizeOperation(
  identity: AuthenticatedIdentity,
  walletId: string,
  action: AuthorizationAction,
  repository: WalletAuthorizationRepository,
): Promise<AuthorizedOperation | null> {
  const decision = await authorizeActor(identity, walletId, action, repository);
  if (!decision.allowed) {
    return null;
  }

  return issueAuthorizedOperation(
    identity,
    createTenantContext(identity.actor),
    walletId,
    action,
  );
}

export async function authorizeWalletCpfLookup(
  identity: AuthenticatedIdentity,
  walletId: string,
  cpf: string,
  repository: WalletAuthorizationRepository,
  cpfIndexer: CpfIndexer,
): Promise<AuthorizationDecision> {
  const operation = await authorizeOperation(
    identity,
    walletId,
    "READ_DOSSIER",
    repository,
  );
  if (!operation) {
    return { allowed: false };
  }

  const walletContext = createAuthorizedWalletContext(identity);
  const cpfIndex = await cpfIndexer.indexCpf(cpf, walletContext.tenantId);
  return {
    allowed: await repository.containsCpf(walletContext, walletId, cpfIndex),
  };
}

export async function readAuthorizedObservation<
  T extends WalletBoundObservation,
>(
  identity: AuthenticatedIdentity,
  walletId: string,
  observationId: string,
  authorizationRepository: WalletAuthorizationRepository,
  observations: TenantObservationReader<T>,
): Promise<T | null> {
  const operation = await authorizeOperation(
    identity,
    walletId,
    "READ_DOSSIER",
    authorizationRepository,
  );
  if (!operation) {
    return null;
  }

  const observation = await observations.find(
    operation.principal,
    operation,
    observationId,
  );
  if (!observation) {
    return null;
  }

  return (await authorizationRepository.containsDebtor(
    createAuthorizedWalletContext(identity),
    walletId,
    observation.debtorId,
  ))
    ? observation
    : null;
}
