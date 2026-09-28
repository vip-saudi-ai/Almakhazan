// A fake camera for Chromium: a Y4M video of a QR code, which Chromium plays
// through getUserMedia when launched with
//   --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file>
// so the live scanning path (camera → frame loop → decoder) runs for real.
//
// Y4M 4:2:0 is a header, then per frame "FRAME\n" + the Y plane + the U and V
// planes at quarter size. A black-and-white code needs only luminance; the
// chroma planes are neutral (128).

import { writeFileSync } from 'node:fs';
import { encodeQr } from '../../src/qr.js';

export function writeQrY4m(text, path, { width = 640, height = 480, frames = 10 } = {}) {
  const code = encodeQr(text);
  const quiet = 4;
  const modules = code.size + quiet * 2;
  const unit = Math.floor((Math.min(width, height) * 0.7) / modules);
  const side = modules * unit;
  const x0 = Math.floor((width - side) / 2);
  const y0 = Math.floor((height - side) / 2);

  const y = Buffer.alloc(width * height, 200);          // light grey surround
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      const mx = Math.floor(col / unit) - quiet;
      const my = Math.floor(row / unit) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < code.size && my < code.size && code.cells[my][mx];
      y[(y0 + row) * width + (x0 + col)] = dark ? 16 : 235;
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: frames }, () => frame)]));
  return path;
}
