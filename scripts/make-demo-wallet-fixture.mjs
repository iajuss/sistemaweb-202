// Regenerates the synthetic demo wallet.
//
// Run: node scripts/make-demo-wallet-fixture.mjs
//
// This is demo material, not a test fixture: `fixtures/wallet/titles.xlsx`
// exercises the reader's edge cases, while this workbook exists so the seeded
// database tells a story. Its three people are chosen against the committed
// PGFN fixtures so that one run produces a confirmed match, an unconfirmed one
// and a clean debtor — the three answers the engine is supposed to be able to
// give apart.
//
// The ZIP and sheet writers are a deliberate copy of make-wallet-fixtures.mjs
// rather than a shared module: those bytes are under test and pinned by
// .gitattributes, and a refactor of the generator that produced them would be
// a change nothing verifies.

import { deflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(
  new URL("../fixtures/demo/", import.meta.url),
);
mkdirSync(outputDirectory, { recursive: true });

// --- CPFs -----------------------------------------------------------------
// Generated from a base so the check digits close. No real person's CPF is
// used. Digits 4-9 are what the PGFN publishes as `***.NNN.NNN-**`, so the
// base chosen here decides which published mask each person is compatible with.

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

// Mask ***.982.247-**, which SIDA, Previdenciário and the manual list all
// publish. The name matches the Dados Abertos record exactly and none of the
// list rows, so Dados Abertos confirms and the list does not.
const CPF_CONFIRMA = cpf("529982247");
// Mask ***.111.222-**, published by SIDA under a shorter name and by the
// manual list under this exact one.
const CPF_PARCIAL = cpf("123111222");
// Mask ***.444.777-**, which no committed fixture publishes: both sources read
// in full and find nobody.
const CPF_LIMPO = cpf("111444777");

const ROWS = [
  ["DEMO-001", "JOSE DA SILVA", CPF_CONFIRMA, 12500.0, "2026-03-10"],
  ["DEMO-002", "JOSE DA SILVA", CPF_CONFIRMA, 3480.9, "2026-04-10"],
  ["DEMO-010", "JOSE DA SILVA SANTOS", CPF_PARCIAL, 2200.0, "2026-05-05"],
  ["DEMO-020", "ANA LUCIA FERREIRA", CPF_LIMPO, 780.0, "2026-06-01"],
];

// --- XLSX -----------------------------------------------------------------

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

const sharedStrings = ["id_externo", "nome", "cpf", "valor", "vencimento"];
for (const [externalId, name, document] of ROWS) {
  sharedStrings.push(externalId, name, document);
}

function indexOfString(value) {
  return sharedStrings.indexOf(value);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map((entry) => `<si><t>${escapeXml(entry)}</t></si>`).join("\n")}
</sst>`;

// Style 1 points at numFmtId 14, the built-in short date.
const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs>
</styleSheet>`;

const dataRows = ROWS.map(([externalId, name, document, amount, dueDate], index) => {
  const row = index + 2;
  return (
    `<row r="${row}">` +
    `<c r="A${row}" t="s"><v>${indexOfString(externalId)}</v></c>` +
    `<c r="B${row}" t="s"><v>${indexOfString(name)}</v></c>` +
    `<c r="C${row}" t="s"><v>${indexOfString(document)}</v></c>` +
    `<c r="D${row}"><v>${amount}</v></c>` +
    `<c r="E${row}" s="1"><v>${excelSerial(dueDate)}</v></c>` +
    `</row>`
  );
}).join("\n");

const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
${dataRows}
</sheetData></worksheet>`;

writeFileSync(
  `${outputDirectory}carteira-demo.xlsx`,
  zip([
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="carteira" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml],
    ["xl/sharedStrings.xml", sharedStringsXml],
    ["xl/styles.xml", stylesXml],
  ]),
);

console.log("fixtures/demo/carteira-demo.xlsx");
for (const [externalId, name, document] of ROWS) {
  console.log(`  ${externalId}  ${name}  ${document}`);
}
