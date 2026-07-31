import type { AddressInfo } from "node:net";

import { createHttpServer } from "../http/server.js";
import {
  DEMO,
  debtorObservationReader,
  demoAgent,
  seedDemo,
  walletDebtorReader,
} from "./seed.js";

/**
 * One command, from an empty database to three answering endpoints.
 *
 * Seeding and serving share a process on purpose: the AEAD key vault lives in
 * memory (pendency F-5), so the process that encrypted a CPF is the only one
 * that can read it back. The ADR 006 KMS vault is what splits them.
 */

const DEFAULT_DATABASE_URL =
  "postgresql://dossie_app:dossie_app_local_only@127.0.0.1:5433/dossie_triagem";
const PORT = Number(process.env.PORT ?? 3000);

function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    // The demo issues development identities, which authenticate nobody in the
    // sense ADR 021 requires. Refusing anything but a loopback database is what
    // stops that convenience from ever being aimed at real data.
    throw new Error(
      "A demonstração só roda contra um banco em loopback. " +
        "Aponte DATABASE_URL para 127.0.0.1 ou suba o Compose local.",
    );
  }
}

async function main(): Promise<void> {
  process.env.DATABASE_URL ??= DEFAULT_DATABASE_URL;
  assertLocalDatabase(process.env.DATABASE_URL);
  // Set only after the loopback check above. Outside development no
  // `VerifiedPrincipal` can be issued at all (ADR 021), which is what makes
  // this a development tool rather than a running product.
  process.env.NODE_ENV = "development";

  console.log("Semeando o banco a partir das fixtures...");
  const runtime = await seedDemo();

  const server = createHttpServer({
    plan: runtime.plan,
    authorization: runtime.authorization,
    // Both schemes reach the same development identity, and the scheme is the
    // only difference: a browser cannot be told to send `Bearer`, but it will
    // send `Basic` once the page asks for a credential. Which directory
    // validates it is fixed here and unreachable from a request (defect I-3),
    // and outside development no principal is issued at all (ADR 021).
    authenticate: async (request) =>
      /^(Bearer|Basic) /.test(request.headers.authorization ?? "")
        ? demoAgent()
        : null,
    titles: {
      findDebtorByExternalId: (principal, operation, externalId) =>
        runtime.store.titles.findDebtorByExternalId(
          principal,
          operation,
          externalId,
        ),
    },
    debtors: walletDebtorReader(runtime.store),
    debtorNames: {
      findNameInWallet: (principal, operation, debtorId) =>
        runtime.store.titles.findNameInWallet(principal, operation, debtorId),
    },
    observations: debtorObservationReader(runtime.store),
    snapshots: {
      save: async (_principal, _operation, snapshot) =>
        void runtime.snapshots.set(snapshot.dossierId, snapshot),
      find: async (_principal, _operation, dossierId) =>
        runtime.snapshots.get(dossierId) ?? null,
    },
    priorities: { listForWallet: async () => runtime.priorities },
    // White label from the tenant row, not from a constant in this file.
    theme: {
      read: (principal, operation) =>
        runtime.store.theme.read(principal, operation),
    },
  });

  await new Promise<void>((resolve) =>
    server.listen(PORT, "127.0.0.1", resolve),
  );
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  console.log("");
  console.log(`Carteira ${DEMO.walletId} do tenant ${DEMO.tenantId}`);
  console.log(
    `${runtime.debtors.length} devedores, ${runtime.quarantined} linhas em quarentena`,
  );
  console.log("");
  console.log("Prioridades da carteira:");
  for (const entry of runtime.priorities) {
    const debtor = runtime.debtors.find((candidate) =>
      candidate.externalIds.includes(entry.externalId),
    );
    console.log(
      `  ${entry.dossierId}  ${entry.category.padEnd(21)} ` +
        `pontuação ${entry.score.toFixed(2)}  ${entry.externalId}  ${debtor?.name ?? ""}`,
    );
  }
  console.log("");
  console.log("Endpoints:");
  console.log(
    `  POST ${base}/api/v1/carteiras/${DEMO.walletId}/dossies/lookup  {"id_externo":"DEMO-001"}`,
  );
  console.log(`  GET  ${base}/api/v1/carteiras/${DEMO.walletId}/prioridades`);
  console.log(
    `  GET  ${base}/api/v1/dossies/${runtime.priorities[0]?.dossierId ?? "dossie-1"}/prompt?carteira=${DEMO.walletId}`,
  );
  console.log("");
  console.log("");
  console.log("Telas:");
  console.log(`  ${base}/carteiras/${DEMO.walletId}/prioridades`);
  console.log(
    `  ${base}/carteiras/${DEMO.walletId}/dossies/${runtime.priorities[0]?.dossierId ?? "dossie-1"}`,
  );
  console.log("");
  console.log("Toda requisição precisa do cabeçalho: Authorization: Bearer demo");
  console.log(
    "No navegador, as telas pedem usuário e senha — qualquer valor serve nesta demonstração.",
  );
  console.log("Ctrl+C encerra.");

  const shutdown = () => {
    server.close(() => {
      void runtime.disconnect().then(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
