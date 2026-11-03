import abstractionSource from "../../src/watercolorist/abstraction.py?raw";
import defaultsSource from "../../src/watercolorist/defaults.py?raw";
import initSource from "../../src/watercolorist/__init__.py?raw";
import imagesSource from "../../src/watercolorist/images.py?raw";
import transformsSource from "../../src/watercolorist/transforms.py?raw";
import { paintBrandOptions, paintCatalog } from "./paint-catalog";
import "./style.css";

type TransformName = "notan" | "grayscale";

type RegionPaintLayer = {
  id: string;
  regionIds?: number[];
  shapes?: { x: number; y: number }[][];
  paintId: string;
  secondPaintId?: string;
  mixRatio?: number;
  washStrength: number;
};

type Study = {
  blob: Blob;
  url: string;
  transform: TransformName;
  abstraction: number;
  autoAbstraction: boolean;
  levels: number;
  grayscaleMethod: "even" | "histogram" | "edge-guided" | "coherent-regions" | "adaptive-regions";
  thresholdMethod: string;
  exposure: number;
  shadows: number;
  highlights: number;
  workingResolution: number;
  regionLabels?: Uint32Array;
  regionValues?: Uint8Array;
  regionWidth?: number;
  regionHeight?: number;
  /** Ordered paint layers leave room for future user-drawn masks that overlap. */
  paintLayers?: RegionPaintLayer[];
  palettePaintIds: string[];
  paletteLimit: number;
  createdAt: Date;
  saved: boolean;
  snapshotNumber?: number;
};

type RegionMergeUndo = {
  previousStudy: Study;
  mergedStudy: Study;
};

type SnapshotWritable = {
  write: (data: Blob | string) => Promise<void>;
  close: () => Promise<void>;
};

type SnapshotFile = {
  createWritable: () => Promise<SnapshotWritable>;
  getFile: () => Promise<File>;
};

type SnapshotEntry = SnapshotDirectory & SnapshotFile & { kind: "file" | "directory" };

type SnapshotDirectory = {
  getDirectoryHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<SnapshotDirectory>;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<SnapshotFile>;
  entries: () => AsyncIterableIterator<[string, SnapshotEntry]>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<SnapshotDirectory>;
};

type WorkerReply =
  | {
      type: "ready";
      pythonVersion: string;
      runtimeLoadMs: number;
      packageLoadMs: number;
    }
  | { type: "estimate"; id: number; abstraction: number }
  | { type: "tone-preview"; id: number; image: ArrayBuffer }
  | {
      type: "complete";
      id: number;
      image: ArrayBuffer;
      transformMs: number;
      regions?: ArrayBuffer;
      regionValues?: ArrayBuffer;
      regionWidth?: number;
      regionHeight?: number;
    }
  | {
      type: "merge-complete";
      id: number;
      image: ArrayBuffer;
      regions: ArrayBuffer;
      regionValues: ArrayBuffer;
      regionWidth: number;
      regionHeight: number;
    }
  | { type: "error"; id?: number; message: string };

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Watercolorist home">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 3C12 9 7 14.2 7 20a9 9 0 0 0 18 0c0-5.8-5-11-9-17Z" fill="currentColor"/><path d="M11.5 21.5c.6 2.4 2.2 3.8 4.7 4.2" stroke="#F6F4EE" stroke-width="1.7" stroke-linecap="round"/></svg></span>
        <span>watercolorist</span>
      </a>
      <span class="version-badge" title="Application version and source commit">v${__APP_VERSION__} · ${__APP_COMMIT__}</span>
      <div class="runtime-pill"><span class="runtime-dot" id="runtime-dot"></span><span id="runtime-label">Starting Python worker</span></div>
    </header>

    <main>
      <section class="workspace" aria-label="Image study workspace">
        <div class="study-column">
          <div class="section-heading">
            <div><p class="eyebrow">01 / Reference</p><h2>Your image</h2></div>
            <span class="subtle-label">JPG · PNG · WEBP</span>
          </div>
          <label class="upload-card" id="upload-card" for="image-input">
            <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" />
            <span class="upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="upload-title" id="upload-title">Choose a reference image</span>
            <span class="upload-hint" id="upload-hint">or drop an image here</span>
            <img class="preview-image" id="source-preview" alt="Selected reference image" hidden />
          </label>

          <div class="section-heading result-heading">
            <div><p class="eyebrow">02 / Study</p><h2 id="result-title">Your study</h2></div>
          </div>
          <div class="study-actions">
            <div class="history-controls" aria-label="Study history">
              <button class="history-button" id="history-back" type="button" aria-label="Previous study" title="Previous study" disabled>←</button>
              <span class="history-count" id="history-count">0 / 20</span>
              <button class="history-button" id="history-forward" type="button" aria-label="Next study" title="Next study" disabled>→</button>
            </div>
            <div class="study-file-actions">
              <button class="snapshot-button" id="save-snapshot" type="button" disabled>Save snapshot</button>
              <a class="download-link" id="download-link" hidden download="watercolorist-study.png">Download PNG <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <div class="result-card" id="result-card" aria-live="polite">
            <div class="empty-state" id="result-empty">
              <span class="empty-sun" aria-hidden="true">✳</span>
              <p>Your study will appear here</p>
              <span>Choose an image and run a transformation</span>
            </div>
            <div class="result-stage" id="result-stage" hidden>
              <img class="preview-image result-image" id="result-preview" alt="Generated image study" />
              <canvas class="region-color-overlay" id="region-color-overlay" aria-hidden="true"></canvas>
              <canvas class="region-overlay" id="region-overlay" aria-label="Selectable grayscale regions"></canvas>
            </div>
          </div>
          <div class="region-tools" id="region-tools" hidden>
            <div class="region-selection-settings">
              <span id="region-selection-label">Click a grayscale region to select it.</span>
              <label class="region-tolerance-control" for="region-tolerance">
                Similar values ±<output id="region-tolerance-output" for="region-tolerance">0</output>
                <input id="region-tolerance" type="range" min="0" max="100" step="1" value="0" />
              </label>
            </div>
            <div class="region-actions">
              <button class="region-action region-multi-select" id="region-multi-select" type="button" aria-pressed="false" hidden>Add regions</button>
              <label class="region-value-control" for="region-value-mode">Combined value
                <select id="region-value-mode">
                  <option value="mean">Average</option>
                  <option value="lighter">Lighter</option>
                  <option value="darker">Darker</option>
                </select>
              </label>
              <button class="region-action" id="undo-region-merge" type="button" hidden>Undo combine</button>
              <button class="region-action" id="clear-region-selection" type="button" disabled>Clear</button>
              <button class="region-action region-combine" id="combine-regions" type="button" disabled>Combine regions</button>
            </div>
            <div class="region-paint-controls">
              <label class="region-paint-choice" for="region-paint-choice">Paint
                <select id="region-paint-choice" aria-label="Paint to fill selected region"></select>
              </label>
              <label class="region-wash-control" for="region-wash-strength">
                <span>Wash strength <output id="region-wash-output" for="region-wash-strength">65%</output></span>
                <input id="region-wash-strength" type="range" min="5" max="100" step="1" value="65" />
              </label>
              <button class="region-action region-paint-apply" id="apply-region-paint" type="button" disabled>Fill selected</button>
              <button class="region-action" id="clear-region-paint" type="button" disabled>Remove fill</button>
              <button class="region-action" id="auto-assign-paints" type="button" disabled>Auto-assign palette</button>
              <button class="region-action" id="draw-fill-shape" type="button" aria-pressed="false">Draw shape</button>
              <button class="region-action region-paint-apply" id="fill-drawn-shape" type="button" disabled>Fill drawn shape</button>
              <button class="region-action" id="clear-drawn-shapes" type="button" disabled>Clear shapes</button>
              <span class="region-paint-note">Auto-match may combine two palette paints and vary wash strength. Color and cold-press paper rendering are approximate.</span>
            </div>
          </div>
          <p class="image-caption" id="image-caption">No image selected</p>
        </div>

        <aside class="controls-card" aria-label="Study controls">
          <div class="controls-header"><span class="controls-icon" aria-hidden="true">✳</span><div><p class="eyebrow">Make a study</p><h2>Study settings</h2></div></div>

          <fieldset class="transform-options">
            <legend>Transformation</legend>
            <label class="transform-option"><input type="radio" name="transform" value="notan" checked /><span class="option-art notan-art" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span><strong>Notan</strong><small>Two values · light and dark</small></span><span class="radio-indicator" aria-hidden="true"></span></label>
            <label class="transform-option"><input type="radio" name="transform" value="grayscale" /><span class="option-art gray-art" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span><strong>Grayscale</strong><small>Build a simple value plan</small></span><span class="radio-indicator" aria-hidden="true"></span></label>
          </fieldset>

          <div class="setting" id="threshold-setting">
            <label for="threshold-method">Value split</label>
            <select id="threshold-method"><option value="otsu">Automatic · Otsu</option><option value="median">Balanced · median</option></select>
          </div>

          <div class="setting" id="levels-setting" hidden>
            <div class="setting-line"><label for="levels">Number of values</label><output id="levels-output" for="levels">5</output></div>
            <input id="levels" type="range" min="2" max="16" step="1" value="5" />
            <div class="range-ends"><span>2 values</span><span>16 values</span></div>
            <label for="grayscale-method">Value mapping</label>
            <select id="grayscale-method">
              <option value="even">Even steps</option>
              <option value="histogram">Histogram</option>
              <option value="edge-guided">Edge-guided hybrid</option>
              <option value="coherent-regions">Coherent regions (superpixels)</option>
            </select>
            <p class="setting-help" id="grayscale-method-help">Maps each pixel into fixed-width luminance intervals.</p>
          </div>

          <div class="setting abstraction-setting">
            <div class="setting-line"><label for="abstraction">Abstraction scale</label><output id="abstraction-output" for="abstraction">1×</output></div>
            <input id="abstraction" type="range" min="1" max="24" step="1" value="1" />
            <div class="range-ends"><span>Fine</span><span>Broad shapes</span></div>
          </div>

          <div class="setting working-resolution-setting">
            <label for="working-resolution">Working resolution</label>
            <select id="working-resolution">
              <option value="1">Original · 100%</option>
              <option value="0.75">75%</option>
              <option value="0.5">50%</option>
              <option value="0.25">25%</option>
            </select>
            <p class="setting-help">Lower settings process fewer pixels; the study is enlarged to the photo’s original dimensions.</p>
          </div>

          <details class="tone-panel" id="tone-panel">
            <summary><span>Tone adjustments</span><output id="tone-summary">Neutral</output></summary>
            <div class="tone-controls">
              <div class="tone-control">
                <div class="setting-line"><label for="exposure">Exposure</label><output id="exposure-output" for="exposure">0.0 EV</output></div>
                <input id="exposure" type="range" min="-2" max="2" step="0.1" value="0" />
                <div class="tone-range-ends"><span>−2 EV</span><span>+2 EV</span></div>
              </div>
              <div class="tone-control">
                <div class="setting-line"><label for="shadows">Shadows</label><output id="shadows-output" for="shadows">0.0</output></div>
                <input id="shadows" type="range" min="-1" max="1" step="0.05" value="0" />
                <div class="tone-range-ends"><span>Darken</span><span>Lift</span></div>
              </div>
              <div class="tone-control">
                <div class="setting-line"><label for="highlights">Highlights</label><output id="highlights-output" for="highlights">0.0</output></div>
                <input id="highlights" type="range" min="-1" max="1" step="0.05" value="0" />
                <div class="tone-range-ends"><span>Recover</span><span>Brighten</span></div>
              </div>
              <button class="tone-reset" id="tone-reset" type="button">Reset tone</button>
            </div>
          </details>

          <details class="palette-panel" id="palette-panel">
            <summary><span>Watercolor palette</span><output id="palette-count">0 paints selected</output></summary>
            <div class="palette-controls">
              <p class="setting-help">Choose paints you own or plan to use; this inventory is saved in this browser. Use the “Use” checkboxes to choose colors for this painting, or ask the app to suggest a limited palette. QoR and Winsor &amp; Newton entries show chart-listed pigments and handling data; DANIEL SMITH includes CIE Lab measurements for the first 20 chart entries. Manufacturer chart values are references, not calibrated screen swatches.</p>
              <label class="visually-hidden" for="paint-search">Search paint names</label>
              <input id="paint-search" type="search" placeholder="Search paint names…" autocomplete="off" />
              <label class="visually-hidden" for="paint-brand-filter">Filter by paint brand</label>
              <select id="paint-brand-filter">
                <option value="all">All brands</option>
                ${paintBrandOptions.map((brand) => `<option value="${brand.id}">${brand.label} · ${brand.line}</option>`).join("")}
              </select>
              <p class="paint-results-summary" id="paint-results-summary" aria-live="polite"></p>
              <div class="paint-results" id="paint-results" aria-label="Paint catalog results"></div>
              <div class="selected-paints-section">
                <h3>Your paint inventory</h3>
                <div class="painting-palette-controls">
                  <label for="painting-palette-limit">Max colors for this painting</label>
                  <input id="painting-palette-limit" type="number" min="1" max="20" value="5" />
                  <button class="region-action" id="auto-select-palette" type="button" disabled>Suggest limited palette</button>
                  <p class="painting-palette-summary" id="painting-palette-summary" aria-live="polite"></p>
                </div>
                <div class="selected-paints" id="selected-paints"></div>
              </div>
              <div class="paint-catalog-sources">
                ${paintBrandOptions.map((brand) => `
                  <span class="paint-catalog-source-group">
                    <strong>${brand.label}:</strong>
                    <a href="${brand.source}" target="_blank" rel="noreferrer">Catalog</a>
                    ${brand.technicalSource ? `<a href="${brand.technicalSource}" target="_blank" rel="noreferrer">Technical chart</a>` : ""}
                  </span>
                `).join("")}
              </div>
              <p class="setting-help">Automatic palette choice and region assignment use approximate RGB swatches and a simple two-paint mixing model; they are planning aids, not physical pigment predictions.</p>
            </div>
          </details>

          <details class="save-preferences-panel">
            <summary>Save preferences</summary>
            <label class="save-prompt-option"><input id="prompt-save" type="checkbox" /><span>Ask before saving each new study</span></label>
          </details>

          <button class="run-button" id="run-button" type="button" disabled><span id="run-label">Preparing Python…</span><span aria-hidden="true">→</span></button>
          <div class="status-message" id="status-message" role="status">Initializing the Python runtime…</div>
        </aside>
      </section>

      <footer class="page-footer"><span>WATERCOLORIST · EARLY FEASIBILITY BUILD</span><span id="performance-note">Python algorithms · browser worker</span></footer>
    </main>
  </div>
