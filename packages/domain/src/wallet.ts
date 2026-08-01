import { Money, normalizeSpreadsheetMoney } from "./money.js";

/**
 * A row as it left the spreadsheet: every cell is still text, because a CSV
 * has no types and an XLSX cell cannot be trusted to carry one.
 */
export interface RawTitleRow {
  readonly externalId: string;
  readonly name: string;
  readonly cpf: string;
  readonly amount: string;
  readonly dueDate: string;
}

export type QuarantineReason =
  | "ID_EXTERNO_AUSENTE"
  | "ID_EXTERNO_DUPLICADO"
  | "NOME_AUSENTE"
  | "CPF_INVALIDO"
  | "VALOR_INVALIDO"
  | "VENCIMENTO_INVALIDO";

/**
 * Written to an import report a human reads and an operator may export, so it
 * identifies the row and never the person. No CPF, not even masked.
 */
export interface QuarantinedTitleRow {
  readonly status: "QUARENTENA";
  readonly rowNumber: number;
  readonly reason: QuarantineReason;
}

export interface AcceptedTitleRow {
  readonly status: "ACEITO";
  readonly rowNumber: number;
  readonly externalId: string;
  /** Identity resolution starts from name + CPF, so the name is not optional. */
  readonly name: string;
  readonly cpfDigits: string;
  readonly amount: Money;
  readonly dueDate: Date;
}

export type ValidatedTitleRow = AcceptedTitleRow | QuarantinedTitleRow;

const CPF_LENGTH = 11;

function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let position = 0; position < length; position += 1) {
    sum += Number(digits[position]) * (length + 1 - position);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== CPF_LENGTH) {
    return false;
  }
  // A single repeated digit closes both check digits arithmetically while
  // never being a real CPF, so it has to be rejected explicitly.
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }
  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * `DD/MM/AAAA`, the form a Brazilian ERP writes into a CSV. Day and month may
 * come with one digit — untidy, not ambiguous. The year must be four digits:
 * `15/09/26` could be 1926 or 2026, and guessing a century on a due date is
 * guessing whether a debt is prescribed.
 */
const BRAZILIAN_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * The two forms the importer accepts, and nothing else. Both name a calendar
 * day; the ambiguity that is refused is refused explicitly rather than
 * resolved by a guess.
 *
 * Day before month, because that is the order this system reads and writes
 * everywhere else. A file exported in the American order therefore fails on
 * any day past the twelfth — `04/13/2026` is quarantined — and matches the
 * Brazilian reading on the days before it. That residue cannot be detected
 * per row, and the alternative would be to sniff a whole file's worth of dates
 * and pick an order, which is a guess wearing statistics.
 */
function parseDueDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const iso = ISO_DAY.exec(trimmed);
  const brazilian = iso ? null : BRAZILIAN_DAY.exec(trimmed);
  if (!iso && !brazilian) {
    return null;
  }

  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [
        Number((brazilian as RegExpExecArray)[3]),
        Number((brazilian as RegExpExecArray)[2]),
        Number((brazilian as RegExpExecArray)[1]),
      ];

  const parsed = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` rolls February 30th into March. Comparing the parts back is the
  // only way to tell a real calendar day from a rolled one.
  const isSameDay =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  return isSameDay ? parsed : null;
}

/**
 * Exported because some reasons are only visible above one row — a repeated
 * external id needs the rest of the file to be seen — and the record's shape
 * stays owned here, where the rule that it never carries a CPF lives.
 */
export function quarantineTitleRow(
  rowNumber: number,
  reason: QuarantineReason,
): QuarantinedTitleRow {
  return { status: "QUARENTENA", rowNumber, reason };
}

const quarantine = quarantineTitleRow;

/**
 * Validates one imported row. Returns the first failing field only: a row is
 * quarantined once, and a report listing four reasons for the same line tells
 * the operator less, not more.
 */
export function validateTitleRow(
  raw: RawTitleRow,
  rowNumber: number,
): ValidatedTitleRow {
  const externalId = raw.externalId.trim();
  if (externalId === "") {
    return quarantine(rowNumber, "ID_EXTERNO_AUSENTE");
  }

  const name = raw.name.trim();
  if (name === "") {
    return quarantine(rowNumber, "NOME_AUSENTE");
  }

  if (!isValidCpf(raw.cpf)) {
    return quarantine(rowNumber, "CPF_INVALIDO");
  }

  let amount: Money;
  try {
    amount = Money.fromDecimalString(normalizeSpreadsheetMoney(raw.amount.trim()));
  } catch {
    return quarantine(rowNumber, "VALOR_INVALIDO");
  }

  const dueDate = parseDueDate(raw.dueDate);
  if (dueDate === null) {
    return quarantine(rowNumber, "VENCIMENTO_INVALIDO");
  }

  return {
    status: "ACEITO",
    rowNumber,
    externalId,
    name,
    cpfDigits: raw.cpf.replace(/\D/g, ""),
    amount,
    dueDate,
  };
}
