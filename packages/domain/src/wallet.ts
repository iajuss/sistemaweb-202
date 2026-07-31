import { Money, normalizeSpreadsheetMoney } from "./money.js";

/**
 * A row as it left the spreadsheet: every cell is still text, because a CSV
 * has no types and an XLSX cell cannot be trusted to carry one.
 */
export interface RawTitleRow {
  readonly externalId: string;
  readonly cpf: string;
  readonly amount: string;
  readonly dueDate: string;
}

export type QuarantineReason =
  | "ID_EXTERNO_AUSENTE"
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

function parseDueDate(raw: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (parts === null) {
    return null;
  }
  const [, year, month, day] = parts;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  // `Date.UTC` rolls February 30th into March. Comparing the parts back is the
  // only way to tell a real calendar day from a rolled one.
  const isSameDay =
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day);
  return isSameDay ? parsed : null;
}

function quarantine(
  rowNumber: number,
  reason: QuarantineReason,
): QuarantinedTitleRow {
  return { status: "QUARENTENA", rowNumber, reason };
}

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
    cpfDigits: raw.cpf.replace(/\D/g, ""),
    amount,
    dueDate,
  };
}
