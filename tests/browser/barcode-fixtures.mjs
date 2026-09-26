// Barcode images for the scanner tests, drawn in the page so no binary
// fixtures live in the repository: a QR code from the app's own encoder and
// an EAN-13 from the standard's encoding tables.

/** Page function: returns a PNG data URL of `text` as a QR code. */
export const drawQr = async (text) => {
  const { encodeQr } = await import('/src/qr.js');
  const code = encodeQr(text);
  const unit = 8;
  const quiet = 4;
  const size = (code.size + quiet * 2) * unit;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let y = 0; y < code.size; y += 1) {
    for (let x = 0; x < code.size; x += 1) if (code.cells[y][x]) ctx.fillRect((x + quiet) * unit, (y + quiet) * unit, unit, unit);
  }
  return canvas.toDataURL('image/png');
};

/** Page function: returns a PNG data URL of a 13-digit EAN-13 barcode. */
export const drawEan13 = (digits) => {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const d = digits.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i += 1) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i += 1) bits += R[d[i]];
  bits += '101';
  const unit = 4;
  const quiet = 12;
  const canvas = Object.assign(document.createElement('canvas'), { width: (bits.length + quiet * 2) * unit, height: 260 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  [...bits].forEach((bit, i) => { if (bit === '1') ctx.fillRect((i + quiet) * unit, 20, unit, 220); });
  return canvas.toDataURL('image/png');
};

/** Writes a data URL to a file Playwright can hand to an <input type=file>. */
export async function dataUrlFile(dataUrl, path) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return path;
}
