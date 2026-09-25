export interface Mount {
  id: string;
  label: string;
  noun: string;
  sprite?: string;
  aspect?: number;
  pale?: boolean;
  restricted?: boolean;
}

export const CHOCOBO_COLORS: Mount[] = [
  { id: "yellow", label: "Yellow", noun: "chocobo" },
  { id: "red", label: "Red", noun: "chocobo" },
  { id: "blue", label: "Blue", noun: "chocobo" },
  { id: "green", label: "Green", noun: "chocobo" },
  { id: "black", label: "Black", noun: "chocobo" },
  { id: "gold", label: "Gold", noun: "chocobo" },
  {
    id: "fox",
    label: "White fox",
    noun: "",
    sprite: "/fox-white.png",
    aspect: 470 / 220,
    pale: true,
    restricted: true,
  },
  { id: "miku", label: "Miku", noun: "", sprite: "/miku.png", aspect: 288 / 320, restricted: true },
  { id: "berry", label: "Blueberry", noun: "", sprite: "/berry.png", aspect: 420 / 380, restricted: true },
  { id: "joker", label: "Joker", noun: "", sprite: "/joker.png", aspect: 566 / 542, restricted: true },
  { id: "piper", label: "Pied Piper", noun: "", sprite: "/piper.png", aspect: 296 / 368, restricted: true },
  { id: "boba", label: "Boba Fett", noun: "", sprite: "/boba.png", aspect: 833 / 598, restricted: true },
  { id: "invader", label: "Invader", noun: "", sprite: "/invader.png", aspect: 440 / 320, restricted: true },
  { id: "kirby", label: "Chef Kirby", noun: "", sprite: "/kirby.png", aspect: 34 / 41, restricted: true },
  { id: "tarnished", label: "Tarnished", noun: "", sprite: "/tarnished.png", aspect: 1092 / 1300, restricted: true },
];

export const DEFAULT_COLOR = "yellow";

export function availableMounts(unlocks: string[] = []): Mount[] {
  return CHOCOBO_COLORS.filter((c) => !c.restricted || unlocks.includes(c.id));
}

const preset = (id: string | undefined) => CHOCOBO_COLORS.find((c) => c.id === id);

export function isPresetColor(id: string | undefined): boolean {
  return Boolean(preset(id));
}

export function isCustomColor(color: string | undefined): boolean {
  return /^#[0-9a-f]{6}$/i.test(color ?? "");
}

export function normalizeColor(color: string | undefined): string {
  if (color && isPresetColor(color)) return color;
  if (color && isCustomColor(color)) return color.toLowerCase();
  return DEFAULT_COLOR;
}

export function presetSprite(id: string): string {
  return preset(id)?.sprite ?? `/chocobo-${isPresetColor(id) ? id : DEFAULT_COLOR}.png`;
}

export function needsOutline(id: string): boolean {
  return Boolean(preset(id)?.pale);
}

export function mountAspect(id: string): number {
  return preset(id)?.aspect ?? 1;
}

export function colorLabel(color: string | undefined): string {
  if (color && isCustomColor(color)) return `Custom (${color.toUpperCase()})`;
  return preset(color)?.label ?? "Yellow";
}

export function mountLabel(color: string | undefined): string {
  if (isCustomColor(color)) return `${colorLabel(color)} chocobo`;
  const entry = preset(color) ?? preset(DEFAULT_COLOR)!;
  return entry.noun ? `${entry.label} ${entry.noun}` : entry.label;
}
