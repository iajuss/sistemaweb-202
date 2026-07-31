import { afterEach, describe, expect, it, vi } from "vitest";

import { DevInsecureIdentityProvider } from "../../adapters/src/identity-middleware.js";
import {
  mapVerifiedKeycloakActor,
  type AuthenticatedIdentity,
  type IdentityActorRepository,
} from "../../adapters/src/keycloak.js";
import {
  sourcePlanForUfs,
  type DossierSnapshot,
  type RawObservation,
  type TenantContext,
  type WalletGrant,
} from "@panella/domain";

import {
  lookupDossier,
  listPriorities,
  type PriorityEntry,
  type WalletTitleLookup,
} from "./lookup-dossier.js";
import type {
  AuthorizedOperation,
  OperationPrincipal,
  WalletAuthorizationRepository,
} from "./authorize-actor.js";
import type {
  DebtorObservationReader,
  DossierSnapshotStore,
  WalletDebtorReader,
} from "./compose-dossier.js";

const PLAN = sourcePlanForUfs(["SP"]);
const DEBTOR = { debtorId: "debtor-a", name: "JOSE SILVA", cpf: "52998224725" };

class WalletFixture implements WalletAuthorizationRepository {
  public constructor(private readonly actions: WalletGrant["actions"]) {}

  public async findWallet(_context: TenantContext, walletId: string) {
    return walletId === "wallet-a"
      ? { id: "wallet-a", tenantId: "tenant-a" }
      : null;
  }

  public async findGrant(
    _context: TenantContext,
    _actorId: string,
    walletId: string,
  ): Promise<WalletGrant | null> {
    return walletId === "wallet-a"
      ? { tenantId: "tenant-a", walletId, actions: [...this.actions] }
      : null;
  }

  public async containsCpf(): Promise<boolean> {
    return false;
  }

  public async containsDebtor(): Promise<boolean> {
    return true;
  }
}

const identityRepository: IdentityActorRepository = {
  findByIdentity: async () => ({
    actorId: "agent-a",
    tenantId: "tenant-a",
    kind: "AGENT",
    roles: [],
  }),
};

async function agent(): Promise<AuthenticatedIdentity> {
  vi.stubEnv("NODE_ENV", "development");
  const principal = new DevInsecureIdentityProvider({
    allowInsecureDevelopmentIdentity: true,
  }).authenticateMachineAgent({
    issuer: "https://identity.example/realms/acme",
    subject: "service-account-agent-a",
  });
  return mapVerifiedKeycloakActor(principal, identityRepository);
}

class Titles implements WalletTitleLookup {
  public seen: string[] = [];

  public constructor(
    private readonly byExternalId: Readonly<Record<string, string>> = {
      "TIT-001": "debtor-a",
    },
  ) {}

  public async findDebtorByExternalId(
    _principal: OperationPrincipal,
    _operation: AuthorizedOperation,
    externalId: string,
  ) {
    this.seen.push(externalId);
    return this.byExternalId[externalId] ?? null;
  }
}

const debtors: WalletDebtorReader = {
  findInWallet: async (_principal, _operation, debtorId) =>
    debtorId === DEBTOR.debtorId ? DEBTOR : null,
};

const observations: DebtorObservationReader = {
  listForDebtor: async (): Promise<readonly RawObservation[]> => [],
};

function snapshots(): DossierSnapshotStore & { saved: DossierSnapshot[] } {
  const saved: DossierSnapshot[] = [];
  return {
    saved,
    save: async (_principal, _operation, snapshot) => {
      saved.push(snapshot);
    },
  };
}

