export type PaintTechnicalData = {
  productCode: string;
  pigments: string[];
  opacity: string;
  staining: string;
  granulation: string;
};

const rows = `Nickel Yellow|7000100|PY53|semi-opaque|NA|-
Cadmium Yellow Primrose|7000105|PY35|semi-transparent|Staining|-
Hansa Yellow Light|7000110|PY3|semi-transparent|Semi-Staining|-
Bismuth Vanadate Yellow|7000115|PY184|semi-transparent|Semi-Staining|-
Cadmium Yellow Light|7000120|PY35|semi-transparent|Staining|-
Benzimidazolone Yellow|7000126|PY154|semi-transparent|Semi-Staining|-
Cadmium Yellow Medium|7000130|PY35|semi-transparent|Staining|-
Aureolin Modern|7000135|PW6, PY150|semi-opaque|NA|-
Nickel Azo Yellow|7000140|PY150|transparent|Staining|-
India Yellow|7000146|PY154, PY150, PR206|semi-transparent|Staining|-
Permanent Gamboge|7000150|PY150, PY42, PV19|transparent|Staining|-
Cadmium Yellow Deep|7000170|PY35|semi-transparent|Staining|-
Diarylide Yellow|7000175|PY83(HR70)|semi-opaque|NA|-
Isoindolinone Yellow|7000600|PY110|semi-opaque|Semi-Staining|-
Cadmium Orange|7000180|PO20|semi-opaque|Staining|-
Pyrrole Orange|7000590|PO73|semi-opaque|Staining|-
Transparent Pyrrole Orange|7000185|PO71|transparent|Staining|-
Disazo Scarlet|7000640|PR242|semi-opaque|Staining|-
Cadmium Red Light|7000195|PR108|semi-opaque|Semi-Staining|G
Permanent Scarlet|7000230|PR168|semi-transparent|Staining|-
Pyrrole Red Light|7000200|PR255|semi-opaque|Semi-Staining|-
Pyrrole Red Medium|7000210|PR254|semi-opaque|Staining|-
Cadmium Red Medium|7000215|PR108|semi-opaque|Staining|-
Cadmium Red Deep|7000220|PR108|semi-opaque|NA|G
Pyrrole Red Deep|7000225|PR264|semi-opaque|Staining|-
Quinacridone Red|7000235|PV19|transparent|Staining|-
Permanent Alizarin Crimson|7000240|PR177|transparent|Staining|-
Quinacridone Magenta|7000265|PR122|transparent|Staining|-
Quinacridone Violet|7000280|PV19|transparent|Staining|-
Ultramarine Pink Dark|7000655|PV15|semi-opaque|Semi-Staining|G
Ultramarine Violet|7000290|PV15|semi-transparent|Semi-Staining|G
Dioxazine Purple|7000295|PV23|semi-transparent|Staining|-
Ultramarine Blue|7000310|PB29|semi-transparent|Semi-Staining|G
Ultramarine Blue Violet|7000316|PV15, PB29|semi-transparent|NA|G
Cobalt Blue|7000320|PB28|semi-opaque|Semi-Staining|G
Cerulean Blue, Chromium|7000330|PB36|semi-opaque|NA|G
Phthalo Blue (Red Shade)|7000585|PB15:0|transparent|Staining|-
Indanthrone Blue|7000335|PB60|semi-opaque|Staining|-
Prussian Blue|7000340|PB27|semi-transparent|Staining|G
Indigo|7000305|PB15:3, PV19, PBk7|semi-transparent|Staining|G
Phthalo Blue (Green Shade)|7000345|PB15:3|semi-transparent|Staining|-
French Cerulean Blue|7000350|PB36|semi-opaque|Staining|G
Manganese Blue|7000355|PB15:3, PG7|transparent|NA|G
Cobalt Teal|7000360|PG50|semi-opaque|Semi-Staining|G
Cobalt Turquoise|7000370|PB36|opaque|NA|G
Ultramarine Turquoise|7000650|PB29, PG7|transparent|Semi-Staining|G
Phthalo Turquoise|7000365|PG7, PB15:3|transparent|Staining|-
Phthalo Green (Blue Shade)|7000375|PG7|transparent|Staining|-
Viridian Green|7000380|PG18|semi-transparent|Semi-Staining|G
Permanent Green Light|7000385|PY3, PG7|semi-transparent|Staining|-
Cobalt Green|7000390|PG26|semi-opaque|NA|G
Hooker's Green|7000395|PY150, PB60, PR122|semi-transparent|Staining|-
Olive Green|7000420|PR101, PY184, PG7|semi-opaque|Staining|G
Sap Green|7000400|PR101, PY150, PG36|transparent|Staining|-
Terre Verte|7000405|PG23|transparent|NA|G
Chromium Oxide Green|7000410|PG17|opaque|NA|G
Bohemian Green Earth|7000415|PY42, PR101, PG7, PBk7|semi-transparent|Staining|G
Green Gold|7000425|PY129|transparent|Semi-Staining|-
Titan Buff|7000430|PW6:1|semi-opaque|NA|-
Naples Yellow|7000435|PBr24, PW4, PBk7|semi-opaque|NA|-
Naples Yellow Deep|7000595|PBr24|semi-opaque|Semi-Staining|-
Transparent Yellow Oxide|7000445|PY42|transparent|Staining|G
Yellow Ochre|7000440|PY42|semi-opaque|Semi-Staining|-
Raw Sienna (Natural)|7000450|PBr7|semi-opaque|NA|-
Transparent Red Oxide|7000455|PR101|transparent|Staining|G
Venetian Red|7000465|PR101|opaque|Staining|-
Benzimidazolone Burnt Orange|7000605|PBr25|transparent|Staining|-
Burnt Sienna (Natural)|7000470|PBr7|semi-opaque|Semi-Staining|G
Perylene Crimson|7000645|PR179|semi-transparent|Staining|-
Transparent Brown Oxide|7000475|PR101, PBr6|transparent|Staining|G
Burnt Umber (Natural)|7000480|PBr7|semi-opaque|Semi-Staining|G
Van Dyke Brown|7000495|PBr6|semi-transparent|Staining|G
Raw Umber (Natural)|7000485|PBr7|semi-opaque|Semi-Staining|G
Brown Umber (Natural)|7000570|PBr7|semi-opaque|Staining|G
Sepia|7000490|PR101, PY150, PBk7|transparent|Staining|G
Carbon Black|7000500|PBk7|opaque|Staining|-
Ivory Black|7000505|PBk9|opaque|Staining|G
Payne's Gray (Violet)|7000575|PV29, PBk7, PB15:3|opaque|Staining|-
Payne's Gray|7000510|PBk7, PB15:3, PV19|semi-opaque|Staining|-
Perylene Violet|7000635|PV29|semi-opaque|Staining|-
Cadmium Purple|7000580|PR108|semi-opaque|Semi-Staining|G
Neutral Tint|7000520|PY42, PR122, PB15:3|semi-transparent|Staining|G
Ardoise Gray|7000525|PBk19|transparent|NA|G
Chinese White|7000530|PW4|semi-transparent|NA|-
Titanium White|7000535|PW6|semi-transparent|NA|-
Iridescent Copper|7000615|N/A|semi-opaque|N/A|G
Iridescent Gold (Fine)|7000540|N/A|semi-transparent|NA|G
Iridescent Pearl (Fine)|7000545|N/A|semi-transparent|NA|G
Iridescent Silver (Fine)|7000550|N/A, PBk7|semi-opaque|NA|G
Interference Violet|7000565|N/A|semi-transparent|N/A|G
Interference Red|7000610|N/A|semi-transparent|N/A|G
Interference Blue|7000555|N/A|semi-transparent|N/A|G
Interference Green|7000560|N/A|semi-transparent|N/A|G
Interference Violet-Green Shift|7000620|N/A|semi-transparent|N/A|G
Interference Green-Orange Shift|7000625|N/A|semi-transparent|N/A|G
Interference Green-Blue Shift|7000630|N/A|semi-transparent|N/A|G`;

export const qorPigmentData = new Map<string, PaintTechnicalData>(
  rows.split("\n").map((row) => {
    const [name, productCode, pigments, opacity, staining, granulation] = row.split("|");
    return [name, {
      productCode,
      pigments: pigments.split(", ").filter((pigment) => pigment !== "N/A"),
      opacity,
      staining,
      granulation: granulation === "G" ? "Granulating" : granulation === "-" ? "Not listed" : granulation,
    }];
  }),
);
