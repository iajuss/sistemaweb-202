import { describe, expect, it } from "vitest";

import { validateTitleRow, type RawTitleRow } from "./wallet.js";

const validRow: RawTitleRow = {
  externalId: "TIT-001",
  name: "José da Silva",
  cpf: "529.982.247-25",
  amount: "1.234,56",
  dueDate: "2026-03-10",
};

describe("validateTitleRow", () => {
  it("accepts a valid row and keeps the amount in integer cents", () => {
    const result = validateTitleRow(validRow, 2);

    expect(result).toMatchObject({ status: "ACEITO", externalId: "TIT-001" });
    if (result.status !== "ACEITO") throw new Error("EXPECTED_ACCEPTED_ROW");
    expect(result.amount.toCents()).toBe(123456n);
    expect(result.cpfDigits).toBe("52998224725");
  });

  it("carries the debtor name, which identity resolution starts from", () => {
    const result = validateTitleRow(validRow, 2);

    if (result.status !== "ACEITO") throw new Error("EXPECTED_ACCEPTED_ROW");
    expect(result.name).toBe("José da Silva");
  });

  it("quarantines a row without a debtor name", () => {
    const result = validateTitleRow({ ...validRow, name: "   " }, 10);

    expect(result).toMatchObject({ reason: "NOME_AUSENTE" });
  });

  it("quarantines a CPF whose check digits do not close", () => {
    const result = validateTitleRow({ ...validRow, cpf: "529.982.247-26" }, 3);

    expect(result).toEqual({
      status: "QUARENTENA",
      rowNumber: 3,
      reason: "CPF_INVALIDO",
    });
  });

  it("quarantines a CPF made of one repeated digit", () => {
    const result = validateTitleRow({ ...validRow, cpf: "111.111.111-11" }, 4);

    expect(result).toMatchObject({ reason: "CPF_INVALIDO" });
  });

  it("never carries the CPF into a quarantine record", () => {
    const result = validateTitleRow({ ...validRow, cpf: "529.982.247-26" }, 5);

    // A quarantine record is written to an import report a human reads and an
    // operator may export. It identifies the row, never the person.
    expect(JSON.stringify(result)).not.toContain("529");
    expect(Object.keys(result)).toEqual(["status", "rowNumber", "reason"]);
  });

  it("quarantines a row without an external title id", () => {
    const result = validateTitleRow({ ...validRow, externalId: "  " }, 6);

    expect(result).toMatchObject({ reason: "ID_EXTERNO_AUSENTE" });
  });

  it.each([
    ["1234.56", "a dot where the spreadsheet uses a comma"],
    ["1234,561", "a tenth of a cent, which would have to be truncated"],
    ["", "an empty cell"],
  ])("quarantines the amount %s (%s)", (amount) => {
    expect(validateTitleRow({ ...validRow, amount }, 7)).toMatchObject({
      reason: "VALOR_INVALIDO",
    });
  });

  it.each([
    ["1,2", 120n],
    ["1.234,5", 123450n],
    ["1234", 123400n],
  ])("accepts %s, the way an ERP writes a column in reais", (amount, cents) => {
    const result = validateTitleRow({ ...validRow, amount }, 7);

    if (result.status !== "ACEITO") throw new Error("EXPECTED_ACCEPTED_ROW");
    expect(result.amount.toCents()).toBe(cents);
  });

  it("quarantines a due date that is not a real calendar day", () => {
    const result = validateTitleRow({ ...validRow, dueDate: "2026-02-30" }, 8);

    expect(result).toMatchObject({ reason: "VENCIMENTO_INVALIDO" });
  });

  /**
   * A Brazilian ERP exporting CSV writes `15/09/2026`, and refusing it made the
   * screen contradict itself: it *displays* `15/06/2026` and used to *reject*
   * `15/06/2026` on the way in. Both forms are accepted now; the domain still
   * carries a `Date`, and the day/month order is the Brazilian one, which is
   * the order the rest of this system reads and writes.
   */
  describe.each([
    ["15/09/2026", Date.UTC(2026, 8, 15)],
    ["01/12/2026", Date.UTC(2026, 11, 1)],
    // One digit is not ambiguous, only untidy, and an ERP emits it.
    ["1/9/2026", Date.UTC(2026, 8, 1)],
    ["  10/03/2026  ", Date.UTC(2026, 2, 10)],
    // The form that always worked keeps working.
    ["2026-03-10", Date.UTC(2026, 2, 10)],
  ])("accepts %s as a due date", (dueDate, expected) => {
    it("and carries the calendar day the operator meant", () => {
      const result = validateTitleRow({ ...validRow, dueDate }, 10);

      if (result.status !== "ACEITO") throw new Error("EXPECTED_ACCEPTED_ROW");
      expect(result.dueDate.getTime()).toBe(expected);
    });
  });

  describe.each([
    // Month 13: an American export, and the only honest answer is to refuse.
    ["04/13/2026"],
    // 31 September does not exist; rolling it into October would invent a date.
    ["31/09/2026"],
    // Two-digit year: 26 could be 1926 or 2026, and guessing a century on a
    // due date is guessing whether a debt is prescribed.
    ["15/09/26"],
    ["15/09"],
    ["15-09-2026"],
    ["2026/09/15"],
    ["ontem"],
    [""],
  ])("quarantines %s", (dueDate) => {
    it("instead of guessing what it meant", () => {
      const result = validateTitleRow({ ...validRow, dueDate }, 11);

      expect(result).toMatchObject({ reason: "VENCIMENTO_INVALIDO" });
    });
  });

  it("quarantines only the offending line, never the file", () => {
    // The rows are validated one at a time, so a single bad date costs one
    // line. This is the property the import screen depends on.
    const rows = [
      validateTitleRow({ ...validRow, dueDate: "15/09/2026" }, 2),
      validateTitleRow({ ...validRow, dueDate: "04/13/2026" }, 3),
      validateTitleRow({ ...validRow, dueDate: "2026-10-01" }, 4),
    ];

    expect(rows.map((row) => row.status)).toEqual([
      "ACEITO",
      "QUARENTENA",
      "ACEITO",
    ]);
  });

  it("reports the first failing field only, so one row yields one reason", () => {
    const result = validateTitleRow(
      { externalId: "", name: "", cpf: "nope", amount: "x", dueDate: "x" },
      9,
    );

    expect(result).toMatchObject({ reason: "ID_EXTERNO_AUSENTE" });
  });
});
