// The NAZM symbol, as numbers.
//
// Direction 04: a rounded frame that holds an N whose right stem is the frame
// itself. The blade leaves the apex, is cut vertically at its foot, and opens a
// notch against the stem on its way down — that notch is what keeps the mark
// from reading as a slashed box.
//
// This module is the only definition. tools/build-brand.mjs writes the files
// from it and src/views/mark.js draws from it at runtime, so a change here
// moves every asset at once.

export const SYMBOL = {
  size: 96,
  /** Everyday use. */
  regular: {
    ringStroke: 9.5,
    ringRadius: 25,
    stemX: 33,
    stemWidth: 13,
    bladeWidth: 15,
    apexY: 33.5,
    cutX: 75,
    aim: [70, 88],
    baseY: 96,
  },
  /** Below ~24px: heavier strokes, tighter radius, so the counter survives. */
  small: {
    ringStroke: 11,
    ringRadius: 22,
    stemX: 33,
    stemWidth: 14.5,
    bladeWidth: 16.5,
    apexY: 31,
    cutX: 76,
    aim: [70, 88],
    baseY: 96,
  },
};

/** The size at or below which the small variant should be used. */
export const SMALL_BELOW = 26;

export function symbolPaths(variant = 'regular') {
  const g = SYMBOL[variant] || SYMBOL.regular;
  const S = SYMBOL.size;
  const h = g.stemWidth / 2;
  const bh = g.bladeWidth / 2;

  const dx = g.aim[0] - g.stemX;
  const dy = g.aim[1] - g.apexY;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const nx = uy;
  const ny = -ux;

  const upper = [g.stemX + nx * bh, g.apexY + ny * bh];
  const lower = [g.stemX - nx * bh, g.apexY - ny * bh];
  const alongX = (p, x) => { const t = (x - p[0]) / ux; return [x, p[1] + uy * t]; };
  const alongY = (p, y) => { const t = (y - p[1]) / uy; return [p[0] + ux * t, y]; };

  const cut = alongX(upper, g.cutX);
  const footLeft = alongY(lower, g.baseY);
  const stemMeet = alongX(lower, g.stemX + h);
  const n = (v) => v.toFixed(2);

  const blade = [
    `M${n(g.stemX - h)} ${n(g.baseY)}`,
    `L${n(g.stemX - h)} ${n(g.apexY)}`,
    `A${n(h)} ${n(bh)} 0 0 1 ${n(upper[0])} ${n(upper[1])}`,
    `L${n(cut[0])} ${n(cut[1])}`,
    `L${n(g.cutX)} ${n(g.baseY)}`,
    `L${n(footLeft[0])} ${n(g.baseY)}`,
    `L${n(stemMeet[0])} ${n(stemMeet[1])}`,
    `L${n(g.stemX + h)} ${n(g.baseY)}`,
    'Z',
  ].join(' ');

  return {
    ring: {
      x: g.ringStroke / 2,
      y: g.ringStroke / 2,
      size: S - g.ringStroke,
      rx: g.ringRadius,
      strokeWidth: g.ringStroke,
    },
    blade,
  };
}
