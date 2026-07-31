import { z } from "zod";

const ValidatedIdentityInputSchema = z
  .object({
    issuer: z.string().min(1),
    subject: z.string().min(1),
  })
  .strict();

export const PrincipalIssuanceOriginSchema = z.enum([
  "HUMAN_KEYCLOAK",
  "AGENT_MACHINE_CREDENTIAL",
  "SYSTEM_WORKER",
]);

export type PrincipalIssuanceOrigin = z.infer<
  typeof PrincipalIssuanceOriginSchema
>;

declare const verifiedPrincipalBrand: unique symbol;

/**
 * Public shape only. Its concrete implementation and issuer stay private to
 * this middleware module, so a caller-shaped object cannot become verified.
 */
export interface VerifiedPrincipal {
  readonly [verifiedPrincipalBrand]: true;
  readonly issuer: string;
  readonly subject: string;
  readonly origin: PrincipalIssuanceOrigin;
}

class RuntimeVerifiedPrincipal implements VerifiedPrincipal {
  declare readonly [verifiedPrincipalBrand]: true;
  readonly #issuer: string;
  readonly #subject: string;
  readonly #origin: PrincipalIssuanceOrigin;

  private constructor(
    authority: object,
    input: z.infer<typeof ValidatedIdentityInputSchema>,
    origin: PrincipalIssuanceOrigin,
  ) {
    if (authority !== principalIssuanceAuthority) {
      throw new Error("VERIFIED_PRINCIPAL_ISSUANCE_FORBIDDEN");
    }
    this.#issuer = input.issuer;
    this.#subject = input.subject;
    this.#origin = origin;
    Object.freeze(this);
    issuedPrincipals.add(this);
  }

  public static issue(
    authority: object,
    input: z.infer<typeof ValidatedIdentityInputSchema>,
    origin: PrincipalIssuanceOrigin,
  ): VerifiedPrincipal {
    return new RuntimeVerifiedPrincipal(authority, input, origin);
  }

  public get issuer(): string {
    return this.#issuer;
  }

  public get subject(): string {
    return this.#subject;
  }

  public get origin(): PrincipalIssuanceOrigin {
    return this.#origin;
  }

  public assertPrivateState(): void {
    void this.#issuer;
    void this.#subject;
    void this.#origin;
  }
}

const principalIssuanceAuthority = Object.freeze({});
const issuedPrincipals = new WeakSet<RuntimeVerifiedPrincipal>();

function issueVerifiedPrincipal(
  input: unknown,
  origin: PrincipalIssuanceOrigin,
): VerifiedPrincipal {
  return RuntimeVerifiedPrincipal.issue(
    principalIssuanceAuthority,
    ValidatedIdentityInputSchema.parse(input),
    origin,
  );
}

export function assertVerifiedPrincipal(
  principal: VerifiedPrincipal,
): asserts principal is VerifiedPrincipal {
  if (
    !(principal instanceof RuntimeVerifiedPrincipal) ||
    !issuedPrincipals.has(principal)
  ) {
    throw new Error("VERIFIED_PRINCIPAL_REQUIRED");
  }

  try {
    principal.assertPrivateState();
  } catch {
    throw new Error("VERIFIED_PRINCIPAL_REQUIRED");
  }
}

const DevInsecureIdentityProviderOptionsSchema = z
  .object({
    allowInsecureDevelopmentIdentity: z.literal(true),
  })
  .strict();

/**
 * Development-only fixture provider. It deliberately has no production token
 * input, so deploying it cannot silently become OIDC/JWKS verification.
 */
export class DevInsecureIdentityProvider {
  public constructor(options: unknown) {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("DEV_INSECURE_IDENTITY_PROVIDER_FORBIDDEN");
    }
    DevInsecureIdentityProviderOptionsSchema.parse(options, {
      error: () => new Error("EXPLICIT_DEVELOPMENT_IDENTITY_OPT_IN_REQUIRED"),
    });
  }

  public authenticateHumanKeycloak(
    validatedDevelopmentInput: unknown,
  ): VerifiedPrincipal {
    return issueVerifiedPrincipal(validatedDevelopmentInput, "HUMAN_KEYCLOAK");
  }

  public authenticateMachineAgent(
    validatedDevelopmentInput: unknown,
  ): VerifiedPrincipal {
    return issueVerifiedPrincipal(
      validatedDevelopmentInput,
      "AGENT_MACHINE_CREDENTIAL",
    );
  }

  public authenticateSystemWorker(
    validatedDevelopmentInput: unknown,
  ): VerifiedPrincipal {
    return issueVerifiedPrincipal(validatedDevelopmentInput, "SYSTEM_WORKER");
  }
}
