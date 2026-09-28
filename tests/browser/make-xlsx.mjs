// Builds a real .xlsx inside the page.
//
// Measuring how the XLSX reader behaves on a large workbook needs a large
// workbook, and shipping one over the wire would measure the network instead.
// This writes a genuine deflated ZIP with a shared-string table — the part of
// the format that actually costs memory — so the reader is exercised on the
// same shape a real export has.

const encode = (text) => new TextEncoder().encode(text);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A ZIP with a central directory, which is what the reader reads. */
async function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encode(file.name);
    const raw = encode(file.text);
    const data = await deflateRaw(raw);
    const crc = crc32(raw);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);           // deflate
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);

    parts.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }

  const directorySize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end]);
}

const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/**
 * @param {number} rowCount data rows, not counting the header
 * @returns {Promise<File>} a workbook of five columns: name, quantity,
 *   category, code, price — two distinct shared strings per row, which is the
 *   worst realistic case for the string table.
 */
export async function makeXlsx(rowCount) {
  const strings = ['الاسم', 'الكمية', 'التصنيف', 'الرمز', 'السعر', 'ساعات'];
  const sheet = [`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN}"><sheetData>`];

  sheet.push('<row r="1">'
    + [0, 1, 2, 3, 4].map((i, n) => `<c r="${'ABCDE'[n]}1" t="s"><v>${i}</v></c>`).join('')
    + '</row>');

  for (let i = 0; i < rowCount; i += 1) {
    const r = i + 2;
    const name = strings.push(`قطعة رقم ${i}`) - 1;
    const code = strings.push(`INV-${String(i).padStart(6, '0')}`) - 1;
    sheet.push(
      `<row r="${r}">`
      + `<c r="A${r}" t="s"><v>${name}</v></c>`
      + `<c r="B${r}"><v>1</v></c>`
      + `<c r="C${r}" t="s"><v>5</v></c>`
      + `<c r="D${r}" t="s"><v>${code}</v></c>`
      + `<c r="E${r}"><v>${1000 + i}</v></c>`
      + '</row>',
    );
  }
  sheet.push('</sheetData></worksheet>');

  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">`
    + strings.map((text) => `<si><t>${text}</t></si>`).join('')
    + '</sst>';

  const file = await zip([
    {
      name: '[Content_Types].xml',
      text: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    },
    {
      name: 'xl/workbook.xml',
      text: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${MAIN}" xmlns:r="${RELS}"><sheets><sheet name="الجرد" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    { name: 'xl/sharedStrings.xml', text: sharedStrings },
    { name: 'xl/worksheets/sheet1.xml', text: sheet.join('') },
  ]);

  return new File([file], `جرد-${rowCount}.xlsx`, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
