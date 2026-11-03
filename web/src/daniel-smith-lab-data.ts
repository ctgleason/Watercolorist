export type LabCoordinate = { l: number; a: number; b: number };

const rows = `Buff Titanium|88|0.67|25.54
Nickel Titanate Yellow|94|-7.25|38.58
Bismuth Vanadate Yellow|92|-7.5|76.14
Hansa Yellow Light|92|-11.78|88.13
Azo Yellow|91|-3.05|80.31
Quinophthalone Yellow|90|-4.1|86.5
Cadmium Yellow Light Hue|92|-8.29|89
Cadmium Yellow Medium Hue|88|5.93|82.45
Aureolin (Cobalt Yellow)|89|-3.62|83.24
Cadmium Yellow Deep Hue|81|25.2|86.2
Hansa Yellow Medium|88|3.19|99.59
Mayan Yellow|88|2.12|79.63
Lemon Yellow|92|-8.37|83.01
Indian Yellow|84|8.33|86.92
Jaune Brilliant No 1|91|3.2|29.9
Naples Yellow|84|7.61|45.61
Jaune Brilliant No 2|87|13.2|31
Hansa Yellow Deep|81|23.71|79.48
New Gamboge|85|11.61|77.33
Isoindoline Yellow|75|38.66|77.08`;

export const danielSmithLabData = new Map<string, LabCoordinate>(
  rows.split("\n").map((row) => {
    const [name, l, a, b] = row.split("|");
    return [name, { l: Number(l), a: Number(a), b: Number(b) }];
  }),
);
