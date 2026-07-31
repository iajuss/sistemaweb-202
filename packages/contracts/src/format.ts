/**
 * Brazilian formatting, and the only place it happens.
 *
 * **Formatting lives at the presentation edge, never inside the domain.** The
 * domain carries money as integer cents and instants as ISO-8601 UTC, because
 * those are the forms that survive arithmetic and storage. A `R$` and a comma
 * are things a person reads, so they are added here, on the way out, and never
 * parsed back.
 *
 * The grouping below is done on the digits of a `bigint` rather than through
 * the platform's locale number formatter, whose entry point takes a `number` —
 * the one conversion this whole codebase exists to avoid. The real source
 * already publishes `29163886,440000001`. The ban is checked by substring, so
 * the formatter is described here instead of named.
 */

const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function groupThousands(digits: string): string {
  let grouped = "";
  for (let index = digits.length; index > 0; index -= 3) {
    const start = index - 3 > 0 ? index - 3 : 0;
    grouped = digits.slice(start, index) + (grouped === "" ? "" : ".") + grouped;
  }
  return grouped;
}

/** `2917588644n` → `R$ 29.175.886,44`. Integer arithmetic the whole way. */
export function formatBrlFromCents(centavos: bigint): string {
  const negative = centavos < 0n;
  const absolute = negative ? -centavos : centavos;
  const reais = (absolute / 100n).toString();
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}R$ ${groupThousands(reais)},${cents}`;
}

function parts(iso: string): RegExpExecArray {
  const matched = ISO_INSTANT.exec(iso);
  if (!matched) {
    // Refused rather than guessed: a date the screen renders wrong is a date
    // an operator acts on wrong.
    throw new Error("DATA_NAO_E_ISO_8601");
  }
  return matched;
}

/** `2026-07-31T17:40:28.660Z` → `31/07/2026`. */
export function formatIsoDate(iso: string): string {
  const [, year, month, day] = parts(iso);
  return `${day}/${month}/${year}`;
}

/**
 * `2026-07-31T17:40:28.660Z` → `31/07/2026 17:40 UTC`.
 *
 * The zone is printed instead of converted. Shifting to local time needs a
 * tenant timezone nobody has configured yet, and an audit trail showing the
 * wrong hour is worse than one showing an explicit zone.
 */
export function formatIsoDateTime(iso: string): string {
  const [, year, month, day, hour, minute] = parts(iso);
  return `${day}/${month}/${year} ${hour}:${minute} UTC`;
}