`;

const get = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
};

const worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
const modules = {
  "__init__.py": initSource,
  "abstraction.py": abstractionSource,
  "defaults.py": defaultsSource,
  "images.py": imagesSource,
  "transforms.py": transformsSource,
};

const fileInput = get<HTMLInputElement>("#image-input");
const uploadCard = get<HTMLLabelElement>("#upload-card");
const uploadTitle = get<HTMLSpanElement>("#upload-title");
const uploadHint = get<HTMLSpanElement>("#upload-hint");
const sourcePreview = get<HTMLImageElement>("#source-preview");
const resultPreview = get<HTMLImageElement>("#result-preview");
const resultEmpty = get<HTMLDivElement>("#result-empty");
const resultCard = get<HTMLDivElement>("#result-card");
const resultStage = get<HTMLDivElement>("#result-stage");
const regionColorOverlay = get<HTMLCanvasElement>("#region-color-overlay");
const regionOverlay = get<HTMLCanvasElement>("#region-overlay");
const regionTools = get<HTMLDivElement>("#region-tools");
const regionSelectionLabel = get<HTMLSpanElement>("#region-selection-label");
const combineRegionsButton = get<HTMLButtonElement>("#combine-regions");
const clearRegionSelectionButton = get<HTMLButtonElement>("#clear-region-selection");
const regionToleranceSlider = get<HTMLInputElement>("#region-tolerance");
const regionToleranceOutput = get<HTMLOutputElement>("#region-tolerance-output");
const regionValueModeSelect = get<HTMLSelectElement>("#region-value-mode");
const undoRegionMergeButton = get<HTMLButtonElement>("#undo-region-merge");
const regionMultiSelectButton = get<HTMLButtonElement>("#region-multi-select");
const regionPaintChoice = get<HTMLSelectElement>("#region-paint-choice");
const regionWashSlider = get<HTMLInputElement>("#region-wash-strength");
const regionWashOutput = get<HTMLOutputElement>("#region-wash-output");
const applyRegionPaintButton = get<HTMLButtonElement>("#apply-region-paint");
const clearRegionPaintButton = get<HTMLButtonElement>("#clear-region-paint");
const autoAssignPaintsButton = get<HTMLButtonElement>("#auto-assign-paints");
const drawFillShapeButton = get<HTMLButtonElement>("#draw-fill-shape");
const fillDrawnShapeButton = get<HTMLButtonElement>("#fill-drawn-shape");
const clearDrawnShapesButton = get<HTMLButtonElement>("#clear-drawn-shapes");
const runButton = get<HTMLButtonElement>("#run-button");
const runLabel = get<HTMLSpanElement>("#run-label");
const runtimeLabel = get<HTMLSpanElement>("#runtime-label");
const runtimeDot = get<HTMLSpanElement>("#runtime-dot");
const statusMessage = get<HTMLDivElement>("#status-message");
const downloadLink = get<HTMLAnchorElement>("#download-link");
const imageCaption = get<HTMLParagraphElement>("#image-caption");
const transformTitle = get<HTMLHeadingElement>("#result-title");
const performanceNote = get<HTMLSpanElement>("#performance-note");
const historyBack = get<HTMLButtonElement>("#history-back");
const historyForward = get<HTMLButtonElement>("#history-forward");
const historyCount = get<HTMLSpanElement>("#history-count");
const saveSnapshotButton = get<HTMLButtonElement>("#save-snapshot");
const promptSaveCheckbox = get<HTMLInputElement>("#prompt-save");
const thresholdSetting = get<HTMLDivElement>("#threshold-setting");
const levelsSetting = get<HTMLDivElement>("#levels-setting");
const thresholdSelect = get<HTMLSelectElement>("#threshold-method");
const abstractionSlider = get<HTMLInputElement>("#abstraction");
const abstractionOutput = get<HTMLOutputElement>("#abstraction-output");
const levelsSlider = get<HTMLInputElement>("#levels");
const levelsOutput = get<HTMLOutputElement>("#levels-output");
const grayscaleMethodSelect = get<HTMLSelectElement>("#grayscale-method");
const grayscaleMethodHelp = get<HTMLParagraphElement>("#grayscale-method-help");
const toneSummary = get<HTMLOutputElement>("#tone-summary");
const exposureSlider = get<HTMLInputElement>("#exposure");
const exposureOutput = get<HTMLOutputElement>("#exposure-output");
const shadowsSlider = get<HTMLInputElement>("#shadows");
const shadowsOutput = get<HTMLOutputElement>("#shadows-output");
const highlightsSlider = get<HTMLInputElement>("#highlights");
const highlightsOutput = get<HTMLOutputElement>("#highlights-output");
const workingResolutionSelect = get<HTMLSelectElement>("#working-resolution");
const paintSearchInput = get<HTMLInputElement>("#paint-search");
const paintBrandFilter = get<HTMLSelectElement>("#paint-brand-filter");
const paintResults = get<HTMLDivElement>("#paint-results");
const paintResultsSummary = get<HTMLParagraphElement>("#paint-results-summary");
const selectedPaintsElement = get<HTMLDivElement>("#selected-paints");
const paletteCountOutput = get<HTMLOutputElement>("#palette-count");
const paintingPaletteLimitInput = get<HTMLInputElement>("#painting-palette-limit");
const autoSelectPaletteButton = get<HTMLButtonElement>("#auto-select-palette");
const paintingPaletteSummary = get<HTMLParagraphElement>("#painting-palette-summary");

let runtimeReady = false;
let selectedFile: File | undefined;
let sourceUrl: string | undefined;
let compositeDownloadUrl: string | undefined;
let pendingRequest: number | undefined;
let nextRequestId = 1;
let pendingEstimateId: number | undefined;
let autoAbstractionScale: number | undefined;
let autoAbstraction = true;
let tonePreviewSource: Blob | undefined;
let tonePreviewSourceFile: File | undefined;
let tonePreviewResolution: number | undefined;
let tonePreviewUrl: string | undefined;
let tonePreviewTimer: number | undefined;
let pendingTonePreviewId: number | undefined;
const MAX_STUDY_HISTORY = 20;
let studyHistory: Study[] = [];
let studyIndex = -1;
let snapshotRoot: SnapshotDirectory | undefined;
let selectedRegionIds = new Set<number>();
let selectedRegionSeeds = new Set<number>();
let drawShapeMode = false;
let activeShapePoints: { x: number; y: number }[] = [];
let pendingShapes: { x: number; y: number }[][] = [];
let regionMultiSelectMode = false;
let pendingMergeRequest: number | undefined;
let regionMergeUndo: RegionMergeUndo | undefined;
let paintingPalettePaintIds = new Set<string>();
let paintingPaletteCustomized = false;
const PALETTE_STORAGE_KEY = "watercolorist.selected-paints.v1";
const PAINT_SWATCH_STORAGE_KEY = "watercolorist.paint-swatches.v1";
const paintIds = new Set(paintCatalog.map((paint) => paint.id));

const loadSelectedPaintIds = () => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return new Set<string>();
    return new Set(stored.filter((id): id is string => typeof id === "string" && paintIds.has(id)));
  } catch {
    return new Set<string>();
  }
};

let selectedPaintIds = loadSelectedPaintIds();
const defaultPaintingPalette = () => {
  const owned = paintCatalog.filter((paint) => selectedPaintIds.has(paint.id));
  return new Set(owned.length <= Number(paintingPaletteLimitInput.value) ? owned.map((paint) => paint.id) : []);
};
paintingPalettePaintIds = defaultPaintingPalette();

const syncPaintingPaletteToInventory = () => {
  if (!paintingPaletteCustomized) {
    paintingPalettePaintIds = defaultPaintingPalette();
    return;
  }
  paintingPalettePaintIds = new Set([...paintingPalettePaintIds].filter((id) => selectedPaintIds.has(id)));
};

const activeStudy = () => studyHistory[studyIndex];

const savePaintingPaletteOnStudy = (study: Study | undefined) => {
  if (!study) return;
  study.palettePaintIds = [...paintingPalettePaintIds];
  study.paletteLimit = Number(paintingPaletteLimitInput.value);
};

const loadSelectedPaintSwatches = () => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(PAINT_SWATCH_STORAGE_KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return new Map<string, string>();
    return new Map(
      Object.entries(stored).filter(([id, color]) => paintIds.has(id) && typeof color === "string" && /^#[\da-f]{6}$/i.test(color)),
    );
  } catch {
    return new Map<string, string>();
  }
};

const selectedPaintSwatches = loadSelectedPaintSwatches();

const saveSelectedPaintIds = () => {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify([...selectedPaintIds]));
  } catch {
    setStatus("The browser could not save this palette on this device.", "error");
  }
};

const saveSelectedPaintSwatches = () => {
  try {
    localStorage.setItem(PAINT_SWATCH_STORAGE_KEY, JSON.stringify(Object.fromEntries(selectedPaintSwatches)));
  } catch {
    setStatus("The browser could not save custom paint swatches on this device.", "error");
  }
};

const paintTechnicalSummary = (paint: (typeof paintCatalog)[number]) => {
  const details: string[] = [];
  if (paint.pigments?.length) details.push(`Pigments: ${paint.pigments.join(", ")}`);
  if (paint.opacity && paint.opacity !== "N/A") details.push(paint.opacity);
  if (paint.staining && paint.staining !== "NA" && paint.staining !== "N/A") details.push(paint.staining);
  if (paint.granulation && paint.granulation !== "Not listed") details.push(paint.granulation);
  if (paint.permanenceGrade) details.push(`Permanence ${paint.permanenceGrade}`);
  if (paint.series !== undefined) details.push(`Series ${paint.series}`);
  if (paint.astmLightfastness) {
    const rating = paint.astmLightfastness === "I" ? "Excellent" : "Very good";
    details.push(`ASTM ${paint.astmLightfastness} (${rating} lightfastness)`);
  }
  if (paint.lab) details.push(`CIE Lab L* ${paint.lab.l}, a* ${paint.lab.a}, b* ${paint.lab.b}`);
  return details.length ? details.join(" · ") : "Manufacturer pigment data not yet cataloged";
};

const paintLabSwatch = (paint: (typeof paintCatalog)[number]) => {
  if (!paint.lab) return undefined;
  const fy = (paint.lab.l + 16) / 116;
  const fx = fy + paint.lab.a / 500;
  const fz = fy - paint.lab.b / 200;
  const inverseLab = (value: number) => value ** 3 > 216 / 24389
    ? value ** 3
    : (116 * value - 16) / (24389 / 27);
  const x = 0.95047 * inverseLab(fx);
  const y = inverseLab(fy);
  const z = 1.08883 * inverseLab(fz);
  const linearRgb = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
  const encoded = linearRgb.map((channel) => {
    const clipped = Math.max(0, Math.min(1, channel));
    return Math.round(255 * (clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055));
  });
  return `rgb(${encoded.join(" ")})`;
};

const paintNameSwatchRules: [RegExp, string][] = [
  [/\b(?:blue[ -]violet|violet[ -]blue|ultramarine violet|rose of ultramarine)\b/i, "#574a8f"],
  [/\b(?:red[ -]violet|violet[ -]red|quinacridone lilac|lunar violet|moonglow)\b/i, "#81436e"],
  [/\b(?:blue[ -]green|green[ -]blue|cobalt teal|phthalo turquoise|ultramarine turquoise|cobalt turquoise|aqua green|turquoise|teal|cerulean)\b/i, "#318b9a"],
  [/\b(?:yellow[ -]green|green[ -]yellow|olive|sap green|hooker|viridian|terre verte|undersea|cascade green|permanent green|phthalo green|cobalt green|chromium green|green earth|spring green)\b/i, "#4f8055"],
  [/\b(?:pink|rose|magenta|fuchsia|carmine|crimson|maroon|rhodonite|opera)\b/i, "#c04375"],
  [/\b(?:purple|violet|mauve|wisteria|lavender|dioxazine|bordeaux|tyrian)\b/i, "#754d91"],
  [/\b(?:blue|indigo|ultramarine|cobalt|prussian|cerulean|smalt|indanthrone|antwerp|verditer|payne.?s blue)\b/i, "#3f64a3"],
  [/\b(?:green|emerald|perylene green|chromium oxide|bohemian)\b/i, "#4d8053"],
  [/\b(?:yellow|lemon|gamboge|aureolin|naples|nickel yellow|bismuth yellow|hansa|golden|isoindolinone)\b/i, "#e4c33c"],
  [/\b(?:orange|scarlet|pyrrole orange|pyrrol orange|vermilion|coral|red gold)\b/i, "#df713b"],
  [/\b(?:red|crimson|alizarin|pyrrole red|pyrrol red|venetian|indian red|oxide red|pompeii|caliente)\b/i, "#b94b45"],
  [/\b(?:ochre|sienna|umber|sepia|brown|earth|buff|van dyke|vandyke|caput mortuum|gold ochre|iron oxide|lunar earth|terre ercolano)\b/i, "#987047"],
  [/\b(?:gray|grey|neutral tint|graphite|payne.?s gray|payne.?s grey|slate|ardoise)\b/i, "#777d80"],
  [/\b(?:black|carbon black|ivory black|lamp black|mars black)\b/i, "#343536"],
  [/\b(?:white|pearl|titanium white|chinese white)\b/i, "#e8e4d7"],
  [/\b(?:gold|golden|iridescent gold)\b/i, "#c6a342"],
  [/\b(?:copper|iridescent copper)\b/i, "#b9784a"],
  [/\b(?:silver|iridescent silver)\b/i, "#a9adae"],
  [/\b(?:interference violet)\b/i, "#82779a"],
  [/\b(?:interference red)\b/i, "#b86a70"],
  [/\b(?:interference blue)\b/i, "#718baa"],
  [/\b(?:interference green)\b/i, "#7d9a83"],
];

const pigmentSwatch = (paint: (typeof paintCatalog)[number]) => {
  const pigmentColors: Record<string, string> = {
    PB: "#3f64a3", PB15: "#087ca5", PB28: "#315f9d", PB29: "#3b438f", PB60: "#303d73",
    PG: "#4d8053", PG7: "#16856b", PG18: "#548261",
    PR: "#b94b45", PR101: "#a34f42", PR122: "#c04375", PR209: "#c34c5b", PR255: "#be3f43",
    PY: "#e4c33c", PY3: "#e9df3a", PY35: "#e6c52d", PY42: "#c7a34b", PY150: "#b49322",
    PO: "#df713b", PV: "#754d91", PBr: "#987047", PBk: "#343536", PW: "#e8e4d7",
  };
  for (const pigment of paint.pigments ?? []) {
    const match = pigment.trim().match(/^P(Bk|Br|B|G|R|Y|O|V|W)\s*(\d+)?$/i);
    if (!match) continue;
    const family = `P${match[1]}`;
    const specific = `${family}${match[2] ?? ""}`;
    if (pigmentColors[specific]) return pigmentColors[specific];
    if (pigmentColors[family]) return pigmentColors[family];
  }
  return undefined;
};

const paintEstimatedSwatch = (paint: (typeof paintCatalog)[number]) =>
  paintNameSwatchRules.find(([pattern]) => pattern.test(paint.name))?.[1] ?? pigmentSwatch(paint);

const paintDisplaySwatch = (paint: (typeof paintCatalog)[number]) =>
  selectedPaintSwatches.get(paint.id) ?? paintLabSwatch(paint) ?? paintEstimatedSwatch(paint);

const paintSwatchDescription = (paint: (typeof paintCatalog)[number]) => {
  if (selectedPaintSwatches.has(paint.id)) return `Your display swatch for ${paint.name}`;
  if (paint.lab) return `Approximate screen color converted from manufacturer CIE Lab for ${paint.name}`;
  return `Approximate color inferred from the paint name or pigment family for ${paint.name}; not measured`;
};

const swatchRgb = (swatch: string) => {
  const hex = swatch.match(/^#([\da-f]{6})$/i);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const channels = swatch.match(/\d+(?:\.\d+)?/g)?.map(Number);
  return channels && channels.length >= 3 ? channels.slice(0, 3) : undefined;
};

const mixPaintRgb = (first: number[], second: number[], firstPaintRatio: number) => first.map((channel, index) => {
  const firstReflectance = Math.max(1, channel) / 255;
  const secondReflectance = Math.max(1, second[index] ?? channel) / 255;
  // Geometric reflectance interpolation is a simple subtractive-pigment approximation.
  return Math.round(255 * firstReflectance ** firstPaintRatio * secondReflectance ** (1 - firstPaintRatio));
});

const bestWashMatch = (target: number[], pigmentColor: number[], valueShade = 1) => {
  const paper = [246, 243, 233];
  const shadedPaper = paper.map((channel) => channel * valueShade);
  const delta = pigmentColor.map((channel, index) => (channel - paper[index]) * valueShade);
  const targetDelta = target.map((channel, index) => channel - shadedPaper[index]);
  const denominator = delta.reduce((sum, channel) => sum + channel * channel, 0) || 1;
  const projectedStrength = targetDelta.reduce((sum, channel, index) => sum + channel * delta[index], 0) / denominator;
  const strength = Math.max(0.05, Math.min(1, projectedStrength));
  const predicted = shadedPaper.map((channel, index) => channel + delta[index] * strength);
  const distance = predicted.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
  return { strength, distance };
};

const updateRegionPaintChoices = () => {
  const selected = paintCatalog.filter((paint) => paintingPalettePaintIds.has(paint.id) && selectedPaintIds.has(paint.id));
  const previous = regionPaintChoice.value;
  regionPaintChoice.replaceChildren(new Option(selected.length ? "Choose a paint…" : "Select paints in palette…", ""));
  for (const paint of selected) {
    const option = new Option(`${paint.name} · ${paint.brandName}`, paint.id);
    regionPaintChoice.add(option);
  }
  regionPaintChoice.value = selected.some((paint) => paint.id === previous) ? previous : "";
  applyRegionPaintButton.disabled = selectedRegionIds.size === 0 || !regionPaintChoice.value;
  autoAssignPaintsButton.disabled = selected.length === 0 || !activeStudy()?.regionLabels;
  autoSelectPaletteButton.disabled = selectedPaintIds.size === 0 || !activeStudy();
  paintingPaletteSummary.textContent = selectedPaintIds.size > Number(paintingPaletteLimitInput.value) && paintingPalettePaintIds.size === 0
    ? `Choose up to ${paintingPaletteLimitInput.value} paints with the “Use” checkboxes, or ask for a suggestion.`
    : `${paintingPalettePaintIds.size} of ${selectedPaintIds.size} owned paints in this painting's palette.`;
};