async function lookup(
  body: unknown,
  actions: WalletGrant["actions"] = ["READ_DOSSIER"],
  titles = new Titles(),
) {
  return lookupDossier({
    identity: await agent(),
    walletId: "wallet-a",
    body,
    plan: PLAN,
    authorization: new WalletFixture(actions),
    titles,
    debtors,
    observations,
    snapshots: snapshots(),
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    newDossierId: () => "dossier-1",
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("the only handle is the external title id", () => {
  it("looks a debtor up by id_externo", async () => {
    const result = await lookup({ id_externo: "TIT-001" });

    expect(result.dossier.debtorId).toBe("debtor-a");
    expect(result.classification.category).toBe("DADOS_INSUFICIENTES");
  });

  it("refuses a CPF in place of the external id", async () => {
    await expect(lookup({ cpf: "52998224725" })).rejects.toThrow(
      "REQUISICAO_INVALIDA",
    );
  });

  it("refuses a CPF smuggled alongside the external id", async () => {
    // The schema is strict, so the extra key is refused by shape rather than
    // by anyone remembering to look for that particular field name.
    await expect(
      lookup({ id_externo: "TIT-001", cpf: "52998224725" }),
    ).rejects.toThrow("REQUISICAO_INVALIDA");
  });

  it("never passes the CPF to the title lookup", async () => {
    const titles = new Titles();
    await lookup({ id_externo: "TIT-001" }, ["READ_DOSSIER"], titles);

    expect(titles.seen).toEqual(["TIT-001"]);
  });

  it("refuses an empty external id", async () => {
    await expect(lookup({ id_externo: "" })).rejects.toThrow(
      "REQUISICAO_INVALIDA",
    );
  });
});

describe("authorization and wallet scope", () => {
  it("refuses an actor without READ_DOSSIER", async () => {
    await expect(lookup({ id_externo: "TIT-001" }, ["READ_AUDIT"])).rejects.toThrow(
      "DOSSIE_NAO_AUTORIZADO",
    );
  });

  it("answers nothing for a title this wallet does not hold", async () => {
    await expect(
      lookup({ id_externo: "TIT-999" }, ["READ_DOSSIER"], new Titles({})),
    ).rejects.toThrow("TITULO_FORA_DA_CARTEIRA");
  });

  it("names neither the CPF nor the debtor id when it refuses", async () => {
    await expect(
      lookup({ id_externo: "TIT-999" }, ["READ_DOSSIER"], new Titles({})),
    ).rejects.toSatisfy(
      (error: Error) =>
        !error.message.includes(DEBTOR.cpf) &&
        !error.message.includes(DEBTOR.debtorId),
    );
  });
});

describe("cursor pagination over priorities", () => {
  const carteira: readonly PriorityEntry[] = Array.from(
    { length: 7 },
    (_unused, index) => ({
      dossierId: `d-${index}`,
      externalId: `TIT-${index}`,
      category: index < 3 ? "COBRANCA_INTENSIVA" : "MONITORAMENTO",
      operationalPriority: index < 3 ? 0 : 2,
      score: 1 - index / 10,
    }),
  );

  it("returns a page and a cursor, and never repeats an entry", () => {
    const first = listPriorities(carteira, { cursor: null, limit: 3 });
    const second = listPriorities(carteira, {
      cursor: first.nextCursor,
      limit: 3,
    });
    const third = listPriorities(carteira, {
      cursor: second.nextCursor,
      limit: 3,
    });

    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(3);
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items, ...third.items].map(
      (entry) => entry.dossierId,
    );
    expect(new Set(ids).size).toBe(7);
  });

  it("orders by priority, then score, then id, whatever the input order", () => {
    const forward = listPriorities(carteira, { cursor: null, limit: 100 });
    const backward = listPriorities([...carteira].reverse(), {
      cursor: null,
      limit: 100,
    });

    expect(backward.items).toEqual(forward.items);
  });

  it("refuses a cursor the caller made up", () => {
    expect(() =>
      listPriorities(carteira, { cursor: "não-é-um-cursor", limit: 3 }),
    ).toThrow("CURSOR_INVALIDO");
  });

  it("carries no CPF in the cursor", () => {
    const { nextCursor } = listPriorities(carteira, { cursor: null, limit: 3 });
    const decoded = Buffer.from(nextCursor ?? "", "base64url").toString("utf8");

    expect(decoded).not.toContain("529");
    expect(decoded).toContain("d-2");
  });

  it("is stable when an entry is added behind the cursor", () => {
    // Keyset pagination, not offset: a page already served does not shift
    // because something new landed above it.
    const first = listPriorities(carteira, { cursor: null, limit: 3 });
    const grown = [
      ...carteira,
      {
        dossierId: "d-novo",
        externalId: "TIT-novo",
        category: "COBRANCA_INTENSIVA" as const,
        operationalPriority: 0,
        score: 0.95,
      },
    ];
    const second = listPriorities(grown, { cursor: first.nextCursor, limit: 3 });

    expect(second.items.map((entry) => entry.dossierId)).not.toContain("d-0");
  });
});
