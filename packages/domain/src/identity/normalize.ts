/**
 * Names arrive from a client spreadsheet and from a federal publication, typed
 * by different people under different conventions. Comparing them requires one
 * shape, and producing that shape is the only thing this module does — it makes
 * no judgement about whether two names are the same person.
 */

/**
 * Dropped before comparison. They carry no discriminating power and their
 * presence is a typing habit: "JOSÉ DA SILVA" and "JOSE SILVA" are the same
 * name written by two people, and counting `DA` as a token would make the
 * second look like an incomplete version of the first.
 */
const CONNECTIVES = new Set(["DA", "DE", "DO", "DAS", "DOS", "DI", "DU", "E"]);

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(raw: string): readonly string[] {
  return normalizeName(raw)
    .split(" ")
    .filter((token) => token !== "" && !CONNECTIVES.has(token));
}