const createPaintedStudyBlob = async (study: Study) => {
  if (!study.paintLayers?.length || !study.regionLabels || !study.regionWidth || !study.regionHeight) return study.blob;
  await resultPreview.decode();
  if (studyHistory[studyIndex] !== study) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = resultPreview.naturalWidth;
  canvas.height = resultPreview.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(resultPreview, 0, 0);
  context.drawImage(regionColorOverlay, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
};

const updateStudyDownload = async (study: Study) => {
  try {
    const blob = await createPaintedStudyBlob(study);
    if (!blob || studyHistory[studyIndex] !== study) return;
    if (compositeDownloadUrl) URL.revokeObjectURL(compositeDownloadUrl);
    if (blob === study.blob) {
      compositeDownloadUrl = undefined;
      downloadLink.href = study.url;
      downloadLink.download = `${study.transform}-${study.createdAt.toISOString().replace(/[:.]/g, "-")}.png`;
      return;
    }
    compositeDownloadUrl = URL.createObjectURL(blob);
    downloadLink.href = compositeDownloadUrl;
    downloadLink.download = `watercolorist-painted-${study.createdAt.toISOString().replace(/[:.]/g, "-")}.png`;
  } catch {
    setStatus("The colorized preview is ready, but its download could not be prepared.", "error");
  }
};

const renderPaintOverlay = (study: Study) => {
  if (!study.regionLabels || !study.regionValues || !study.regionWidth || !study.regionHeight) return;
  const context = regionColorOverlay.getContext("2d");
  if (!context) return;
  regionColorOverlay.width = study.regionWidth;
  regionColorOverlay.height = study.regionHeight;
  const image = context.createImageData(study.regionWidth, study.regionHeight);
  const layers = (study.paintLayers ?? []).flatMap((layer) => {
    const paint = paintCatalog.find((entry) => entry.id === layer.paintId);
    const swatch = paint ? paintDisplaySwatch(paint) : undefined;
    if (!swatch || (!layer.regionIds?.length && !layer.shapes?.length)) return [];
    const firstColor = swatchRgb(swatch);
    const secondPaint = layer.secondPaintId
      ? paintCatalog.find((entry) => entry.id === layer.secondPaintId)
      : undefined;
    const secondColor = secondPaint ? swatchRgb(paintDisplaySwatch(secondPaint) ?? "") : undefined;
    if (!firstColor) return [];
    const color = secondColor
      ? mixPaintRgb(firstColor, secondColor, Math.max(0, Math.min(1, layer.mixRatio ?? 0.5)))
      : firstColor;
    let shapeMask: Uint8ClampedArray | undefined;
    if (layer.shapes?.length) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = study.regionWidth!;
      maskCanvas.height = study.regionHeight!;
      const maskContext = maskCanvas.getContext("2d");
      if (maskContext) {
        maskContext.fillStyle = "#fff";
        for (const shape of layer.shapes) {
          if (shape.length < 3) continue;
          maskContext.beginPath();
          maskContext.moveTo(shape[0].x * maskCanvas.width, shape[0].y * maskCanvas.height);
          for (const point of shape.slice(1)) maskContext.lineTo(point.x * maskCanvas.width, point.y * maskCanvas.height);
          maskContext.closePath();
          maskContext.fill();
        }
        shapeMask = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
      }
    }
    return [{
      regionIds: new Set(layer.regionIds ?? []),
      shapeMask,
      color,
      strength: Math.max(0, Math.min(1, layer.washStrength / 100)),
    }];
  });
  if (layers.length === 0) {
    context.clearRect(0, 0, study.regionWidth, study.regionHeight);
    return;
  }

  // Cold-press paper is represented by a warm off-white base. The value-study luminance shades each wash.
  const paper = [246, 243, 233];
  for (let index = 0; index < study.regionLabels.length; index += 1) {
    const regionId = study.regionLabels[index];
    const gray = Number(study.regionValues[regionId] ?? 255) / 255;
    let red = paper[0];
    let green = paper[1];
    let blue = paper[2];
    let painted = false;
    for (const layer of layers) {
      if (!layer.regionIds.has(regionId) && !(layer.shapeMask?.[index * 4 + 3])) continue;
      const { color, strength } = layer;
      red = red * (1 - strength) + color[0] * strength;
      green = green * (1 - strength) + color[1] * strength;
      blue = blue * (1 - strength) + color[2] * strength;
      painted = true;
    }
    if (!painted) continue;
    // Keep dark value shapes visibly chromatic instead of multiplying pure black into a black wash.
    const valueShade = 0.58 + gray * 0.42;
    const pixel = index * 4;
    image.data[pixel] = Math.round(red * valueShade);
    image.data[pixel + 1] = Math.round(green * valueShade);
    image.data[pixel + 2] = Math.round(blue * valueShade);
    image.data[pixel + 3] = 255;
  }
  context.putImageData(image, 0, 0);
};

