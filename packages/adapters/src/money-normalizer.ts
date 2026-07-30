const SPREADSHEET_MONEY_PATTERN = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?$/;

export function normalizeSpreadsheetMoney(raw: string): string {
  if (typeof raw !== "string") {
    throw new TypeError("SPREADSHEET_MONEY_MUST_BE_A_STRING");
  }

  const parts = SPREADSHEET_MONEY_PATTERN.exec(raw);
  if (parts === null) {
    throw new TypeError("SPREADSHEET_MONEY_FORMAT_INVALID");
  }

  const [, sign, whole, fraction = "00"] = parts;
  return `${sign}${whole.replaceAll(".", "")}.${fraction}`;
}
