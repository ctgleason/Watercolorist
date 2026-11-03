export type WinsorNewtonTechnicalData = {
  productCode: string;
  permanenceGrade: "AA" | "A" | "B";
  series: number;
  astmLightfastness?: "I" | "II";
  pigments: string[];
  staining: string;
  granulation: string;
};

const rows = `Lemon Yellow (Nickel Titanate)|347|AA|4|I|G|PY53
Bismuth Yellow|025|A|3|I|St|PY184
Cadmium Lemon|086|A|4|I|St|PY35
Cadmium-Free Lemon|898|A|4|I||
Winsor Lemon|722|A|1||St|PY175
Winsor Yellow|730|A|1|I|St|PY154
Lemon Yellow Deep|348|AA|2||G|PY159
Aureolin Hue|417|AA|2|I||PBr7, PY151
Transparent Yellow|653|A|1||St|PY150
Cadmium Yellow Pale|118|A|4|I|St|PY35
Cadmium-Free Yellow Pale|907|A|4|I||
Turner's Yellow|649|AA|3|||PY216
New Gamboge|267|A|1|II||PY150, PR209
Cadmium Yellow|108|A|4|I||PY35, PO20
Cadmium-Free Yellow|890|A|4|I||
Winsor Yellow Deep|731|A|1|II||PY65
Indian Yellow|319|A|1|II||PY139, PO62
Cadmium Yellow Deep|111|A|4|I||PY35, PR108
Cadmium-Free Yellow Deep|891|A|4|I||
Cadmium Orange|089|A|4|I||PY35, PR108
Cadmium-Free Orange|899|A|4|I||
Winsor Orange|724|A|1|II||PO62
Winsor Orange (Red Shade)|723|A|1||St|PO73
Field's Orange|418|A|2|||PO67
Transparent Orange|650|A|3|I||
Cadmium Scarlet|106|A|4|I|St|PR108
Cadmium-Free Scarlet|903|A|4|I||
Scarlet Lake|603|A|2|II|St|PR188
Cadmium Red|094|A|4|I|St, G|PR108
Cadmium-Free Red|901|A|4|I||
Cadmium Red Deep|097|A|4|I|G|PR108
Cadmium-Free Red Deep|895|A|4|I||
Winsor Red|726|A|1||St|PR254
Rose Doré|576|A|4|II|St|PV19, PY97
Quinacridone Red|548|A|3|II||PR209
Winsor Red Deep|725|A|1||St|PR264
Permanent Alizarin Crimson|466|A|3||St|PR179
Alizarin Crimson|004|B|1||St|PR83
Permanent Carmine|479|A|3||St|
Permanent Rose|502|A|3|II|St|PV19
Rose Madder Genuine|587|B|4||G|
Opera Rose|448|B|2|||PR122
Quinacridone Magenta|545|A|3|||PR122
Permanent Magenta|489|A|3|I|St|PV19
Cobalt Violet|192|AA|4|I|G|PV14
Permanent Mauve|491|A|3|I|G|PV16
Quinacridone Violet|550|A|3|I||PV55
Tyrian Purple|419|B|2||St|PV37, PR202
Ultramarine Violet|672|A|2|I|G|PV15
Winsor Violet (Dioxazine)|733|A|1||St|PV23
Indanthrene Blue|321|A|3|||PB60
Cobalt Blue Deep|180|AA|4||G|PB74
French Ultramarine|263|A|2|I|G|PB29
Smalt (Dumont's Blue)|710|A|3|I|G|PV15
Ultramarine (Green Shade)|667|A|2|I||PB29
Cobalt Blue|178|AA|4|I|G|PB28
Winsor Blue (Red Shade)|709|A|1|II|St|PB15
Antwerp Blue|010|A|1|I||PB27
Prussian Blue|538|A|1|I|St|PB27
Winsor Blue (Green Shade)|707|A|1|II|St|PB15
Cerulean Blue (Red Shade)|140|AA|3|I|G|PB35
Cerulean Blue|137|AA|3|I|G|PB35
Manganese Blue Hue|379|A|2|II|G|PB15
Phthalo Turquoise|526|A|2||St|PB16
Aqua Green|697|A|3|||
Cobalt Turquoise Light|191|AA|4||G|PG50
Cobalt Turquoise|190|AA|4|I|G|PB28, PB36
Cobalt Green Deep|185|AA|3|I|G|PG26
Cobalt Green|184|AA|4||G|PG50
Winsor Green (Blue Shade)|719|A|1|I|St|PG7
Viridian Hue|696|A|2|I||PG7, PY42, PY43
Winsor Green (Yellow Shade)|721|A|1|I|St|PG36
Cinnabar Green|420|AA|2|||PG36, PY138
Terre Verte|637|AA|1|||PG23, PB28
Perylene Green|460|A|2||St|PBk31
Oxide of Chromium|459|AA|3|I|G, St|PG17
Hooker's Green|311|A|1|I|St|PG36, PY110
Permanent Sap Green|503|A|1|I|St|PG36, PY110
Olive Green|447|A|1|II|St|PY65, PB15:6, PR101
Terre Verte (Yellow Shade)|638|AA|1|I|G|PG23
Green Gold|294|A|2|||PY129
Naples Yellow|422|AA|1|I||PW6, PBr24
Naples Yellow Deep|425|AA|1|I||PBr24
Yellow Ochre Light|745|AA|1|I|G|PY43
Yellow Ochre|744|AA|1|I|G|PY43
Raw Sienna|552|AA|1|I|G|PY42, PR101
Gold Ochre|285|AA|2|||PY42
Transparent Gold Deep / Quinacridone Gold|547|A|3||St|PR179, PV19, PY150
Brown Ochre|059|AA|1|||PBr7
Magnesium Brown|381|AA|1||G|PY119
Burnt Sienna|074|AA|1|I||PR101
Light Red|362|AA|1|||PR102
Venetian Red|678|AA|1|I|St|PR101
Indian Red|317|AA|1|I||PR101
Brown Madder|056|A|1||St|PR179
Potter's Pink|537|AA|2||G|PR233
Perylene Maroon|507|A|3||St|PR179
Perylene Violet|470|A|2||St|PV29
Caput Mortuum Violet|125|AA|2|I|G, St|PR101
Raw Umber|554|AA|1|I|G|PBr7
Burnt Umber|076|AA|1|I||PBr7, PR101, PY42
Vandyke Brown|676|AA|1|I|St|PR101, PBk6
Sepia|609|AA|1|||PR101, PBk6
Indigo|322|A|1|II|St|PBk6, PB15, PV19
Payne's Gray|465|A|1|II|St|PBk6, PB15, PV19
Neutral Tint|430|A|1|II|St|PBk6, PB15, PV19
Ivory Black|331|AA|1|I|G|PBk9
Lamp Black|337|AA|1|I||PBk6, PBk7
Mars Black|386|AA|1|I|G|PBk11
Ostwald Grey|428|A|1|I|G, St|PBk6, PW5, PY42
Davy's Gray|217|AA|1|||PBk19, PBk6, PG17, PW5
Mineral Grey|427|A|1|I|G|PB29, PBk19, PW5
Ultramarine Ash|424|A|3|I|G|PB29, PG23
Chinese White|150|AA|1|I||PW4
Titanium White (Opaque White)|644|AA|1|I||PW6`;

export const winsorNewtonTechnicalData = new Map<string, WinsorNewtonTechnicalData>(
  rows.split("\n").map((row) => {
    const [name, productCode, permanenceGrade, series, astmLightfastness, properties, pigmentText] = row.split("|");
    const flags = new Set(properties.split(", ").filter(Boolean));
    return [name, {
      productCode,
      permanenceGrade: permanenceGrade as WinsorNewtonTechnicalData["permanenceGrade"],
      series: Number(series),
      ...(astmLightfastness ? { astmLightfastness: astmLightfastness as "I" | "II" } : {}),
      pigments: pigmentText ? pigmentText.split(", ") : [],
      staining: flags.has("St") ? "Staining" : "Not listed",
      granulation: flags.has("G") ? "Granulating" : "Not listed",
    }];
  }),
);