const applyPaintToSelectedRegions = () => {
  const study = studyHistory[studyIndex];
  const paintId = regionPaintChoice.value;
  const washStrength = Number(regionWashSlider.value);
  if (!study?.regionLabels || selectedRegionIds.size === 0 || !paintId) return;
  study.paintLayers ??= [];
  study.paintLayers.push({
    id: crypto.randomUUID(),
    regionIds: [...selectedRegionIds],
    paintId,
    washStrength,
  });
  renderPaintOverlay(study);
  void updateStudyDownload(study);
  renderRegionOverlay(study);
  setStatus(`Applied ${paintCatalog.find((paint) => paint.id === paintId)?.name ?? "paint"} at ${washStrength}% wash strength.`, "success");
};

const fillDrawnShapes = () => {
  const study = studyHistory[studyIndex];
  const paintId = regionPaintChoice.value;
  if (!study?.regionLabels || pendingShapes.length === 0 || !paintId) return;
  study.paintLayers ??= [];
  study.paintLayers.push({
    id: crypto.randomUUID(),
    shapes: pendingShapes.map((shape) => [...shape]),
    paintId,
    washStrength: Number(regionWashSlider.value),
  });
  pendingShapes = [];
  drawShapeMode = false;
  drawFillShapeButton.setAttribute("aria-pressed", "false");
  drawFillShapeButton.textContent = "Draw shape";
  renderPaintOverlay(study);
  renderRegionOverlay(study);
  void updateStudyDownload(study);
  setStatus(`Filled drawn shape with ${paintCatalog.find((paint) => paint.id === paintId)?.name ?? "paint"}.`, "success");
};

const clearDrawnShapes = () => {
  const study = studyHistory[studyIndex];
  pendingShapes = [];
  activeShapePoints = [];
  if (study) {
    study.paintLayers = (study.paintLayers ?? []).filter((layer) => !layer.shapes?.length);
    renderPaintOverlay(study);
    renderRegionOverlay(study);
    void updateStudyDownload(study);
  }
  fillDrawnShapeButton.disabled = true;
  clearDrawnShapesButton.disabled = true;
  setStatus("Cleared drawn shape drafts and fills.", "success");
};

const getStudyRegionColorSamples = async (study: Study) => {
  if (!study.regionLabels || !study.regionWidth || !study.regionHeight) return [];
  await sourcePreview.decode();
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = study.regionWidth;
  sourceCanvas.height = study.regionHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) return [];
  sourceContext.drawImage(sourcePreview, 0, 0, study.regionWidth, study.regionHeight);
  const sourcePixels = sourceContext.getImageData(0, 0, study.regionWidth, study.regionHeight).data;
  const sums = Array.from({ length: study.regionValues?.length ?? 0 }, () => [0, 0, 0, 0]);
  for (let index = 0; index < study.regionLabels.length; index += 1) {
    const sum = sums[study.regionLabels[index]];
    if (!sum) continue;
    const pixel = index * 4;
    sum[0] += sourcePixels[pixel];
    sum[1] += sourcePixels[pixel + 1];
    sum[2] += sourcePixels[pixel + 2];
    sum[3] += 1;
  }
  return sums.flatMap(([red, green, blue, count], regionId) => count > 0
    ? [{
        regionId,
        color: [red / count, green / count, blue / count],
        weight: count,
        valueShade: 0.58 + (Number(study.regionValues?.[regionId] ?? 255) / 255) * 0.42,
      }]
    : []);
};

const aggregatePaletteTargets = (regions: Awaited<ReturnType<typeof getStudyRegionColorSamples>>) => {
  const bins = new Map<string, { colorSum: number[]; weight: number; valueShade: number }>();
  for (const region of regions) {
    const colorBin = region.color.map((channel) => Math.min(5, Math.floor(channel / 43)));
    const shadeBin = Math.min(3, Math.floor((region.valueShade - 0.58) / 0.105));
    const key = `${colorBin.join(":")}:${shadeBin}`;
    const bin = bins.get(key) ?? { colorSum: [0, 0, 0], weight: 0, valueShade: 0 };
    for (let channel = 0; channel < 3; channel += 1) bin.colorSum[channel] += region.color[channel] * region.weight;
    bin.weight += region.weight;
    bin.valueShade += region.valueShade * region.weight;
    bins.set(key, bin);
  }
  return [...bins.values()].map((bin) => ({
    color: bin.colorSum.map((channel) => channel / bin.weight),
    weight: bin.weight,
    valueShade: bin.valueShade / bin.weight,
  }));
};

const autoSelectPaintingPalette = async () => {
  const study = activeStudy();
  if (!study?.regionLabels) return;
  const candidates = paintCatalog.flatMap((paint) => {
    if (!selectedPaintIds.has(paint.id)) return [];
    const swatch = paintDisplaySwatch(paint);
    const color = swatch ? swatchRgb(swatch) : undefined;
    return color ? [{ paintId: paint.id, color }] : [];
  });
  if (candidates.length === 0) {
    setStatus("Select paints you own before suggesting a limited palette.", "error");
    return;
  }
  const requestedCount = Math.max(1, Math.min(20, Number(paintingPaletteLimitInput.value) || 1));
  paintingPaletteLimitInput.value = String(requestedCount);
  autoSelectPaletteButton.disabled = true;
  try {
    const rawRegions = await getStudyRegionColorSamples(study);
    if (study !== activeStudy() || rawRegions.length === 0) return;
    const regions = aggregatePaletteTargets(rawRegions);

    // Greedy weighted facility selection: each candidate is scored by how much it reduces
    // the regions' best single-paint wash error on the assumed paper.
    const chosen: typeof candidates = [];
    const bestDistances = regions.map(() => Number.POSITIVE_INFINITY);
    while (chosen.length < Math.min(requestedCount, candidates.length)) {
      let next: (typeof candidates)[number] | undefined;
      let bestTotal = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        if (chosen.some((paint) => paint.paintId === candidate.paintId)) continue;
        let total = 0;
        for (let index = 0; index < regions.length; index += 1) {
          const sample = regions[index];
          const error = bestWashMatch(sample.color, candidate.color, sample.valueShade).distance;
          total += Math.min(bestDistances[index], error) * sample.weight;
        }
        if (total < bestTotal) {
          bestTotal = total;
          next = candidate;
        }
      }
      if (!next) break;
      chosen.push(next);
      for (let index = 0; index < regions.length; index += 1) {
        const sample = regions[index];
        const error = bestWashMatch(sample.color, next.color, sample.valueShade).distance;
        bestDistances[index] = Math.min(bestDistances[index], error);
      }
    }
    paintingPalettePaintIds = new Set(chosen.map((paint) => paint.paintId));
    paintingPaletteCustomized = true;
    savePaintingPaletteOnStudy(study);
    renderPaintCatalog();
    renderPaintOverlay(study);
    renderRegionOverlay(study);
    await updateStudyDownload(study);
    const estimatedError = Math.sqrt(bestDistances.reduce((sum, distance, index) => sum + distance * regions[index].weight, 0) /
      regions.reduce((sum, sample) => sum + sample.weight, 0));
    setStatus(`Suggested ${chosen.length} ${chosen.length === 1 ? "paint" : "paints"} for this painting (weighted RGB error ≈ ${estimatedError.toFixed(0)}). Review or adjust the “Use” checkboxes, then auto-assign regions.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? `Could not suggest a palette: ${error.message}` : "Could not suggest a palette.", "error");
  } finally {
    autoSelectPaletteButton.disabled = !activeStudy() || selectedPaintIds.size === 0;
  }
};

const autoAssignPalette = async () => {
  const study = studyHistory[studyIndex];
  if (!study?.regionLabels || !study.regionWidth || !study.regionHeight) return;
  const palette = paintCatalog.flatMap((paint) => {
    if (!paintingPalettePaintIds.has(paint.id) || !selectedPaintIds.has(paint.id)) return [];
    const swatch = paintDisplaySwatch(paint);
    const color = swatch ? swatchRgb(swatch) : undefined;
    return color ? [{ paintId: paint.id, color }] : [];
  });
  if (palette.length === 0) {
    setStatus("Add at least one paint to this painting's palette before auto-assigning.", "error");
    return;
  }
  try {
    const regions = await getStudyRegionColorSamples(study);
    if (study !== activeStudy()) return;
    const assignments = new Map<string, RegionPaintLayer & { regionIds: number[] }>();
    let mixedRegionCount = 0;
    for (const sample of regions) {
      const { regionId, color: target, valueShade } = sample;
      let closest: {
        paintId: string;
        secondPaintId?: string;
        mixRatio?: number;
        washStrength: number;
        distance: number;
      };
      closest = { paintId: palette[0].paintId, washStrength: 65, distance: Number.POSITIVE_INFINITY };
      for (const candidate of palette) {
        const match = bestWashMatch(target, candidate.color, valueShade);
        if (match.distance < closest.distance) {
          closest = { paintId: candidate.paintId, washStrength: Math.round(match.strength * 20) * 5, distance: match.distance };
        }
      }
      const shortlist = [...palette]
        .sort((first, second) => {
          const firstDistance = first.color.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
          const secondDistance = second.color.reduce((sum, channel, index) => sum + (channel - target[index]) ** 2, 0);
          return firstDistance - secondDistance;
        })
        .slice(0, Math.min(18, palette.length));
      for (let firstIndex = 0; firstIndex < shortlist.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < shortlist.length; secondIndex += 1) {
          const first = shortlist[firstIndex];
          const second = shortlist[secondIndex];
          for (let ratioStep = 1; ratioStep < 10; ratioStep += 1) {
            const mixRatio = ratioStep / 10;
            const color = mixPaintRgb(first.color, second.color, mixRatio);
            const match = bestWashMatch(target, color, valueShade);
            if (match.distance < closest.distance) {
              closest = {
                paintId: first.paintId,
                secondPaintId: second.paintId,
                mixRatio,
                washStrength: Math.max(5, Math.min(100, Math.round(match.strength * 20) * 5)),
                distance: match.distance,
              };
            }
          }
        }
      }
      const mixRatio = closest.mixRatio ?? 0;
      const groupKey = [closest.paintId, closest.secondPaintId ?? "", mixRatio, closest.washStrength].join("|");
      const group = assignments.get(groupKey) ?? {
        id: crypto.randomUUID(),
        paintId: closest.paintId,
        ...(closest.secondPaintId ? { secondPaintId: closest.secondPaintId, mixRatio: closest.mixRatio } : {}),
        washStrength: closest.washStrength,
        regionIds: [],
      };
      group.regionIds.push(regionId);
      assignments.set(groupKey, group);
      if (closest.secondPaintId) mixedRegionCount += 1;
    }
    const shapeLayers = (study.paintLayers ?? []).filter((layer) => layer.shapes?.length);
    const assignedLayers = [...assignments.values()];
    study.paintLayers = [...assignedLayers, ...shapeLayers];
    renderPaintOverlay(study);
    renderRegionOverlay(study);
    await updateStudyDownload(study);
    const regionCount = regions.length;
    const mixedSummary = mixedRegionCount === 0
      ? "No regions needed a two-paint mix."
      : `${mixedRegionCount} ${mixedRegionCount === 1 ? "region uses" : "regions use"} two-paint mixes.`;
    setStatus(`Auto-matched ${regionCount} ${regionCount === 1 ? "region" : "regions"}. ${mixedSummary} Wash strengths were optimized on warm paper.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? `Could not auto-assign paints: ${error.message}` : "Could not auto-assign paints.", "error");
  }
};

const clearPaintFromSelectedRegions = () => {
  const study = studyHistory[studyIndex];
  if (!study || selectedRegionIds.size === 0) return;
  const selected = selectedRegionIds;
  study.paintLayers = (study.paintLayers ?? []).flatMap((layer) => {
    if (!layer.regionIds?.length) return [layer];
    const remaining = layer.regionIds.filter((regionId) => !selected.has(regionId));
    return remaining.length ? [{ ...layer, regionIds: remaining }] : [];
  });
  renderPaintOverlay(study);
  void updateStudyDownload(study);
  renderRegionOverlay(study);
  setStatus("Removed paint from the selected regions.", "success");
};

