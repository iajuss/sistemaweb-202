// Regenerates the synthetic wallet import fixtures.
//
// These files are committed, but the generator is committed with them: a
// fixture that claims to be synthetic should be provably synthetic, and the
// CP1252 and XLSX files cannot be reviewed by reading the diff.
//
// Run: node scripts/make-wallet-fixtures.mjs

import { deflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../fixtures/wallet/", import.meta.url));
mkdirSync(outputDirectory, { recursive: true });

// --- CPFs -----------------------------------------------------------------
// Generated from a base so the check digits close. No real person's CPF is
// used, here or anywhere else in the fixtures.

function checkDigit(digits, length) {
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Number(digits[index]) * (length + 1 - index);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function cpf(base9) {
  const first = checkDigit(base9, 9);
  const second = checkDigit(`${base9}${first}`, 10);
  const full = `${base9}${first}${second}`;
  return `${full.slice(0, 3)}.${full.slice(3, 6)}.${full.slice(6, 9)}-${full.slice(9)}`;
}

const CPF_JOSE = cpf("529982247");
const CPF_MARIA = cpf("111444777");
const CPF_ANA = cpf("390533447");

// --- CSV ------------------------------------------------------------------

writeFileSync(
  `${outputDirectory}valid-cp1252-semicolon.csv`,
  Buffer.from(
    [
      "id_externo;nome;cpf;valor;vencimento",
      `TIT-001;JOSÉ DA SILVA;${CPF_JOSE};1.234,56;2026-03-10`,
      "",
      `TIT-002;JOSÉ DA SILVA;${CPF_JOSE};89,90;2026-04-10`,
      `TIT-003;MARIA JOÃO CONCEIÇÃO;${CPF_MARIA};10.000,00;2026-05-01`,
      "",
    ].join("\r\n"),
    "latin1",
  ),
);

writeFileSync(
  `${outputDirectory}invalid-cpf.csv`,
  Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(
      [
        "id_externo,nome,cpf,valor,vencimento",
        `TIT-010,"SANTOS, ANA PAULA",${CPF_ANA},"1.500,00",2026-06-15`,
        `TIT-011,CARLOS PEREIRA,529.982.247-26,"300,00",2026-06-20`,
        `TIT-012,ROBERTO ALVES,${CPF_MARIA},700,2026-07-01`,
      ].join("\n"),
      "utf8",
    ),
  ]),
);

// --- XLSX -----------------------------------------------------------------
// A minimal but Excel-shaped workbook: DEFLATE entries, shared strings with a
// split run, one inline string, and a due date as a styled serial number.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const raw = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(raw);
    const nameBytes = Buffer.from(name, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8); // DEFLATE, as Excel writes
    localHeader.writeUInt32LE(crc32(raw), 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    locals.push(localHeader, nameBytes, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(crc32(raw), 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

/** Excel serial for a UTC date: day 1 is 1900-01-01 under the 1900 leap bug. */
function excelSerial(iso) {
  const EPOCH = Date.UTC(1899, 11, 30);
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH) / 86_400_000);
}

const sharedStrings = [
  "id_externo",
  "nome",
  "cpf",
  "valor",
  "vencimento",
  "TIT-100",
  // Split across runs, which is what Excel does after in-cell editing.
  ["JOÃO ", "BATISTA MOREIRA"],
  CPF_JOSE,
  "TIT-101",
  "ANA LÚCIA FERREIRA",
  CPF_MARIA,
  "TIT-102",
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings
  .map((entry) =>
    Array.isArray(entry)
      ? `<si>${entry.map((run) => `<r><t xml:space="preserve">${escapeXml(run)}</t></r>`).join("")}</si>`
      : `<si><t>${escapeXml(entry)}</t></si>`,
  )
  .join("\n")}
</sst>`;

// Style 1 points at numFmtId 14, the built-in short date.
const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>
</styleSheet>`;

const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2" t="s"><v>6</v></c><c r="C2" t="s"><v>7</v></c><c r="D2"><v>1234.56</v></c><c r="E2" s="1"><v>${excelSerial("2026-03-10")}</v></c></row>
<row r="3"><c r="A3" t="s"><v>8</v></c><c r="B3" t="s"><v>9</v></c><c r="C3" t="s"><v>10</v></c><c r="D3"><v>89.9</v></c><c r="E3" s="2"><v>${excelSerial("2026-04-10")}</v></c></row>
<row r="4"><c r="A4" t="s"><v>11</v></c><c r="B4" t="inlineStr"><is><t>PEDRO &amp; FILHOS</t></is></c><c r="C4" t="str"><v>111.444.777-35</v></c><c r="D4"><v>10000</v></c><c r="E4" s="1"><v>${excelSerial("2026-05-01")}</v></c></row>
</sheetData></worksheet>`;

writeFileSync(
  `${outputDirectory}titles.xlsx`,
  zip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Carteira" sheetId="1" r:id="rId7"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      // Deliberately not rId1 and not sheet1.xml: the reader must resolve the
      // target through the rels, the way a real workbook forces it to.
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/carteira.xml"/></Relationships>`,
    ],
    ["xl/sharedStrings.xml", sharedStringsXml],
    ["xl/styles.xml", stylesXml],
    ["xl/worksheets/carteira.xml", sheetXml],
  ]),
);

console.log(`fixtures written to ${outputDirectory}`);
