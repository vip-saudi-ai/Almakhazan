// QR labels as a PDF — the file a phone hands to the Share Sheet.
//
// A printed QR fails for two reasons: blurred module edges and a missing quiet
// zone. So the code is drawn here as vector rectangles (sharp at any printer
// resolution) with the full four-module quiet zone the standard asks for,
// never as a resampled picture. The words beside it — often Arabic, which a
// bare PDF cannot shape without an embedded font — arrive already drawn, as a
// high-resolution JPEG the caller rendered. Nothing in this module touches the
// DOM, so it runs the same in a test.

export const LABEL_PDF_LAYOUT = Object.freeze({
  pageWidth: 595.28,   // A4, in points
  pageHeight: 841.89,
  margin: 28.35,       // 10 mm
  gap: 17,             // 6 mm
  columns: 2,
  labelHeight: 108,
  padding: 8,
  qrSide: 92,          // the symbol plus its quiet zone
  quietModules: 4,
});

/** Where the text image goes and how big it must be drawn, in points. */
export function labelTextBox(layout = LABEL_PDF_LAYOUT) {
  const width = labelWidth(layout) - layout.qrSide - layout.padding * 3;
  const height = layout.labelHeight - layout.padding * 2;
  return { width, height };
}

function labelWidth(layout) {
  return (layout.pageWidth - layout.margin * 2 - layout.gap * (layout.columns - 1)) / layout.columns;
}

export function labelsPerPage(layout = LABEL_PDF_LAYOUT) {
  const rows = Math.floor((layout.pageHeight - layout.margin * 2 + layout.gap) / (layout.labelHeight + layout.gap));
  return rows * layout.columns;
}

const num = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Dark modules as rectangles, one per horizontal run to keep the file small. */
function qrOps(code, x, y, side, quiet) {
  const modules = code.size + quiet * 2;
  const unit = side / modules;
  const parts = ['0 g'];
  for (let row = 0; row < code.size; row++) {
    let col = 0;
    while (col < code.size) {
      if (!code.cells[row][col]) { col++; continue; }
      let end = col;
      while (end < code.size && code.cells[row][end]) end++;
      const left = x + (col + quiet) * unit;
      const top = y + side - (row + quiet) * unit;
      parts.push(`${num(left)} ${num(top - unit)} ${num((end - col) * unit)} ${num(unit)} re`);
      col = end;
    }
  }
  parts.push('f');
  return parts.join('\n');
}

class Bytes {
  constructor() { this.chunks = []; this.length = 0; }
  text(value) { this.raw(new TextEncoder().encode(value)); }
  raw(bytes) { this.chunks.push(bytes); this.length += bytes.length; }
  build() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  }
}

/**
 * @param {Array<{code:{size:number,cells:boolean[][]}, text?:{jpeg:Uint8Array,width:number,height:number}}>} labels
 * @param {{rtl?:boolean, mono?:boolean, layout?:object}} options
 * @returns {Uint8Array} the PDF file
 */
export function buildLabelsPdf(labels, { rtl = false, mono = false, layout = LABEL_PDF_LAYOUT } = {}) {
  if (!labels.length) throw new Error('no labels');
  const perPage = labelsPerPage(layout);
  const width = labelWidth(layout);
  const box = labelTextBox(layout);
  const pages = [];
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));

  // Object numbers: 1 catalog, 2 page tree, then for each page: page, content,
  // and one image per label that has text.
  const objects = [];
  const reserve = () => objects.push(null);
  reserve(); reserve();
  const pageRefs = [];

  for (const page of pages) {
    const pageNo = objects.length + 1; reserve();
    const contentNo = objects.length + 1; reserve();
    pageRefs.push(pageNo);
    const images = [];
    const ops = [];
    page.forEach((label, index) => {
      const col = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      // Right-to-left sheets fill from the right, like the screen does.
      const visualCol = rtl ? layout.columns - 1 - col : col;
      const x = layout.margin + visualCol * (width + layout.gap);
      const y = layout.pageHeight - layout.margin - (row + 1) * layout.labelHeight - row * layout.gap;

      ops.push(`${mono ? '0 G' : '0.8 0.84 0.9 RG'} 0.75 w ${num(x)} ${num(y)} ${num(width)} ${num(layout.labelHeight)} re S`);
      const qrX = rtl ? x + width - layout.padding - layout.qrSide : x + layout.padding;
      const qrY = y + (layout.labelHeight - layout.qrSide) / 2;
      ops.push(qrOps(label.code, qrX, qrY, layout.qrSide, layout.quietModules));

      if (label.text?.jpeg?.length) {
        const imageNo = objects.length + 1; reserve();
        const name = `Im${images.length + 1}`;
        images.push({ name, imageNo, text: label.text });
        const textX = rtl ? x + layout.padding : x + layout.padding * 2 + layout.qrSide;
        const textY = y + layout.padding;
        ops.push(`q ${num(box.width)} 0 0 ${num(box.height)} ${num(textX)} ${num(textY)} cm /${name} Do Q`);
      }
    });
    const xobjects = images.map((img) => `/${img.name} ${img.imageNo} 0 R`).join(' ');
    objects[pageNo - 1] = {
      dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(layout.pageWidth)} ${num(layout.pageHeight)}] `
        + `/Resources << /XObject << ${xobjects} >> >> /Contents ${contentNo} 0 R >>`,
    };
    objects[contentNo - 1] = { stream: new TextEncoder().encode(ops.join('\n')), dict: '' };
    for (const img of images) {
      objects[img.imageNo - 1] = {
        dict: `/Type /XObject /Subtype /Image /Width ${img.text.width} /Height ${img.text.height} `
          + '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
        stream: img.text.jpeg,
      };
    }
  }
  objects[0] = { dict: '<< /Type /Catalog /Pages 2 0 R >>' };
  objects[1] = { dict: `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>` };

  const out = new Bytes();
  out.text('%PDF-1.4\n');
  out.raw(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out.text(`${index + 1} 0 obj\n`);
    if (object.stream) {
      out.text(`<< ${object.dict} /Length ${object.stream.length} >>\nstream\n`);
      out.raw(object.stream);
      out.text('\nendstream\n');
    } else {
      out.text(`${object.dict}\n`);
    }
    out.text('endobj\n');
  });
  const xref = out.length;
  out.text(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) out.text(`${String(offset).padStart(10, '0')} 00000 n \n`);
  out.text(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return out.build();
}