const renderPaintCatalog = () => {
  const search = paintSearchInput.value.trim().toLocaleLowerCase();
  const brandFilter = paintBrandFilter.value;
  const matches = paintCatalog.filter((paint) =>
    (brandFilter === "all" || paint.brand === brandFilter) &&
    (!search || `${paint.name} ${paint.brandName} ${paint.lineName} ${paint.productCode ?? ""} ${(paint.pigments ?? []).join(" ")}`.toLocaleLowerCase().includes(search)),
  );
  const visible = search ? matches.slice(0, 60) : matches;
  paintResults.replaceChildren();
  for (const paint of visible) {
    const label = document.createElement("label");
    label.className = "paint-result";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedPaintIds.has(paint.id);
    checkbox.dataset.paintId = paint.id;
    const swatch = document.createElement("span");
    swatch.className = "paint-result-swatch";
    swatch.dataset.swatchPaintId = paint.id;
    const displaySwatch = paintDisplaySwatch(paint);
    if (displaySwatch) {
      swatch.style.backgroundColor = displaySwatch;
      swatch.classList.add(selectedPaintSwatches.has(paint.id) ? "paint-result-swatch-custom" : "paint-result-swatch-lab");
      swatch.title = paintSwatchDescription(paint);
      swatch.setAttribute("aria-label", `${selectedPaintSwatches.has(paint.id) ? "Your" : "Approximate"} swatch for ${paint.name}`);
    } else {
      swatch.classList.add("paint-result-swatch-unavailable");
      swatch.title = `No digital swatch available for ${paint.name}`;
      swatch.setAttribute("aria-label", `No digital swatch available for ${paint.name}`);
    }
    const text = document.createElement("span");
    text.className = "paint-result-name";
    text.textContent = paint.name;
    const maker = document.createElement("small");
    maker.textContent = paint.productCode ? `${paint.brandName} · ${paint.productCode}` : paint.brandName;
    const pigments = document.createElement("small");
    pigments.className = "paint-result-pigments";
    pigments.textContent = paintTechnicalSummary(paint);
    label.append(checkbox, swatch, text, maker, pigments);
    paintResults.append(label);
  }
  paintResultsSummary.textContent = matches.length > visible.length
    ? `Showing ${visible.length} of ${matches.length} matches. Add a search term to narrow the list.`
    : `${matches.length} ${matches.length === 1 ? "paint" : "paints"} found`;

  const selected = paintCatalog.filter((paint) => selectedPaintIds.has(paint.id));
  paletteCountOutput.value = `${selected.length} ${selected.length === 1 ? "paint" : "paints"} selected`;
  autoSelectPaletteButton.disabled = selected.length === 0 || !activeStudy();
  selectedPaintsElement.replaceChildren();
  if (selected.length === 0) {
    const empty = document.createElement("p");
    empty.className = "selected-paints-empty";
    empty.textContent = "Search above and select paints to build your palette.";
    selectedPaintsElement.append(empty);
    updateRegionPaintChoices();
    return;
  }
  for (const paint of selected) {
    const item = document.createElement("div");
    item.className = "selected-paint";
    const swatch = document.createElement("span");
    swatch.className = "selected-paint-swatch";
    const userSwatch = selectedPaintSwatches.get(paint.id);
    const visibleSwatch = paintDisplaySwatch(paint);
    if (visibleSwatch) {
      swatch.style.backgroundColor = visibleSwatch;
      swatch.classList.add(userSwatch ? "selected-paint-swatch-custom" : "selected-paint-swatch-lab");
      swatch.title = `${paintSwatchDescription(paint)}. Tap to enter your own swatch.`;
      swatch.setAttribute("aria-label", `${userSwatch ? "Your" : "Approximate"} color swatch for ${paint.name}`);
    } else {
      swatch.classList.add("selected-paint-swatch-unavailable");
      swatch.title = `Tap to enter a swatch for ${paint.name}`;
      swatch.setAttribute("aria-label", `No digital swatch for ${paint.name}; tap to add one`);
    }
    const swatchHint = document.createElement("span");
    swatchHint.className = "selected-paint-swatch-hint";
    swatchHint.textContent = visibleSwatch ? "Edit" : "Add";
    const swatchPicker = document.createElement("input");
    swatchPicker.type = "color";
    swatchPicker.className = "selected-paint-color-picker";
    swatchPicker.value = visibleSwatch ?? "#b8b8b8";
    swatchPicker.dataset.swatchPaintId = paint.id;
    swatchPicker.setAttribute("aria-label", `Set display swatch for ${paint.name}`);
    swatch.append(swatchHint, swatchPicker);
    const name = document.createElement("span");
    name.className = "selected-paint-name";
    name.textContent = paint.name;
    const maker = document.createElement("small");
    maker.className = "selected-paint-maker";
    maker.textContent = [paint.brandName, paint.productCode]
      .filter(Boolean)
      .join(" · ");
    const paintingChoice = document.createElement("label");
    paintingChoice.className = "selected-paint-use";
    const paintingCheckbox = document.createElement("input");
    paintingCheckbox.type = "checkbox";
    paintingCheckbox.checked = paintingPalettePaintIds.has(paint.id);
    paintingCheckbox.dataset.paintingPaletteId = paint.id;
    paintingCheckbox.setAttribute("aria-label", `Use ${paint.name} in this painting`);
    paintingChoice.append(paintingCheckbox, document.createTextNode("Use"));
    const details = document.createElement("small");
    details.className = "selected-paint-details";
    details.textContent = paintTechnicalSummary(paint);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "selected-paint-remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${paint.name} from palette`);
    remove.dataset.removePaintId = paint.id;
    item.append(swatch, name, maker, paintingChoice, remove, details);
    selectedPaintsElement.append(item);
  }
  updateRegionPaintChoices();
};

const setStatus = (message: string, kind: "info" | "success" | "error" = "info") => {
  statusMessage.textContent = message;
  statusMessage.dataset.kind = kind;
};

const setRuntimeState = (label: string, state: "loading" | "ready" | "error") => {
  runtimeLabel.textContent = label;
  runtimeDot.dataset.state = state;
};

const selectedTransform = (): TransformName =>
  get<HTMLInputElement>('input[name="transform"]:checked').value as TransformName;

const updateToneLabels = () => {
  const exposure = Number(exposureSlider.value);
  const shadows = Number(shadowsSlider.value);
  const highlights = Number(highlightsSlider.value);
  exposureOutput.value = `${exposure.toFixed(1)} EV`;
  shadowsOutput.value = `${shadows > 0 ? "+" : ""}${shadows.toFixed(2)}`;
  highlightsOutput.value = `${highlights > 0 ? "+" : ""}${highlights.toFixed(2)}`;
  toneSummary.value = exposure === 0 && shadows === 0 && highlights === 0 ? "Neutral" : "Adjusted";
};

const toneSettingsAreNeutral = () =>
  Number(exposureSlider.value) === 0 &&
  Number(shadowsSlider.value) === 0 &&
  Number(highlightsSlider.value) === 0;

const scheduleTonePreview = () => {
  if (tonePreviewTimer !== undefined) window.clearTimeout(tonePreviewTimer);
  tonePreviewTimer = undefined;
  pendingTonePreviewId = undefined;

  if (toneSettingsAreNeutral()) {
    if (tonePreviewUrl) URL.revokeObjectURL(tonePreviewUrl);
    tonePreviewUrl = undefined;
    sourcePreview.src = sourceUrl ?? "";
    uploadHint.textContent = "Reference loaded · choose a study and run it";
    return;
  }

  uploadHint.textContent = "Preparing live tone preview…";
  if (
    !tonePreviewSource ||
    tonePreviewSourceFile !== selectedFile ||
    tonePreviewResolution !== Number(workingResolutionSelect.value)
  ) return;

  uploadHint.textContent = "Live tone preview · full resolution on Create study";
  tonePreviewTimer = window.setTimeout(() => {
    tonePreviewTimer = undefined;
    void requestTonePreview();
  }, 120);
};

const prepareTonePreviewSource = async (file: File) => {
  const temporaryUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = temporaryUrl;
    await image.decode();
    if (selectedFile !== file) return;

    const workingResolution = Number(workingResolutionSelect.value);
    const maxEdge = Math.max(320, Math.round(1280 * workingResolution));
    const resize = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * resize));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * resize));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare a tone preview canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    tonePreviewSource = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the tone preview."))),
        "image/jpeg",
        0.88,
      );
    });
    tonePreviewSourceFile = file;
    tonePreviewResolution = workingResolution;
    scheduleTonePreview();
  } catch (error) {
    if (selectedFile === file) {
      uploadHint.textContent = "Live preview unavailable · Create study uses the full image";
    }
    console.warn("Could not prepare the live tone preview", error);
  } finally {
    URL.revokeObjectURL(temporaryUrl);
  }
};

const requestTonePreview = async () => {
  const source = tonePreviewSource;
  if (
    !source ||
    tonePreviewSourceFile !== selectedFile ||
    tonePreviewResolution !== Number(workingResolutionSelect.value) ||
    !runtimeReady
  ) return;
  const id = nextRequestId++;
  pendingTonePreviewId = id;
  const image = await source.arrayBuffer();
  if (pendingTonePreviewId !== id || tonePreviewSourceFile !== selectedFile) return;
  worker.postMessage(
    {
      type: "tone-preview",
      id,
      image,
      exposure: Number(exposureSlider.value),
      shadows: Number(shadowsSlider.value),
      highlights: Number(highlightsSlider.value),
    },
    [image],
  );
};

const resetTone = () => {
  exposureSlider.value = "0";
  shadowsSlider.value = "0";
  highlightsSlider.value = "0";
  updateToneLabels();
  scheduleTonePreview();
};

const updateSettings = () => {
  const transform = selectedTransform();
  thresholdSetting.hidden = transform !== "notan";
  levelsSetting.hidden = transform !== "grayscale";
  transformTitle.textContent = transform === "notan" ? "Notan study" : "Grayscale study";
  grayscaleMethodHelp.textContent = grayscaleMethodSelect.value === "histogram"
    ? "Uses the luminance histogram to distribute pixels across the requested values."
    : grayscaleMethodSelect.value === "edge-guided"
      ? "Preserves strong edges in flat areas; uses texture bins with extra weight for brighter values."
    : grayscaleMethodSelect.value === "coherent-regions" || grayscaleMethodSelect.value === "adaptive-regions"
      ? "Segments coherent color areas and assigns each area a shared value."
      : "Maps each pixel into fixed-width luminance intervals.";
};

const updateRunButton = () => {
  runButton.disabled = !runtimeReady || !selectedFile || pendingRequest !== undefined || pendingEstimateId !== undefined || pendingMergeRequest !== undefined;
  if (pendingRequest !== undefined) runLabel.textContent = "Painting the values…";
  else if (pendingMergeRequest !== undefined) runLabel.textContent = "Combining regions…";
  else if (pendingEstimateId !== undefined) runLabel.textContent = "Reading image detail…";
  else if (!runtimeReady) runLabel.textContent = "Preparing Python…";
  else if (!selectedFile) runLabel.textContent = "Choose an image first";
  else runLabel.textContent = "Create study";
};

const requestAbstractionEstimate = async () => {
  const file = selectedFile;
  if (!file || !runtimeReady || pendingEstimateId !== undefined) return;
  const id = nextRequestId++;
  pendingEstimateId = id;
  updateRunButton();
  const image = await file.arrayBuffer();
  if (selectedFile !== file || pendingEstimateId !== id) return;
  worker.postMessage(
    { type: "estimate", id, image, workingResolution: Number(workingResolutionSelect.value) },
    [image],
  );
};

const setSelectedFile = (file: File) => {
  if (!file.type.startsWith("image/")) {
    setStatus("Please choose a supported image file.", "error");
    return;
  }
  selectedFile = file;
  paintingPaletteCustomized = false;
  syncPaintingPaletteToInventory();
  renderPaintCatalog();
  selectedRegionIds.clear();
  selectedRegionSeeds.clear();
  pendingMergeRequest = undefined;
  selectedRegionIds.clear();
  pendingMergeRequest = undefined;
  if (tonePreviewTimer !== undefined) window.clearTimeout(tonePreviewTimer);
  tonePreviewTimer = undefined;
  pendingTonePreviewId = undefined;
  tonePreviewSource = undefined;
  tonePreviewSourceFile = undefined;
  tonePreviewResolution = undefined;
  if (tonePreviewUrl) URL.revokeObjectURL(tonePreviewUrl);
  tonePreviewUrl = undefined;
  for (const study of studyHistory) URL.revokeObjectURL(study.url);
  if (compositeDownloadUrl) URL.revokeObjectURL(compositeDownloadUrl);
  compositeDownloadUrl = undefined;
  studyHistory = [];
  studyIndex = -1;
  snapshotRoot = undefined;
  promptSaveCheckbox.checked = false;
  autoAbstraction = true;
  autoAbstractionScale = undefined;
  workingResolutionSelect.value = "1";
  pendingEstimateId = undefined;
  abstractionOutput.value = "Auto";
  resetTone();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  sourcePreview.src = sourceUrl;
  sourcePreview.hidden = false;
  uploadTitle.textContent = file.name;
  uploadHint.textContent = "Reference loaded · choose a study and run it";
  imageCaption.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  resultPreview.hidden = true;
  resultStage.hidden = true;
  regionTools.hidden = true;
  resultStage.hidden = true;
  regionTools.hidden = true;
  resultEmpty.hidden = false;
  downloadLink.hidden = true;
  setStatus(runtimeReady ? "Estimating a starting abstraction scale…" : "Image ready. Choose settings and create a study.");
  updateHistoryControls();
  updateRunButton();
  void prepareTonePreviewSource(file);
  void requestAbstractionEstimate();
};

