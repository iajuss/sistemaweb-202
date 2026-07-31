import { z } from "zod";

import { ClassificationSchema } from "./classification-schema.js";
import { DossierSchema } from "./dossier-schema.js";
import {
  ListPrioritiesRequestSchema,
  LookupDossierRequestSchema,
} from "./requests.js";

/**
 * OpenAPI derived from the Zod schemas. A contract hand-authored in parallel
 * with the code drifts, and the version an agent reads stops being the version
 * the server enforces. Every request shape below comes from the same object
 * the runtime validator uses — there is no second definition to fall behind.
 */

export interface OpenApiParameter {
  readonly name: string;
  readonly in: "query" | "path";
  readonly required: boolean;
  readonly schema: unknown;
}

export interface OpenApiOperation {
  readonly summary: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly required: boolean;
    readonly content: Record<string, { readonly schema: unknown }>;
  };
  readonly responses: Record<
    string,
    {
      readonly description: string;
      readonly content?: Record<string, { readonly schema: unknown }>;
    }
  >;
}

export interface OpenApiDocument {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<
    string,
    Partial<Record<"get" | "post", OpenApiOperation>>
  >;
  readonly components: { readonly schemas: Record<string, unknown> };
}

function jsonSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { target: "draft-2020-12" });
}

const WALLET_ID: OpenApiParameter = {
  name: "walletId",
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1 },
};

export function buildOpenApiDocument(): OpenApiDocument {
  const prioritiesShape = ListPrioritiesRequestSchema.shape;

  return {
    openapi: "3.1.0",
    info: { title: "Dossier triage contracts", version: "1.0.0" },
    components: {
      schemas: {
        Dossier: jsonSchema(DossierSchema),
        Classification: jsonSchema(ClassificationSchema),
        LookupDossierRequest: jsonSchema(LookupDossierRequestSchema),
      },
    },
    paths: {
      "/api/v1/carteiras/{walletId}/dossies/lookup": {
        post: {
          summary:
            "Compõe o dossiê do título indicado. O identificador é o id externo do título; não existe consulta por pessoa.",
          parameters: [WALLET_ID],
          requestBody: {
            required: true,
            // POST, never GET: um GET poria o identificador na URL, e dali em
            // todo log de acesso e cache de proxy do caminho.
            content: {
              "application/json": {
                schema: jsonSchema(LookupDossierRequestSchema),
              },
            },
          },
          responses: {
            "200": {
              description: "Dossiê composto e classificado.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      classification: {
                        $ref: "#/components/schemas/Classification",
                      },
                    },
                  },
                },
              },
            },
            "403": { description: "Sem capacidade sobre a carteira." },
            "404": {
              description:
                "Título ausente desta carteira. Indistinguível de título inexistente, de propósito.",
            },
          },
        },
      },
      "/api/v1/carteiras/{walletId}/prioridades": {
        get: {
          summary:
            "Lista a carteira por prioridade operacional, paginada por cursor opaco.",
          parameters: [
            WALLET_ID,
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: jsonSchema(prioritiesShape.cursor),
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: jsonSchema(prioritiesShape.limit),
            },
          ],
          responses: {
            "200": { description: "Uma página, mais o cursor da próxima." },
            "400": {
              description:
                "Cursor inválido. O cursor é opaco e não deve ser construído pelo chamador.",
            },
          },
        },
      },
      "/api/v1/dossies/{dossierId}/prompt": {
        get: {
          summary:
            "Projeção do dossiê para consumo por agente, versionada e determinística.",
          parameters: [
            {
              name: "dossierId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "carteira",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": {
              description: "Texto do prompt.",
              content: { "text/markdown": { schema: { type: "string" } } },
            },
            "404": { description: "Dossiê fora do alcance desta carteira." },
          },
        },
      },
    },
  };
}
