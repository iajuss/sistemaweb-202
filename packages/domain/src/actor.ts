export type ActorKind = "HUMAN" | "AGENT" | "SYSTEM";

export interface Actor {
  readonly kind: ActorKind;
  readonly provider: string;
  readonly subject: string;
  readonly tenantId?: string;
}
