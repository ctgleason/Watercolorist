export type PaintBrandId = "daniel-smith" | "winsor-newton" | "qor";

export type PaintCatalogEntry = {
  id: string;
  brand: PaintBrandId;
  brandName: string;
  lineName: string;
  name: string;
  productCode?: string;
  pigments?: string[];
  opacity?: string;
  staining?: string;
  granulation?: string;
  lab?: { l: number; a: number; b: number };
  permanenceGrade?: "AA" | "A" | "B";
  series?: number;
  astmLightfastness?: "I" | "II";
};

import { danielSmithLabData } from "./daniel-smith-lab-data";
import { qorPigmentData } from "./qor-pigment-data";
import { winsorNewtonTechnicalData } from "./winsor-newton-data";

const winsorNewtonNameAliases: Record<string, string> = {
  "Viridian": "Viridian Hue",
  "Titanium White": "Titanium White (Opaque White)",
};

const normalizePaintName = (name: string) => name
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const paintBrandOptions: {
  id: PaintBrandId;
  label: string;
  line: string;
  source: string;
  technicalSource?: string;
}[] = [
  {
    id: "daniel-smith",
    label: "DANIEL SMITH",
    line: "Extra Fine Watercolors",
    source: "https://danielsmith.com/swatch-gallery/extra-fine-watercolors-15ml/",
    technicalSource: "https://danielsmith.com/daniel-smith-watercolors-cie-lab-coordinates/",
  },
  {
    id: "winsor-newton",
    label: "Winsor & Newton",
    line: "Professional Watercolour",
    source: "https://www.winsornewton.com/collections/professional-watercolour",
    technicalSource: "https://colart.s3.amazonaws.com/assetfiles/feb01979-cf02-408d-964a-6a8094d5eeb8.pdf",
  },
  {
    id: "qor",
    label: "QoR · GOLDEN",
    line: "Artist Watercolors",
    source: "https://goldenartistcolors.com/products/qor-artist-watercolors/watercolors",
    technicalSource: "https://goldenartistcolors.com/products/qor-artist-watercolors/watercolors/pigment-data",
  },
];

