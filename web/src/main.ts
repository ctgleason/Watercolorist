import abstractionSource from "../../src/watercolorist/abstraction.py?raw";
import defaultsSource from "../../src/watercolorist/defaults.py?raw";
import initSource from "../../src/watercolorist/__init__.py?raw";
import imagesSource from "../../src/watercolorist/images.py?raw";
import transformsSource from "../../src/watercolorist/transforms.py?raw";
import "./style.css";

type TransformName = "notan" | "grayscale";

type Study = {
  blob: Blob;
  url: string;
  transform: TransformName;
  abstraction: number;
  autoAbstraction: boolean;
  levels: number;
  grayscaleMethod: "even" | "adaptive-regions";
  thresholdMethod: string;
  exposure: number;
  shadows: number;
  highlights: number;
  workingResolution: number;
  regionLabels?: Uint32Array;
  regionValues?: Uint8Array;
  regionWidth?: number;
  regionHeight?: number;
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
            <input id="levels" type="range" min="2" max="9" step="1" value="5" />
            <div class="range-ends"><span>2 values</span><span>9 values</span></div>
            <label for="grayscale-method">Value mapping</label>
            <select id="grayscale-method">
              <option value="even">Even steps</option>
              <option value="adaptive-regions">Adaptive regions</option>
            </select>
            <p class="setting-help">Finds coherent areas and assigns values by their relative lightness.</p>
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
const toneSummary = get<HTMLOutputElement>("#tone-summary");
const exposureSlider = get<HTMLInputElement>("#exposure");
const exposureOutput = get<HTMLOutputElement>("#exposure-output");
const shadowsSlider = get<HTMLInputElement>("#shadows");
const shadowsOutput = get<HTMLOutputElement>("#shadows-output");
const highlightsSlider = get<HTMLInputElement>("#highlights");
const highlightsOutput = get<HTMLOutputElement>("#highlights-output");
const workingResolutionSelect = get<HTMLSelectElement>("#working-resolution");

let runtimeReady = false;
let selectedFile: File | undefined;
let sourceUrl: string | undefined;
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
let regionMultiSelectMode = false;
let pendingMergeRequest: number | undefined;
let regionMergeUndo: RegionMergeUndo | undefined;

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
    return;
  }

  regionTools.hidden = false;
  regionMultiSelectButton.hidden = !isTouchSelectionAvailable();
  regionMultiSelectButton.textContent = regionMultiSelectMode ? "Done selecting" : "Add regions";
  regionMultiSelectButton.setAttribute("aria-pressed", String(regionMultiSelectMode));
  regionOverlay.hidden = false;
  const aspect = study.regionWidth / study.regionHeight;
  const maxWidth = Math.max(1, resultCard.clientWidth - 2);
  resultStage.style.width = `${Math.min(maxWidth, 430 * aspect)}px`;
  resultStage.style.aspectRatio = `${study.regionWidth} / ${study.regionHeight}`;
  regionOverlay.width = study.regionWidth;
  regionOverlay.height = study.regionHeight;
  renderRegionOverlay(study);
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
  context.putImageData(image, 0, 0);
  const selectedRegionsCount = selectedRegionSeeds.size;
  regionSelectionLabel.textContent = selectedRegionsCount === 0
    ? (regionMultiSelectMode
      ? "Tap any region to add it; similar-value growth stays connected to that tap."
      : "Click a region; ⌘/Ctrl-click adds seeds. Similar regions join only when touching.")
    : `${selectedRegionsCount} seed${selectedRegionsCount === 1 ? "" : "s"} · ${selectedRegionIds.size} region${selectedRegionIds.size === 1 ? "" : "s"} selected${regionMultiSelectMode ? "; each tap adds a separate connected selection" : ""}`;
  regionMultiSelectButton.textContent = regionMultiSelectMode ? "Done selecting" : "Add regions";
  regionMultiSelectButton.setAttribute("aria-pressed", String(regionMultiSelectMode));
  combineRegionsButton.disabled = selectedRegionIds.size < 2 || pendingMergeRequest !== undefined;
  clearRegionSelectionButton.disabled = selectedRegionsCount === 0 || pendingMergeRequest !== undefined;
  regionToleranceSlider.disabled = selectedRegionsCount === 0 || pendingMergeRequest !== undefined;
  regionValueModeSelect.disabled = selectedRegionIds.size < 2 || pendingMergeRequest !== undefined;
  undoRegionMergeButton.hidden = regionMergeUndo?.mergedStudy !== study;
  undoRegionMergeButton.disabled = pendingMergeRequest !== undefined;
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

const appendStudy = (study: Study, completionMessage: string) => {
  regionMergeUndo = undefined;
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
    ...(regionLabelsName && study.regionWidth && study.regionHeight
      ? { regionLabels: regionLabelsName, regionWidth: study.regionWidth, regionHeight: study.regionHeight }
      : {}),
    ...(regionValuesName ? { regionValues: regionValuesName } : {}),
    ...(study.transform === "grayscale" ? { levels: study.levels } : { thresholdMethod: study.thresholdMethod }),
    createdAt: study.createdAt.toISOString(),
    image: imageName,
  };

  await writeSnapshotFile(paintingFolder, imageName, study.blob);
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
updateToneLabels();
updateRunButton();
setRuntimeState("Loading Pyodide runtime…", "loading");
worker.postMessage({ type: "initialize", modules });
