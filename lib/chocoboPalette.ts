export type RGB = [number, number, number];

export interface Palette {
  body: RGB;
  hilite: RGB;
  shade1: RGB;
  shade2: RGB;
}

export const FEATHER: Palette = {
  body: [251, 192, 0],
  hilite: [240, 227, 0],
  shade1: [138, 91, 35],
  shade2: [131, 99, 61],
};

export function hexToRgb(hex: string | null | undefined): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function derivePalette(hex: string): Palette {
  const rgb = hexToRgb(hex);
  if (!rgb) return FEATHER;
  const [h, s, l] = rgbToHsl(rgb);
  const base = clamp(l, 0.26, 0.72);
  return {
    body: hslToRgb([h, s, base]),
    hilite: hslToRgb([h + 12, clamp(s * 0.95, 0, 1), clamp(base + 0.22, 0, 0.92)]),
    shade1: hslToRgb([h - 10, clamp(s * 1.05, 0, 1), clamp(base * 0.45, 0.06, 1)]),
    shade2: hslToRgb([h - 6, clamp(s * 0.95, 0, 1), clamp(base * 0.68, 0.1, 1)]),
  };
}
