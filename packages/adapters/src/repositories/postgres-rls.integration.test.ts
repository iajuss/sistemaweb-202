import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

interface ComposeService {
  readonly environment?: Record<string, string>;
  readonly depends_on?: Record<string, { readonly condition?: string }>;
  readonly healthcheck?: { readonly test?: readonly string[] };
}

interface ComposeConfig {
  readonly services: Record<string, ComposeService>;
}

function composeConfig(): ComposeConfig {
  return JSON.parse(
    execFileSync("docker", ["compose", "config", "--format", "json"], {
      cwd: workspaceRoot,
      encoding: "utf8",
    }),
  ) as ComposeConfig;
}

function psql(role: "dossie_owner" | "dossie_app", sql: string): string {
  const password =
    role === "dossie_owner"
      ? "dossie_owner_local_only"
      : "dossie_app_local_only";
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      `PGPASSWORD=${password}`,
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      role,
      "-d",
      "dossie_triagem",
      "-tA",
      "-c",
      sql,
    ],
    { cwd: workspaceRoot, encoding: "utf8" },
  );
}

interface TenantTableCatalogRow {
  readonly table: string;
  readonly rls: boolean;
  readonly force: boolean;
  readonly policies: readonly {
    readonly using: string | null;
    readonly check: string | null;
  }[];
}

describe("production RLS compose contract", () => {
  it("runs migrations as owner and starts application services only with the restricted role", () => {
    const services = composeConfig().services;
    const postgres = services.postgres;
    const migrate = services.migrate;
    const web = services.web;
    const worker = services.worker;

    if (!postgres || !migrate || !web || !worker) {
      throw new Error("RLS_COMPOSE_SERVICES_REQUIRED");
    }
    expect(postgres.healthcheck?.test?.join(" ")).toContain("dossie_owner");
    expect(migrate.environment?.DATABASE_URL).toContain("dossie_owner");
    expect(web.environment?.DATABASE_URL).toContain("dossie_app");
    expect(worker.environment?.DATABASE_URL).toContain("dossie_app");
    expect(web.depends_on?.migrate?.condition).toBe(
      "service_completed_successfully",
    );
    expect(worker.depends_on?.migrate?.condition).toBe(
      "service_completed_successfully",
    );
  });

  it("enforces RLS for direct application-role reads and covers every tenant table", () => {
    psql(
      "dossie_owner",
      `INSERT INTO "Tenant" ("id") VALUES ('tenant-a'), ('tenant-b') ON CONFLICT ("id") DO NOTHING;
       INSERT INTO "Wallet" ("id", "tenantId", "name", "importedAt")
       VALUES ('wallet-b', 'tenant-b', 'wallet fixture', CURRENT_TIMESTAMP)
       ON CONFLICT ("id") DO NOTHING;`,
    );

    const directRead = psql(
      "dossie_app",
      `BEGIN;
       SELECT set_config('app.tenant_id', 'tenant-a', true);
       SELECT count(*) FROM "Wallet" WHERE "tenantId" = 'tenant-b';
       ROLLBACK;`,
    )
      .trim()
      .split(/\r?\n/)
      .at(-2);
    expect(directRead).toBe("0");

    const role = JSON.parse(
      psql(
        "dossie_owner",
        `SELECT json_build_object(
          'superuser', rol.rolsuper,
          'bypassRls', rol.rolbypassrls,
          'ownsTenantTable', EXISTS (
            SELECT 1
            FROM pg_class cls
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            WHERE ns.nspname = 'public'
              AND cls.relkind = 'r'
              AND cls.relowner = rol.oid
              AND (cls.relname = 'Tenant' OR EXISTS (
                SELECT 1 FROM pg_attribute attr
                WHERE attr.attrelid = cls.oid
                  AND attr.attname = 'tenantId'
                  AND NOT attr.attisdropped
              ))
          )
        )
        FROM pg_roles rol
        WHERE rol.rolname = 'dossie_app';`,
      ),
    ) as {
      readonly superuser: boolean;
      readonly bypassRls: boolean;
      readonly ownsTenantTable: boolean;
    };
    expect(role).toEqual({
      superuser: false,
      bypassRls: false,
      ownsTenantTable: false,
    });

    const tables = JSON.parse(
      psql(
        "dossie_owner",
        `WITH tenant_tables AS (
          SELECT cls.oid, cls.relname, cls.relrowsecurity, cls.relforcerowsecurity
          FROM pg_class cls
          JOIN pg_namespace ns ON ns.oid = cls.relnamespace
          WHERE ns.nspname = 'public'
            AND cls.relkind = 'r'
            AND (cls.relname = 'Tenant' OR EXISTS (
              SELECT 1 FROM pg_attribute attr
              WHERE attr.attrelid = cls.oid
                AND attr.attname = 'tenantId'
                AND NOT attr.attisdropped
            ))
        )
        SELECT COALESCE(json_agg(json_build_object(
          'table', relname,
          'rls', relrowsecurity,
          'force', relforcerowsecurity,
          'policies', (
            SELECT COALESCE(json_agg(json_build_object(
              'using', pg_get_expr(policy.polqual, policy.polrelid),
              'check', pg_get_expr(policy.polwithcheck, policy.polrelid)
            )), '[]'::json)
            FROM pg_policy policy
            WHERE policy.polrelid = tenant_tables.oid
          )
        ) ORDER BY relname), '[]'::json)
        FROM tenant_tables;`,
      ),
    ) as readonly TenantTableCatalogRow[];

    expect(tables.map((table) => table.table)).toEqual([
      "ActorIdentity",
      "AgentWalletGrant",
      "Debtor",
      "Observation",
      "Tenant",
      "Title",
      "Wallet",
      "WalletImport",
    ]);
    for (const table of tables) {
      expect(table.rls).toBe(true);
      expect(table.force).toBe(true);
      expect(table.policies).not.toHaveLength(0);
      for (const policy of table.policies) {
        expect(policy.using).toContain("current_setting");
        expect(policy.using).toContain("app.tenant_id");
        expect(policy.check).toContain("current_setting");
        expect(policy.check).toContain("app.tenant_id");
      }
    }
  });
});