const catalogNames: Record<PaintBrandId, string> = {
  "daniel-smith": `Buff Titanium
Nickel Titanate Yellow
Bismuth Vanadate Yellow
Hansa Yellow Light
Azo Yellow
Quinophthalone Yellow
Cadmium Yellow Light Hue
Cadmium Yellow Medium Hue
Aureolin – Cobalt Yellow
Cadmium Yellow Deep Hue
Hansa Yellow Medium
Mayan Yellow
Lemon Yellow
Indian Yellow
Jaune Brilliant No 1
Naples Yellow
Jaune Brilliant No 2
Hansa Yellow Deep
New Gamboge
Isoindoline Yellow
Permanent Yellow Deep
Aussie Red Gold
Pyrrol Orange
Permanent Orange
Cadmium Orange Hue
Perinone Orange
Cadmium Red Scarlet Hue
Transparent Pyrrol Orange
Organic Vermilion
Mayan Orange
Quinacridone Coral
Pyrrol Scarlet
Perylene Scarlet
Anthraquinoid Scarlet
Cadmium Red Medium Hue
Pyrrol Red
Perylene Red
Permanent Red
Permanent Red Deep
Quinacridone Red
Anthraquinoid Red
Mayan Red
Alizarin Crimson
Permanent Alizarin Crimson
Rhodonite Genuine
Carmine
Rose Madder Permanent
Opera Pink
Potter’s Pink
Quinacridone Pink
Quinacridone Rose
Quinacridone Lilac
Quinacridone Magenta
Pyrrol Crimson
Quinacridone Fuchsia
Mayan Violet
Bordeaux
Permanent Violet
Quinacridone Violet
Perylene Violet
Cobalt Violet
Cobalt Violet Deep
Wisteria
Ultramarine Red
Rose of Ultramarine
Quinacridone Purple
Imperial Purple
Ultramarine Violet
Manganese Violet
Carbazole Violet
Cobalt Blue Violet
Moonglow
Shadow Violet
Indigo
Mayan Dark Blue
Indanthrone Blue
French Ultramarine
Ultramarine Blue
Cobalt Blue
Phthalo Blue (Green Shade)
Lavender
King’s Royal Blue
Verditer Blue
Phthalo Blue (Red Shade)
Prussian Blue
Cerulean Blue
Cerulean Blue Chromium
Manganese Blue Hue
Phthalo Blue Turquoise
Cobalt Teal Blue
Phthalo Turquoise
Ultramarine Turquoise
Cobalt Turquoise
Lunar Blue
Cobalt Green Pale
Cobalt Green Deep
Viridian
Phthalo Green (Blue Shade)
Cascade Green
Cobalt Green
Spring Green
Permanent Green Light
Phthalo Yellow Green
Permanent Green
Phthalo Green (Yellow Shade)
Hooker’s Green
Sap Green
Chromium Green Oxide
Terre Verte
Deep Sap Green
Perylene Green
Prussian Green
Rare Green Earth
Undersea Green
Olive Green
Green Gold
Rich Green Gold
Nickel Azo Yellow
Verona Gold Ochre
French Ochre
Raw Sienna Light
Burgundy Yellow Ochre
Chrome Titanate Yellow
Yellow Ochre
Mars Yellow
Raw Sienna
Transparent Yellow Oxide
Monte Amiata Natural Sienna
Enviro-Friendly Red Iron Oxide
Goethite (Brown Ochre)
Quinacridone Deep Gold
Italian Deep Ochre
Lunar Earth
Burnt Yellow Ochre
Roasted French Ochre
Burgundy Red Ochre
Indian Red
Venetian Red
Italian Burnt Sienna
Quinacridone Burnt Orange
Quinacridone Sienna
Pompeii Red
Terre Ercolano
Coral Reef
Earthy Light Red
Italian Venetian Red
English Red Earth
Quinacridone Burnt Scarlet
Perylene Maroon
Deep Scarlet
Naphthamide Maroon
Lunar Red Rock
German Greenish Raw Umber
Permanent Brown
Quinacridone Gold
Raw Umber Violet
Transparent Brown Oxide
Transparent Red Oxide
Fired Gold Ochre
Burnt Sienna Light
Enviro-Friendly Brown Iron Oxide
Burnt Sienna
English Red Ochre
Burnt Umber
Enviro-Friendly Yellow Iron Oxide
Raw Umber
Sepia
Van Dyck Brown
Lunar Violet
Neutral Tint
Graphite Gray
Jane’s Grey
Payne’s Blue Gray
Payne’s Gray
Alvaro’s Caliente Grey
Alvaro’s Fresco Grey
Joseph Z’s Warm Grey
Joseph Z’s Neutral Grey
Jane’s Black (Red/Green)
Joseph Z’s Cool Grey
McCracken Black
Jane’s Black (Blue/Orange)
Ivory Black
Lamp Black
Lunar Black
Gray Titanium
Chinese White
Titanium White`,
  "winsor-newton": `Lemon Yellow (Nickel Titanate)
Bismuth Yellow
Cadmium Lemon
Cadmium-Free Lemon
Winsor Lemon
Winsor Yellow
Lemon Yellow Deep
Aureolin Hue
Transparent Yellow
Cadmium Yellow Pale
Cadmium-Free Yellow Pale
Turner's Yellow
New Gamboge
Cadmium Yellow
Cadmium-Free Yellow
Winsor Yellow Deep
Indian Yellow
Cadmium Yellow Deep
Cadmium-Free Yellow Deep
Cadmium Orange
Cadmium-Free Orange
Winsor Orange
Winsor Orange (Red Shade)
Field's Orange
Transparent Orange
Cadmium Scarlet
Cadmium-Free Scarlet
Scarlet Lake
Cadmium Red
Cadmium-Free Red
Cadmium Red Deep
Cadmium-Free Red Deep
Winsor Red
Rose Dore
Quinacridone Red
Winsor Red Deep
Permanent Alizarin Crimson
Alizarin Crimson
Permanent Carmine
Permanent Rose
Rose Madder Genuine
Opera Rose
Quinacridone Magenta
Permanent Magenta
Cobalt Violet
Permanent Mauve
Quinacridone Violet
Tyrian Purple
Ultramarine Violet
Winsor Violet (Dioxazine)
Indanthrene Blue
Cobalt Blue Deep
French Ultramarine
Smalt (Dumont's Blue)
Ultramarine (Green Shade)
Cobalt Blue
Winsor Blue (Red Shade)
Antwerp Blue
Prussian Blue
Winsor Blue (Green Shade)
Cerulean Blue (Red Shade)
Cerulean Blue
Manganese Blue Hue
Phthalo Turquoise
Aqua Green
Cobalt Turquoise Light
Cobalt Turquoise
Cobalt Green Deep
Cobalt Green
Winsor Green (Blue Shade)
Viridian
Viridian Hue
Winsor Green (Yellow shade)
Cinnabar Green
Terre Verte
Perylene Green
Oxide of Chromium
Hooker's Green
Permanent Sap Green
Olive Green
Terre Verte (Yellow Shade)
Green Gold
Naples Yellow
Naples Yellow Deep
Yellow Ochre Light
Yellow Ochre
Raw Sienna
Gold Ochre
Transparent Gold Deep / Quinacridone Gold
Brown Ochre
Magnesium Brown
Burnt Sienna
Light Red
Venetian Red
Indian Red
Brown Madder
Potter's Pink
Perylene Maroon
Perylene Violet
Caput Mortuum Violet
Raw Umber
Burnt Umber
Vandyke Brown
Sepia
Indigo
Payne's Gray
Neutral Tint
Ivory Black
Lamp Black
Mars Black
Ostwald Grey
Davy's Gray
Mineral Grey
Ultramarine Ash
Chinese White
Titanium White (Opaque White)
Titanium White`,
  qor: `Nickel Yellow
Cadmium Yellow Primrose
Hansa Yellow Light
Bismuth Vanadate Yellow
Cadmium Yellow Light
Benzimidazolone Yellow
Cadmium Yellow Medium
Aureolin Modern
Nickel Azo Yellow
India Yellow
Permanent Gamboge
Cadmium Yellow Deep
Diarylide Yellow
Isoindolinone Yellow
Cadmium Orange
Pyrrole Orange
Transparent Pyrrole Orange
Disazo Scarlet
Cadmium Red Light
Permanent Scarlet
Pyrrole Red Light
Pyrrole Red Medium
Cadmium Red Medium
Cadmium Red Deep
Pyrrole Red Deep
Quinacridone Red
Permanent Alizarin Crimson
Quinacridone Magenta
Quinacridone Violet
Ultramarine Pink Dark
Ultramarine Violet
Dioxazine Purple
Ultramarine Blue
Ultramarine Blue Violet
Cobalt Blue
Cerulean Blue, Chromium
Phthalo Blue (Red Shade)
Indanthrone Blue
Prussian Blue
Indigo
Phthalo Blue (Green Shade)
French Cerulean Blue
Manganese Blue
Cobalt Teal
Cobalt Turquoise
Ultramarine Turquoise
Phthalo Turquoise
Phthalo Green (Blue Shade)
Viridian Green
Permanent Green Light
Cobalt Green
Hooker's Green
Olive Green
Sap Green
Terre Verte
Chromium Oxide Green
Bohemian Green Earth
Green Gold
Titan Buff
Naples Yellow
Naples Yellow Deep
Transparent Yellow Oxide
Yellow Ochre
Raw Sienna (Natural)
Transparent Red Oxide
Venetian Red
Benzimidazolone Burnt Orange
Burnt Sienna (Natural)
Perylene Crimson
Transparent Brown Oxide
Burnt Umber (Natural)
Van Dyke Brown
Raw Umber (Natural)
Brown Umber (Natural)
Sepia
Carbon Black
Ivory Black
Payne's Gray (Violet)
Payne's Gray
Perylene Violet
Cadmium Purple
Neutral Tint
Ardoise Gray
Chinese White
Titanium White
Iridescent Copper
Iridescent Gold (Fine)
Iridescent Pearl (Fine)
Iridescent Silver (Fine)
Interference Violet
Interference Red
Interference Blue
Interference Green
Interference Violet-Green Shift
Interference Green-Orange Shift
Interference Green-Blue Shift`,
};

const toIdPart = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const catalogEntries = paintBrandOptions.flatMap((brand) =>
  catalogNames[brand.id]
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      id: `${brand.id}:${toIdPart(name)}`,
      brand: brand.id,
      brandName: brand.label,
      lineName: brand.line,
      name,
    })),
);

export const paintCatalog: PaintCatalogEntry[] = [...new Map(
  catalogEntries.map((paint) => [paint.id, paint]),
).values()].map((paint) => {
  if (paint.brand === "qor") {
    const data = qorPigmentData.get(paint.name);
    return data ? { ...paint, ...data } : paint;
  }
  if (paint.brand === "daniel-smith") {
    const lab = [...danielSmithLabData].find(([name]) => normalizePaintName(name) === normalizePaintName(paint.name))?.[1];
    return lab ? { ...paint, lab } : paint;
  }
  if (paint.brand === "winsor-newton") {
    const dataName = winsorNewtonNameAliases[paint.name] ?? paint.name;
    const technical = [...winsorNewtonTechnicalData].find(
      ([name]) => normalizePaintName(name) === normalizePaintName(dataName),
    )?.[1];
    return technical ? { ...paint, ...technical } : paint;
  }
  return paint;
});
