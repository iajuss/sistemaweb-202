// Applies the pending migrations from the host against the Compose database.
//
// Run: pnpm migrate
//
// The Compose `migrate` service does the same thing, but it depends on
// `workspace-dependencies`, which bind-mounts the repository and rewrites
// `packages/*/node_modules` on the host with reparse points Windows cannot
// resolve — defect E-1 in docs/limitacoes-v1.md, which has cost three
// sessions. This path touches no container filesystem: it runs the Prisma CLI
// that `pnpm install` already put in `node_modules`, over the port the Compose
// stack publishes on loopback.
//
// `pnpm migrate:compose` still exists for Linux and CI, where E-1 does not
// occur and running the migration inside the network is the closer rehearsal.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

// The owner role owns the schema; the application role deliberately cannot
// create or alter tables. Local development credentials only.
const DATABASE_URL =
  process.env.MIGRATE_DATABASE_URL ??
  "postgresql://dossie_owner:dossie_owner_local_only@127.0.0.1:5433/dossie_triagem";

const prisma = resolve(
  workspaceRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.CMD" : "prisma",
);

const result = spawnSync(prisma, ["migrate", "deploy"], {
  cwd: workspaceRoot,
  env: { ...process.env, DATABASE_URL },
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
