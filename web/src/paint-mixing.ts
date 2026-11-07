export type PaintCandidate = { paintId: string; color: number[] };
export type PaintComponent = { paintId: string; proportion: number };
export type PaintMatch = { components: PaintComponent[]; washStrength: number; distance: number };

export const mixColors = (colors: number[][], weights: number[]): number[] => {
  if (colors.length === 1) return [...colors[0]];
  return colors[0].map((_, channel) => Math.round(255 * colors.reduce(
    (product, color, index) => product * (Math.max(1, color[channel]) / 255) ** weights[index], 1,
  )));
};

export const bestWashMatch = (target: number[], pigmentColor: number[], valueShade = 1) => {
  const paper = [246, 243, 233];
  const shadedPaper = paper.map((channel) => channel * valueShade);
  const delta = pigmentColor.map((channel, index) => (channel - paper[index]) * valueShade);
  const denominator = delta.reduce((sum, channel) => sum + channel * channel, 0) || 1;
  const projected = target.reduce((sum, channel, index) => sum + (channel - shadedPaper[index]) * delta[index], 0) / denominator;
  const washStrength = Math.max(5, Math.min(100, Math.round(projected * 20) * 5));
  const distance = shadedPaper.reduce((sum, channel, index) => sum + (channel + delta[index] * washStrength / 100 - target[index]) ** 2, 0);
  return { strength: washStrength / 100, washStrength, distance };
};

export const findPaintMatch = (target: number[], palette: PaintCandidate[], valueShade = 1): PaintMatch => {
  if (!palette.length) throw new Error("At least one paint is required.");
  let best: PaintMatch = { components: [], washStrength: 100, distance: Infinity };
  const consider = (paints: PaintCandidate[], weights: number[]) => {
    const color = mixColors(paints.map((paint) => paint.color), weights);
    const match = bestWashMatch(target, color, valueShade);
    if (match.distance < best.distance - 1e-8) {
      best = { components: paints.map((paint, i) => ({ paintId: paint.paintId, proportion: weights[i] })), washStrength: match.washStrength, distance: match.distance };
    }
  };
  for (const paint of palette) consider([paint], [1]);
  const shortlist = [...palette].sort((a, b) => {
    const distance = (paint: PaintCandidate) => paint.color.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
    return distance(a) - distance(b) || a.paintId.localeCompare(b.paintId);
  }).slice(0, 18);
  for (let i = 0; i < shortlist.length; i++) for (let j = i + 1; j < shortlist.length; j++) {
    for (let a = 1; a < 10; a++) consider([shortlist[i], shortlist[j]], [a / 10, (10 - a) / 10]);
  }
  const triple = shortlist.slice(0, 6);
  for (let i = 0; i < triple.length; i++) for (let j = i + 1; j < triple.length; j++) for (let k = j + 1; k < triple.length; k++) {
    for (let a = 1; a < 9; a++) for (let b = 1; b < 10 - a; b++) {
      consider([triple[i], triple[j], triple[k]], [a / 10, b / 10, (10 - a - b) / 10]);
    }
  }
  return best;
};