const updateHistoryControls = () => {
  historyBack.disabled = studyIndex <= 0;
  historyForward.disabled = studyIndex < 0 || studyIndex >= studyHistory.length - 1;
  historyCount.textContent = studyIndex < 0 ? `0 / ${MAX_STUDY_HISTORY}` : `${studyIndex + 1} / ${studyHistory.length}`;
  saveSnapshotButton.disabled = studyIndex < 0;
};

const isTouchSelectionAvailable = () =>
  window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

const renderStudy = (study: Study) => {
  resultPreview.src = study.url;
  resultStage.hidden = false;
  resultPreview.hidden = false;
  resultEmpty.hidden = true;
  downloadLink.href = study.url;
  downloadLink.download = `${study.transform}-${study.createdAt.toISOString().replace(/[:.]/g, "-")}.png`;
  downloadLink.hidden = false;

  if (!study.regionLabels || !study.regionValues || !study.regionWidth || !study.regionHeight) {
    selectedRegionIds.clear();
    selectedRegionSeeds.clear();
    regionMultiSelectMode = false;
    regionTools.hidden = true;
    regionOverlay.hidden = true;
    regionColorOverlay.hidden = true;
    return;
  }

  regionTools.hidden = false;
  regionMultiSelectButton.hidden = !isTouchSelectionAvailable();
  regionMultiSelectButton.textContent = regionMultiSelectMode ? "Done selecting" : "Add regions";
  regionMultiSelectButton.setAttribute("aria-pressed", String(regionMultiSelectMode));
  regionOverlay.hidden = false;
  regionColorOverlay.hidden = false;
  const aspect = study.regionWidth / study.regionHeight;
  const maxWidth = Math.max(1, resultCard.clientWidth - 2);
  resultStage.style.width = `${Math.min(maxWidth, 430 * aspect)}px`;
  resultStage.style.aspectRatio = `${study.regionWidth} / ${study.regionHeight}`;
  regionOverlay.width = study.regionWidth;
  regionOverlay.height = study.regionHeight;
  regionColorOverlay.width = study.regionWidth;
  regionColorOverlay.height = study.regionHeight;
  updateRegionPaintChoices();
  regionWashOutput.value = `${regionWashSlider.value}%`;
  applyRegionPaintButton.disabled = selectedRegionIds.size === 0 || !regionPaintChoice.value;
  clearRegionPaintButton.disabled = selectedRegionIds.size === 0 || !(study.paintLayers?.some((layer) => layer.regionIds?.some((id) => selectedRegionIds.has(id))));
  renderPaintOverlay(study);
  renderRegionOverlay(study);
};

const describeRegionPaint = (study: Study, regionId: number) => {
  const layers = study.paintLayers ?? [];
  let layer: RegionPaintLayer | undefined;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    if (layers[index].regionIds?.includes(regionId)) {
      layer = layers[index];
      break;
    }
  }
  if (!layer) return "";
  const firstName = paintCatalog.find((paint) => paint.id === layer?.paintId)?.name ?? "Paint";
  const secondName = layer.secondPaintId
    ? paintCatalog.find((paint) => paint.id === layer?.secondPaintId)?.name
    : undefined;
  const ratio = layer.mixRatio ?? 0.5;
  const recipe = secondName
    ? `${firstName} ${Math.round(ratio * 100)}% + ${secondName} ${Math.round((1 - ratio) * 100)}%`
    : firstName;
  return ` · ${recipe} · Wash ${layer.washStrength}%`;
};

const renderRegionOverlay = (study: Study) => {
  if (!study.regionLabels || !study.regionWidth || !study.regionHeight) return;
  const context = regionOverlay.getContext("2d");
  if (!context || !study.regionValues) return;
  const image = context.createImageData(study.regionWidth, study.regionHeight);
  for (let index = 0; index < study.regionLabels.length; index += 1) {
    if (!selectedRegionIds.has(study.regionLabels[index])) continue;
    const pixel = index * 4;
    image.data[pixel] = 234;
    image.data[pixel + 1] = 151;
    image.data[pixel + 2] = 82;
    image.data[pixel + 3] = 112;
  }
  const drawPath = (points: { x: number; y: number }[], close = false) => {
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x * study.regionWidth!, points[0].y * study.regionHeight!);
    for (const point of points.slice(1)) context.lineTo(point.x * study.regionWidth!, point.y * study.regionHeight!);
    if (close) context.closePath();
    context.strokeStyle = "#315c45";
    context.lineWidth = Math.max(1.5, Math.min(study.regionWidth!, study.regionHeight!) / 170);
    context.setLineDash([5, 3]);
    context.stroke();
    context.setLineDash([]);
    if (close) {
      context.fillStyle = "rgb(88 125 103 / 18%)";
      context.fill();
    }
  };
  context.putImageData(image, 0, 0);
  for (const shape of pendingShapes) drawPath(shape, true);
  if (activeShapePoints.length > 1) drawPath(activeShapePoints);
  const selectedRegionsCount = selectedRegionSeeds.size;
  const selectedSeedId = selectedRegionSeeds.values().next().value;
  const paintDescription = selectedRegionsCount === 1 && selectedSeedId !== undefined
    ? describeRegionPaint(study, selectedSeedId)
    : "";
  regionSelectionLabel.textContent = selectedRegionsCount === 0
    ? (drawShapeMode
      ? "Draw one or more closed strokes on the study, then fill the shape."
      : regionMultiSelectMode
      ? "Tap any region to add it; similar-value growth stays connected to that tap."
      : "Click a region; ⌘/Ctrl-click adds seeds. Similar regions join only when touching.")
    : `${selectedRegionsCount} seed${selectedRegionsCount === 1 ? "" : "s"} · ${selectedRegionIds.size} region${selectedRegionIds.size === 1 ? "" : "s"} selected${regionMultiSelectMode ? "; each tap adds a separate connected selection" : ""}${paintDescription}`;
  regionMultiSelectButton.textContent = regionMultiSelectMode ? "Done selecting" : "Add regions";
  regionMultiSelectButton.setAttribute("aria-pressed", String(regionMultiSelectMode));
  combineRegionsButton.disabled = selectedRegionIds.size < 2 || pendingMergeRequest !== undefined;
  clearRegionSelectionButton.disabled = selectedRegionsCount === 0 || pendingMergeRequest !== undefined;
  regionToleranceSlider.disabled = selectedRegionsCount === 0 || pendingMergeRequest !== undefined;
  regionValueModeSelect.disabled = selectedRegionIds.size < 2 || pendingMergeRequest !== undefined;
  undoRegionMergeButton.hidden = regionMergeUndo?.mergedStudy !== study;
  undoRegionMergeButton.disabled = pendingMergeRequest !== undefined;
  applyRegionPaintButton.disabled = selectedRegionIds.size === 0 || !regionPaintChoice.value;
  clearRegionPaintButton.disabled = selectedRegionIds.size === 0 || !(study.paintLayers?.some((layer) => layer.regionIds?.some((id) => selectedRegionIds.has(id))));
  fillDrawnShapeButton.disabled = pendingShapes.length === 0 || !regionPaintChoice.value;
  clearDrawnShapesButton.disabled = pendingShapes.length === 0 && !(study.paintLayers?.some((layer) => layer.shapes?.length));
  drawFillShapeButton.setAttribute("aria-pressed", String(drawShapeMode));
  drawFillShapeButton.textContent = drawShapeMode ? "Finish drawing" : "Draw shape";
  regionOverlay.classList.toggle("is-drawing", drawShapeMode);
  regionOverlay.setAttribute("aria-label", drawShapeMode ? "Draw closed watercolor fill shapes" : "Selectable grayscale regions");
};

const regionTolerance = () => Math.round(64 * (Number(regionToleranceSlider.value) / 100) ** 2);

const updateRegionSelection = (study: Study) => {
  if (!study.regionValues || !study.regionLabels || !study.regionWidth || !study.regionHeight) return;
  const tolerance = regionTolerance();
  selectedRegionIds = new Set(selectedRegionSeeds);
  if (selectedRegionSeeds.size === 0 || tolerance === 0) return;

  const adjacency = Array.from({ length: study.regionValues.length }, () => new Set<number>());
  const { regionLabels: labels, regionWidth: width, regionHeight: height } = study;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = labels[index];
      if (x + 1 < width) {
        const right = labels[index + 1];
        if (current !== right) {
          adjacency[current].add(right);
          adjacency[right].add(current);
        }
      }
      if (y + 1 < height) {
        const below = labels[index + width];
        if (current !== below) {
          adjacency[current].add(below);
          adjacency[below].add(current);
        }
      }
    }
  }

  for (const seedId of selectedRegionSeeds) {
    if (seedId < 0 || seedId >= study.regionValues.length) continue;
    const seedValue = Number(study.regionValues[seedId]);
    const visited = new Set<number>([seedId]);
    const queue = [seedId];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const regionId = queue[cursor];
      for (const neighbor of adjacency[regionId] ?? []) {
        if (visited.has(neighbor)) continue;
        const value = Number(study.regionValues[neighbor]);
        if (Math.abs(value - seedValue) <= tolerance) {
          visited.add(neighbor);
          selectedRegionIds.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
};

const selectRegionAt = (event: MouseEvent) => {
  if (drawShapeMode) return;
  const study = studyHistory[studyIndex];
  if (!study?.regionLabels || !study.regionWidth || !study.regionHeight || pendingMergeRequest !== undefined) return;
  const bounds = regionOverlay.getBoundingClientRect();
  const x = Math.min(study.regionWidth - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * study.regionWidth)));
  const y = Math.min(study.regionHeight - 1, Math.max(0, Math.floor((event.clientY - bounds.top) / bounds.height * study.regionHeight)));
  const regionId = study.regionLabels[y * study.regionWidth + x];
  if (regionMultiSelectMode) {
    if (selectedRegionSeeds.has(regionId)) selectedRegionSeeds.delete(regionId);
    else selectedRegionSeeds.add(regionId);
  } else if (event.metaKey || event.ctrlKey) {
    if (selectedRegionSeeds.has(regionId)) selectedRegionSeeds.delete(regionId);
    else selectedRegionSeeds.add(regionId);
  } else {
    selectedRegionSeeds = selectedRegionSeeds.has(regionId) && selectedRegionSeeds.size === 1
      ? new Set()
      : new Set([regionId]);
  }
  updateRegionSelection(study);
  renderRegionOverlay(study);
};

const normalizedCanvasPoint = (event: PointerEvent) => {
  const bounds = regionOverlay.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
};

regionOverlay.addEventListener("pointerdown", (event) => {
  if (!drawShapeMode || !studyHistory[studyIndex]?.regionLabels) return;
  event.preventDefault();
  regionOverlay.setPointerCapture(event.pointerId);
  activeShapePoints = [normalizedCanvasPoint(event)];
  const study = studyHistory[studyIndex];
  if (study) renderRegionOverlay(study);
});

regionOverlay.addEventListener("pointermove", (event) => {
  if (!drawShapeMode || !regionOverlay.hasPointerCapture(event.pointerId)) return;
  event.preventDefault();
  const point = normalizedCanvasPoint(event);
  const previous = activeShapePoints[activeShapePoints.length - 1];
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.004) activeShapePoints.push(point);
  const study = studyHistory[studyIndex];
  if (study) renderRegionOverlay(study);
});

const finishShapeStroke = (event: PointerEvent) => {
  if (!regionOverlay.hasPointerCapture(event.pointerId)) return;
  if (activeShapePoints.length >= 3) pendingShapes.push(activeShapePoints);
  activeShapePoints = [];
  regionOverlay.releasePointerCapture(event.pointerId);
  const study = studyHistory[studyIndex];
  if (study) renderRegionOverlay(study);
};

regionOverlay.addEventListener("pointerup", finishShapeStroke);
regionOverlay.addEventListener("pointercancel", finishShapeStroke);

