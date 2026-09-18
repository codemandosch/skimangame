export const LENGTH = 1180;
export const WIDTH = 35;
export const centerAt = (s) => Math.sin(s * 0.006) * 5;
export const baseHeight = (s) => 180 - s * 0.265 + Math.sin(s * 0.012) * 1.5;
export const JUMPS = [
  {
    lip: 115,
    height: 6,
    length: 25,
    width: 12,
    name: "FIRST FLIGHT",
    kick: 10.5,
  },
  {
    lip: 315,
    height: 8,
    length: 30,
    width: 13,
    name: "THE STEPOVER",
    kick: 12.5,
  },
  { lip: 535, height: 9, length: 32, width: 13, name: "CLOUD NINE", kick: 14 },
  {
    lip: 760,
    height: 10,
    length: 34,
    width: 14,
    name: "HIGH SOCIETY",
    kick: 15,
  },
  { lip: 995, height: 12, length: 38, width: 15, name: "LAST SEND", kick: 17 },
].map((j, i) => ({ ...j, x: centerAt(j.lip), index: i }));

export function rampAt(x, s) {
  return JUMPS.find(
    (j) =>
      s >= j.lip - j.length && s <= j.lip + 14 && Math.abs(x - j.x) < j.width,
  );
}

export function groundHeight(x, s) {
  const lateral = Math.abs(x - centerAt(s));
  const bank = Math.max(0, lateral - WIDTH);
  let y = baseHeight(s) + Math.min(bank * bank * 0.018, bank * 0.5);
  for (const j of JUMPS) {
    if (s < j.lip - j.length || s > j.lip + 14) continue;
    const edge = Math.max(0, Math.min(1, (j.width - Math.abs(x - j.x)) / 2.5));
    const t = (s - (j.lip - j.length)) / j.length;
    const shape = s <= j.lip ? t * t : Math.max(0, 1 - (s - j.lip) / 14);
    y += j.height * shape * edge;
  }
  return y;
}

export function sceneryHeight(x, s) {
  const edge = Math.max(0, Math.abs(x - centerAt(s)) - 48);
  const ridges =
    (Math.sin(s * 0.009 + x * 0.007) * 0.5 + 0.5) * 0.65 +
    (Math.sin(s * 0.022 - x * 0.013) * 0.5 + 0.5) * 0.35;
  const peaks = Math.pow(ridges, 1.5);
  if (edge === 0) return groundHeight(x, s);
  const bank = Math.min(groundHeight(x, s) - baseHeight(s), 13);
  const mountain = Math.max(0, edge - 65);
  return (
    baseHeight(s) +
    bank +
    edge * 0.09 +
    mountain * (0.25 + peaks * 0.8) +
    Math.sin(x * 0.065 + s * 0.032) * Math.min(mountain * 0.025, 7)
  );
}
