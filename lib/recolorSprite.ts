"use client";

import { FEATHER, derivePalette, type RGB } from "./chocoboPalette";

const cache = new Map<string, string>();
let basePromise: Promise<HTMLImageElement> | null = null;

function loadBase(): Promise<HTMLImageElement> {
  if (!basePromise) {
    basePromise = new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "/chocobo.png";
    });
  }
  return basePromise;
}

const key = (rgb: RGB) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

export async function customSprite(hex: string): Promise<string> {
  const cached = cache.get(hex);
  if (cached) return cached;

  const base = await loadBase();
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(base, 0, 0);

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const palette = derivePalette(hex);
  const swap = new Map([
    [key(FEATHER.body), palette.body],
    [key(FEATHER.hilite), palette.hilite],
    [key(FEATHER.shade1), palette.shade1],
    [key(FEATHER.shade2), palette.shade2],
  ]);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const next = swap.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (next) {
      data[i] = next[0];
      data[i + 1] = next[1];
      data[i + 2] = next[2];
    }
  }
  ctx.putImageData(frame, 0, 0);

  const url = canvas.toDataURL("image/png");
  cache.set(hex, url);
  return url;
}