const appendStudy = (study: Study, completionMessage: string) => {
  regionMergeUndo = undefined;
  drawShapeMode = false;
  activeShapePoints = [];
  pendingShapes = [];
  studyHistory.push(study);
  if (studyHistory.length > MAX_STUDY_HISTORY) {
    const removed = studyHistory.shift();
    if (removed) URL.revokeObjectURL(removed.url);
  }
  studyIndex = studyHistory.length - 1;
  selectedRegionIds.clear();
  selectedRegionSeeds.clear();
  renderStudy(study);
  updateHistoryControls();
  setStatus(completionMessage, "success");
};

const undoRegionMerge = () => {
  if (!regionMergeUndo || studyHistory[studyIndex] !== regionMergeUndo.mergedStudy) return;
  const previousIndex = studyHistory.indexOf(regionMergeUndo.previousStudy);
  if (previousIndex < 0) return;
  regionMergeUndo = undefined;
  selectedRegionIds.clear();
  selectedRegionSeeds.clear();
  studyIndex = previousIndex;
  renderStudy(studyHistory[studyIndex]);
  updateHistoryControls();
  updateRunButton();
  setStatus("Region combination undone. The combined study remains in history.", "success");
};

const combineSelectedRegions = async () => {
  const study = studyHistory[studyIndex];
  if (
    !study?.regionLabels ||
    !study.regionValues ||
    !study.regionWidth ||
    !study.regionHeight ||
    selectedRegionIds.size < 2 ||
    pendingMergeRequest !== undefined
  ) return;

  const image = await study.blob.arrayBuffer();
  const regionBuffer = new ArrayBuffer(study.regionLabels.byteLength);
  new Uint8Array(regionBuffer).set(
    new Uint8Array(study.regionLabels.buffer, study.regionLabels.byteOffset, study.regionLabels.byteLength),
  );
  if (!study.regionValues) return;
  const regionValuesBuffer = new ArrayBuffer(study.regionValues.length);
  new Uint8Array(regionValuesBuffer).set(study.regionValues);
  const id = nextRequestId++;
  pendingMergeRequest = id;
  updateRunButton();
  renderRegionOverlay(study);
  setStatus("Combining selected regions…");
  worker.postMessage(
    {
      type: "merge-regions",
      id,
      image,
      regions: regionBuffer,
      regionValues: regionValuesBuffer,
      regionWidth: study.regionWidth,
      regionHeight: study.regionHeight,
      selectedRegions: [...selectedRegionIds],
      levels: study.transform === "notan" ? 2 : study.levels,
      valueMode: regionValueModeSelect.value as "mean" | "lighter" | "darker",
    },
    [image, regionBuffer, regionValuesBuffer],
  );
};

const getSnapshotFolderName = (filename: string) => {
  const stem = filename.replace(/\.[^.]+$/, "");
  return stem.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim() || "painting";
};

const writeSnapshotFile = async (directory: SnapshotDirectory, name: string, data: Blob | string) => {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
};

const nextSnapshotNumber = async (directory: SnapshotDirectory): Promise<number> => {
  let snapshotCount = 0;
  let highestRecordedNumber = 0;

  for await (const [name, entry] of directory.entries()) {
    if (entry.kind !== "file" || !name.endsWith(".json")) continue;
    snapshotCount += 1;
    try {
      const metadata: unknown = JSON.parse(await (await entry.getFile()).text());
      if (
        typeof metadata === "object" &&
        metadata !== null &&
        "snapshotNumber" in metadata &&
        typeof metadata.snapshotNumber === "number" &&
        Number.isSafeInteger(metadata.snapshotNumber)
      ) {
        highestRecordedNumber = Math.max(highestRecordedNumber, metadata.snapshotNumber);
      }
    } catch {
      // Count legacy or unreadable snapshot records so new numbers are not reused.
    }
  }

  return Math.max(snapshotCount, highestRecordedNumber) + 1;
};

const saveStudySnapshot = async (study: Study) => {
  if (!selectedFile) return;
  const picker = window as DirectoryPickerWindow;
  if (!snapshotRoot) {
    if (!picker.showDirectoryPicker) {
      setStatus("Folder saving is unavailable in this browser. Use Download PNG instead.", "error");
      return;
    }
    try {
      snapshotRoot = await picker.showDirectoryPicker({ mode: "readwrite" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Snapshot save cancelled.");
        return;
      }
      throw error;
    }
  }

  const folderName = getSnapshotFolderName(selectedFile.name);
  const paintingFolder = await snapshotRoot.getDirectoryHandle(folderName, { create: true });
  const snapshotNumber = await nextSnapshotNumber(paintingFolder);
  const timestamp = study.createdAt.toISOString().replace(/[:.]/g, "-");
  const transformName = study.transform;
  const sequence = String(snapshotNumber).padStart(4, "0");
  const imageName = `snapshot-${sequence}-${transformName}-${timestamp}.png`;
  const metadataName = `snapshot-${sequence}-${transformName}-${timestamp}.json`;
  const regionLabelsName = study.regionLabels
    ? `snapshot-${sequence}-${transformName}-${timestamp}.regions.bin`
    : undefined;
  const regionValuesName = study.regionValues
    ? `snapshot-${sequence}-${transformName}-${timestamp}.values.bin`
    : undefined;
  const snapshotImage = await createPaintedStudyBlob(study);
  if (!snapshotImage) throw new Error("Could not render the colorized snapshot image.");
  const metadata = {
    snapshotNumber,
    sourceImage: selectedFile.name,
    transform: study.transform,
    abstraction: study.abstraction,
    autoAbstraction: study.autoAbstraction,
    ...(study.transform === "grayscale" ? { grayscaleMethod: study.grayscaleMethod } : {}),
    exposure: study.exposure,
    shadows: study.shadows,
    highlights: study.highlights,
    workingResolution: study.workingResolution,
    palettePaintIds: study.palettePaintIds,
    paletteLimit: study.paletteLimit,
    ...(study.paintLayers?.length ? { paintLayers: study.paintLayers } : {}),
    ...(regionLabelsName && study.regionWidth && study.regionHeight
      ? { regionLabels: regionLabelsName, regionWidth: study.regionWidth, regionHeight: study.regionHeight }
      : {}),
    ...(regionValuesName ? { regionValues: regionValuesName } : {}),
    ...(study.transform === "grayscale" ? { levels: study.levels } : { thresholdMethod: study.thresholdMethod }),
    createdAt: study.createdAt.toISOString(),
    image: imageName,
  };

  await writeSnapshotFile(paintingFolder, imageName, snapshotImage);
  if (regionLabelsName && study.regionLabels) {
    const regionBytes = new Uint8Array(study.regionLabels.buffer, study.regionLabels.byteOffset, study.regionLabels.byteLength);
    await writeSnapshotFile(paintingFolder, regionLabelsName, new Blob([regionBytes.slice().buffer]));
  }
  if (regionValuesName && study.regionValues) {
    const regionValueBytes = new Uint8Array(study.regionValues.length);
    regionValueBytes.set(study.regionValues);
    await writeSnapshotFile(paintingFolder, regionValuesName, new Blob([regionValueBytes.buffer]));
  }
  await writeSnapshotFile(paintingFolder, metadataName, JSON.stringify(metadata, null, 2));
  study.saved = true;
  study.snapshotNumber = snapshotNumber;
  setStatus(`Snapshot #${snapshotNumber} saved in ${folderName}/${imageName}.`, "success");
};

const offerSnapshotSave = async (study: Study) => {
  if (!promptSaveCheckbox.checked || study.saved) return;
  if (window.confirm("Save a snapshot of this study now?")) {
    try {
      await saveStudySnapshot(study);
    } catch (error) {
      setStatus(error instanceof Error ? `Could not save snapshot: ${error.message}` : String(error), "error");
    }
  }
};

const showStudy = async (index: number) => {
  if (index < 0 || index >= studyHistory.length || index === studyIndex) return;
  studyIndex = index;
  const study = studyHistory[studyIndex];
  paintingPalettePaintIds = new Set((study.palettePaintIds ?? [...selectedPaintIds]).filter((id) => selectedPaintIds.has(id)));
  paintingPaletteLimitInput.value = String(study.paletteLimit ?? Number(paintingPaletteLimitInput.value));
  paintingPaletteCustomized = true;
  renderPaintCatalog();
  get<HTMLInputElement>(`input[name="transform"][value="${study.transform}"]`).checked = true;
  abstractionSlider.value = String(study.abstraction);
  autoAbstraction = study.autoAbstraction;
  abstractionOutput.value = study.autoAbstraction ? `Auto · ${study.abstraction}×` : `${study.abstraction}×`;
  levelsSlider.value = String(study.levels);
  levelsOutput.value = String(study.levels);
  grayscaleMethodSelect.value = study.grayscaleMethod;
  thresholdSelect.value = study.thresholdMethod;
  exposureSlider.value = String(study.exposure);
  shadowsSlider.value = String(study.shadows);
  highlightsSlider.value = String(study.highlights);
  workingResolutionSelect.value = String(study.workingResolution);
  updateToneLabels();
  scheduleTonePreview();
  updateSettings();
  selectedRegionIds.clear();
  selectedRegionSeeds.clear();
  drawShapeMode = false;
  activeShapePoints = [];
  pendingShapes = [];
  renderStudy(study);
  updateHistoryControls();
  setStatus(`${study.transform === "notan" ? "Notan" : "Grayscale"} study · ${study.abstraction}× abstraction`);
  await offerSnapshotSave(study);
};

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) setSelectedFile(file);
});

regionOverlay.addEventListener("click", selectRegionAt);
paintSearchInput.addEventListener("input", renderPaintCatalog);
paintBrandFilter.addEventListener("change", renderPaintCatalog);
paintResults.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.paintId) return;
  if (target.checked) selectedPaintIds.add(target.dataset.paintId);
  else selectedPaintIds.delete(target.dataset.paintId);
  saveSelectedPaintIds();
  syncPaintingPaletteToInventory();
  savePaintingPaletteOnStudy(activeStudy());
  renderPaintCatalog();
  const study = studyHistory[studyIndex];
  if (study) {
    renderPaintOverlay(study);
    void updateStudyDownload(study);
  }
});
selectedPaintsElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.removePaintId) return;
  selectedPaintIds.delete(target.dataset.removePaintId);
  saveSelectedPaintIds();
  syncPaintingPaletteToInventory();
  savePaintingPaletteOnStudy(activeStudy());
  renderPaintCatalog();
  const study = studyHistory[studyIndex];
  if (study) {
    renderPaintOverlay(study);
    void updateStudyDownload(study);
  }
});
selectedPaintsElement.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.paintingPaletteId) return;
  const paintId = target.dataset.paintingPaletteId;
  const limit = Math.max(1, Math.min(20, Number(paintingPaletteLimitInput.value) || 1));
  if (target.checked && paintingPalettePaintIds.size >= limit) {
    target.checked = false;
    setStatus(`This painting is limited to ${limit} ${limit === 1 ? "color" : "colors"}. Increase the limit before adding another paint.`, "error");
    return;
  }
  if (target.checked) paintingPalettePaintIds.add(paintId);
  else paintingPalettePaintIds.delete(paintId);
  paintingPaletteCustomized = true;
  savePaintingPaletteOnStudy(activeStudy());
  updateRegionPaintChoices();
  renderPaintCatalog();
});
paintingPaletteLimitInput.addEventListener("change", () => {
  const limit = Math.max(1, Math.min(20, Number(paintingPaletteLimitInput.value) || 1));
  paintingPaletteLimitInput.value = String(limit);
  if (!paintingPaletteCustomized) {
    paintingPalettePaintIds = defaultPaintingPalette();
  } else if (paintingPalettePaintIds.size > limit) {
    paintingPalettePaintIds = new Set(
      paintCatalog.filter((paint) => paintingPalettePaintIds.has(paint.id)).slice(0, limit).map((paint) => paint.id),
    );
    paintingPaletteCustomized = true;
  }
  savePaintingPaletteOnStudy(activeStudy());
  renderPaintCatalog();
  const study = activeStudy();
  if (study) {
    renderPaintOverlay(study);
    renderRegionOverlay(study);
    void updateStudyDownload(study);
  }
});
autoSelectPaletteButton.addEventListener("click", () => { void autoSelectPaintingPalette(); });
selectedPaintsElement.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.swatchPaintId) return;
  selectedPaintSwatches.set(target.dataset.swatchPaintId, target.value.toUpperCase());
  saveSelectedPaintSwatches();
  const paint = paintCatalog.find((entry) => entry.id === target.dataset.swatchPaintId);
  const swatch = target.closest<HTMLElement>(".selected-paint-swatch");
  if (swatch) {
    swatch.style.backgroundColor = target.value;
    swatch.classList.remove("selected-paint-swatch-unavailable", "selected-paint-swatch-lab");
    swatch.classList.add("selected-paint-swatch-custom");
    swatch.title = `Your saved swatch for ${paint?.name ?? "paint"}. Tap to change it.`;
    swatch.setAttribute("aria-label", `Your color swatch for ${paint?.name ?? "paint"}`);
    const hint = swatch.querySelector(".selected-paint-swatch-hint");
    if (hint) hint.textContent = "Edit";
  }
  const resultSwatch = paintResults.querySelector<HTMLElement>(`.paint-result-swatch[data-swatch-paint-id="${CSS.escape(target.dataset.swatchPaintId)}"]`);
  if (resultSwatch) {
    resultSwatch.style.backgroundColor = target.value;
    resultSwatch.classList.remove("paint-result-swatch-unavailable", "paint-result-swatch-lab");
    resultSwatch.classList.add("paint-result-swatch-custom");
    resultSwatch.title = `Your display swatch for ${paint?.name ?? "paint"}`;
    resultSwatch.setAttribute("aria-label", `Your swatch for ${paint?.name ?? "paint"}`);
  }
  const study = studyHistory[studyIndex];
  if (study) {
    renderPaintOverlay(study);
    void updateStudyDownload(study);
  }
});
regionPaintChoice.addEventListener("change", () => {
  applyRegionPaintButton.disabled = selectedRegionIds.size === 0 || !regionPaintChoice.value;
  fillDrawnShapeButton.disabled = pendingShapes.length === 0 || !regionPaintChoice.value;
});
regionWashSlider.addEventListener("input", () => {
  regionWashOutput.value = `${regionWashSlider.value}%`;
});
applyRegionPaintButton.addEventListener("click", applyPaintToSelectedRegions);
clearRegionPaintButton.addEventListener("click", clearPaintFromSelectedRegions);
autoAssignPaintsButton.addEventListener("click", () => { void autoAssignPalette(); });
drawFillShapeButton.addEventListener("click", () => {
  drawShapeMode = !drawShapeMode;
  regionMultiSelectMode = false;
  const study = studyHistory[studyIndex];
  if (study?.regionLabels) renderRegionOverlay(study);
});
fillDrawnShapeButton.addEventListener("click", fillDrawnShapes);
clearDrawnShapesButton.addEventListener("click", clearDrawnShapes);
regionMultiSelectButton.addEventListener("click", () => {
  regionMultiSelectMode = !regionMultiSelectMode;
  const study = studyHistory[studyIndex];
  if (study?.regionLabels) renderRegionOverlay(study);
});
regionValueModeSelect.addEventListener("change", () => {
  const activeStudy = studyHistory[studyIndex];
  if (activeStudy?.regionLabels) renderRegionOverlay(activeStudy);
});
regionToleranceSlider.addEventListener("input", () => {
  regionToleranceOutput.value = String(regionTolerance());
  const study = studyHistory[studyIndex];
  if (!study) return;
  updateRegionSelection(study);
  renderRegionOverlay(study);
});
clearRegionSelectionButton.addEventListener("click", () => {
  selectedRegionIds.clear();
  selectedRegionSeeds.clear();
  const study = studyHistory[studyIndex];
  if (study) renderRegionOverlay(study);
});
undoRegionMergeButton.addEventListener("click", undoRegionMerge);
combineRegionsButton.addEventListener("click", () => {
  void combineSelectedRegions();
});

