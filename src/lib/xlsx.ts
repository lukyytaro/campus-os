/**
 * Export .xlsx sungguhan tanpa dependensi (m1).
 *
 * File .xlsx adalah arsip ZIP berisi dokumen XML. Writer ini membangun
 * ZIP "stored" (tanpa kompresi) secara manual — cukup CRC32 + header
 * lokal/sentral — sehingga tidak perlu library spreadsheet tambahan.
 * Teks ditulis sebagai inline string, angka sebagai sel numerik.
 * Hasilnya dibuka rapi oleh Excel, LibreOffice, dan Google Sheets.
 */

/* ------------------------------------------------------------------ */
/* CRC32 (polinomial IEEE 802.3)                                       */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */
/* ZIP "stored" minimal                                                */
/* ------------------------------------------------------------------ */

const encoder = new TextEncoder();

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function dosDateTime(date: Date): { date: number; time: number } {
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { date: dosDate, time: dosTime };
}

/** Gabung beberapa entri menjadi satu arsip ZIP (metode stored). */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = dosDateTime(new Date());

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header (30 byte + nama).
    const local = new DataView(new ArrayBuffer(30 + nameBytes.length));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versi minimum
    local.setUint16(6, 0x0800, true); // flag: nama UTF-8
    local.setUint16(8, 0, true); // metode stored
    local.setUint16(10, now.time, true);
    local.setUint16(12, now.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    new Uint8Array(local.buffer).set(nameBytes, 30);
    const localBytes = new Uint8Array(local.buffer);
    chunks.push(localBytes, entry.data);

    // Central directory header (46 byte + nama).
    const dir = new DataView(new ArrayBuffer(46 + nameBytes.length));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, now.time, true);
    dir.setUint16(14, now.date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    new Uint8Array(dir.buffer).set(nameBytes, 46);
    central.push(new Uint8Array(dir.buffer));

    offset += localBytes.length + size;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of [...chunks, ...central, new Uint8Array(eocd.buffer)]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Dokumen XML .xlsx                                                   */
/* ------------------------------------------------------------------ */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "A1", "B2", ... dari indeks kolom (0-based) dan baris (1-based). */
function cellRef(col: number, row: number): string {
  let name = "";
  let n = col;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${name}${row}`;
}

type XlsxValue = string | number | null | undefined;

function sheetXml(
  headers: string[],
  rows: XlsxValue[][],
): string {
  const allRows = [headers, ...rows];
  const body = allRows
    .map((row, rowIdx) => {
      const cells = row
        .map((value, colIdx) => {
          const ref = cellRef(colIdx, rowIdx + 1);
          if (value === null || value === undefined || value === "") {
            return `<c r="${ref}"/>`;
          }
          if (typeof value === "number") {
            return `<c r="${ref}" t="n"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join("");
      // Baris pertama (header) memakai style tebal (s="1").
      return `<row r="${rowIdx + 1}"${rowIdx === 0 ? ' s="1" customFormat="1"' : ""}>${cells}</row>`;
    })
    .join("");
  const lastCol = cellRef(Math.max(0, headers.length - 1), 1).replace(/[0-9]/g, "");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${allRows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="18" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Style 0 = default; style 1 = tebal (untuk baris header).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

/** Bangun file .xlsx sebagai byte (dipakai juga oleh pengujian). */
export function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: XlsxValue[][],
): Uint8Array {
  return buildZip([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(WORKBOOK_RELS) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml(headers, rows)) },
    { name: "xl/styles.xml", data: encoder.encode(STYLES) },
  ]);
}

/** Unduh tabel sebagai file .xlsx lewat browser. */
export function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: XlsxValue[][],
): void {
  const bytes = buildXlsx(sheetName, headers, rows);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