let regionResizeFrame: number | undefined;
new ResizeObserver(() => {
  if (regionResizeFrame !== undefined) return;
  regionResizeFrame = requestAnimationFrame(() => {
    regionResizeFrame = undefined;
    const study = studyHistory[studyIndex];
    if (study?.regionLabels) renderStudy(study);
  });
}).observe(resultCard);

for (const eventName of ["dragenter", "dragover"] as const) {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadCard.dataset.dragging = "true";
  });
}
for (const eventName of ["dragleave", "drop"] as const) {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    delete uploadCard.dataset.dragging;
  });
}
uploadCard.addEventListener("drop", (event) => {
  const file = (event as DragEvent).dataTransfer?.files[0];
  if (file) setSelectedFile(file);
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="transform"]')) {
  radio.addEventListener("change", updateSettings);
}
grayscaleMethodSelect.addEventListener("change", updateSettings);

abstractionSlider.addEventListener("input", () => {
  autoAbstraction = false;
  abstractionOutput.value = `${abstractionSlider.value}×`;
});
for (const slider of [exposureSlider, shadowsSlider, highlightsSlider]) {
  slider.addEventListener("input", () => {
    updateToneLabels();
    scheduleTonePreview();
  });
}
get<HTMLButtonElement>("#tone-reset").addEventListener("click", resetTone);
levelsSlider.addEventListener("input", () => {
  levelsOutput.value = levelsSlider.value;
});

workingResolutionSelect.addEventListener("change", () => {
  autoAbstractionScale = undefined;
  tonePreviewSource = undefined;
  tonePreviewSourceFile = undefined;
  tonePreviewResolution = undefined;
  pendingTonePreviewId = undefined;
  if (selectedFile) void prepareTonePreviewSource(selectedFile);
  if (autoAbstraction) {
    pendingEstimateId = undefined;
    void requestAbstractionEstimate();
  }
});

historyBack.addEventListener("click", () => {
  void showStudy(studyIndex - 1);
});
historyForward.addEventListener("click", () => {
  void showStudy(studyIndex + 1);
});
saveSnapshotButton.addEventListener("click", async () => {
  if (studyIndex < 0) return;
  try {
    await saveStudySnapshot(studyHistory[studyIndex]);
  } catch (error) {
    setStatus(error instanceof Error ? `Could not save snapshot: ${error.message}` : String(error), "error");
  }
});
promptSaveCheckbox.addEventListener("change", async () => {
  if (!promptSaveCheckbox.checked || snapshotRoot) return;
  const picker = window as DirectoryPickerWindow;
  if (!picker.showDirectoryPicker) {
    setStatus("Automatic folder saving is unavailable in this browser. You can still download PNGs.", "error");
    promptSaveCheckbox.checked = false;
    return;
  }
  try {
    snapshotRoot = await picker.showDirectoryPicker({ mode: "readwrite" });
    setStatus("Save folder selected. You’ll be asked before each new study is saved.", "success");
  } catch (error) {
    promptSaveCheckbox.checked = false;
    if (error instanceof DOMException && error.name === "AbortError") {
      setStatus("Save prompt is off; no folder was selected.");
      return;
    }
    setStatus(error instanceof Error ? `Could not select save folder: ${error.message}` : String(error), "error");
  }
});

worker.addEventListener("message", async (event: MessageEvent<WorkerReply>) => {
  const message = event.data;
  if (message.type === "ready") {
    runtimeReady = true;
    setRuntimeState(`Python ${message.pythonVersion} · ready`, "ready");
    setStatus(`Runtime ${message.runtimeLoadMs} ms · image packages ${message.packageLoadMs} ms`, "success");
    performanceNote.textContent = `Runtime ${message.runtimeLoadMs} ms · packages ${message.packageLoadMs} ms`;
    updateRunButton();
    void requestAbstractionEstimate();
    scheduleTonePreview();
    return;
  }

  if (message.type === "tone-preview") {
    if (message.id !== pendingTonePreviewId || toneSettingsAreNeutral()) return;
    pendingTonePreviewId = undefined;
    if (tonePreviewUrl) URL.revokeObjectURL(tonePreviewUrl);
    tonePreviewUrl = URL.createObjectURL(new Blob([message.image], { type: "image/png" }));
    sourcePreview.src = tonePreviewUrl;
    uploadHint.textContent = "Live tone preview · full resolution on Create study";
    return;
  }

  if (message.type === "estimate") {
    if (message.id !== pendingEstimateId) return;
    pendingEstimateId = undefined;
    autoAbstractionScale = message.abstraction;
    if (autoAbstraction) {
      abstractionSlider.value = String(message.abstraction);
      abstractionOutput.value = `Auto · ${message.abstraction}×`;
      setStatus(`Suggested abstraction: ${message.abstraction}× · adjust if desired.`, "success");
    }
    updateRunButton();
    return;
  }

  if (message.type === "error") {
    if (message.id !== undefined && message.id === pendingMergeRequest) {
      pendingMergeRequest = undefined;
      const currentStudy = studyHistory[studyIndex];
      if (currentStudy) renderRegionOverlay(currentStudy);
      setStatus(`Could not combine regions: ${message.message}`, "error");
      updateRunButton();
      return;
    }
    if (message.id !== undefined && message.id === pendingTonePreviewId) {
      pendingTonePreviewId = undefined;
      uploadHint.textContent = "Live preview failed · Create study uses the full image";
      return;
    }
    if (message.id !== undefined && message.id === pendingEstimateId) {
      pendingEstimateId = undefined;
      setStatus(`Could not estimate image detail: ${message.message}`, "error");
      updateRunButton();
      return;
    }
    if (message.id !== undefined && message.id !== pendingRequest) return;
    pendingRequest = undefined;
    if (message.id === undefined) {
      runtimeReady = false;
      setRuntimeState("Python runtime failed", "error");
    }
    setStatus(message.message, "error");
    updateRunButton();
    return;
  }

  if (message.type === "merge-complete") {
    if (message.id !== pendingMergeRequest) return;
    pendingMergeRequest = undefined;
    const previousStudy = studyHistory[studyIndex];
    if (!previousStudy) return;
    const blob = new Blob([message.image], { type: "image/png" });
    const mergedStudy: Study = {
      ...previousStudy,
      blob,
      url: URL.createObjectURL(blob),
      regionLabels: new Uint32Array(message.regions),
      regionValues: new Uint8Array(message.regionValues),
      regionWidth: message.regionWidth,
      regionHeight: message.regionHeight,
      paintLayers: [],
      createdAt: new Date(),
      saved: false,
      snapshotNumber: undefined,
    };
    appendStudy(mergedStudy, "Regions combined into a new grayscale study.");
    regionMergeUndo = { previousStudy, mergedStudy };
    renderRegionOverlay(mergedStudy);
    updateRunButton();
    await offerSnapshotSave(mergedStudy);
    return;
  }

  if (message.id !== pendingRequest) return;
  pendingRequest = undefined;
  const blob = new Blob([message.image], { type: "image/png" });
  const study: Study = {
    blob,
    url: URL.createObjectURL(blob),
    transform: selectedTransform(),
    abstraction: Number(abstractionSlider.value),
    autoAbstraction,
    levels: Number(levelsSlider.value),
    grayscaleMethod: grayscaleMethodSelect.value as Study["grayscaleMethod"],
    thresholdMethod: thresholdSelect.value,
    exposure: Number(exposureSlider.value),
    shadows: Number(shadowsSlider.value),
    highlights: Number(highlightsSlider.value),
    workingResolution: Number(workingResolutionSelect.value),
      palettePaintIds: [...paintingPalettePaintIds],
      paletteLimit: Number(paintingPaletteLimitInput.value),
    ...(message.regions && message.regionWidth && message.regionHeight
      ? {
          regionLabels: new Uint32Array(message.regions),
          ...(message.regionValues ? { regionValues: new Uint8Array(message.regionValues) } : {}),
          regionWidth: message.regionWidth,
          regionHeight: message.regionHeight,
        }
      : {}),
    createdAt: new Date(),
    saved: false,
  };
  appendStudy(study, `Study complete in ${message.transformMs} ms.`);
  await offerSnapshotSave(study);
  updateRunButton();
});

worker.addEventListener("error", (event) => {
  runtimeReady = false;
  setRuntimeState("Python worker error", "error");
  setStatus(event.message || "The Python worker could not start.", "error");
  updateRunButton();
});

runButton.addEventListener("click", async () => {
  if (!selectedFile || !runtimeReady || pendingRequest !== undefined) return;
  const image = await selectedFile.arrayBuffer();
  const id = nextRequestId++;
  pendingRequest = id;
  updateRunButton();
  setStatus("Applying the Python transform in the background worker…");
  worker.postMessage(
    {
      type: "transform",
      id,
      image,
      transform: selectedTransform(),
      abstraction: Number(abstractionSlider.value),
      levels: Number(levelsSlider.value),
      grayscaleMethod: grayscaleMethodSelect.value,
      thresholdMethod: thresholdSelect.value,
      exposure: Number(exposureSlider.value),
      shadows: Number(shadowsSlider.value),
      highlights: Number(highlightsSlider.value),
      workingResolution: Number(workingResolutionSelect.value),
    },
    [image],
  );
});

updateSettings();
renderPaintCatalog();
updateToneLabels();
updateRunButton();
setRuntimeState("Loading Pyodide runtime…", "loading");
worker.postMessage({ type: "initialize", modules });
