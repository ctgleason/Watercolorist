type TransformRequest = {
  type: "transform";
  id: number;
  image: ArrayBuffer;
  transform: "notan" | "grayscale";
  abstraction: number;
  levels: number;
  grayscaleMethod: "even" | "histogram" | "edge-guided" | "coherent-regions" | "adaptive-regions";
  thresholdMethod: string;
  exposure: number;
  shadows: number;
  highlights: number;
  workingResolution: number;
};

type MergeRegionsRequest = {
  type: "merge-regions";
  id: number;
  image: ArrayBuffer;
  regions: ArrayBuffer;
  regionValues: ArrayBuffer;
  regionWidth: number;
  regionHeight: number;
  selectedRegions: number[];
  levels: number;
  valueMode: "mean" | "lighter" | "darker";
};

type EstimateRequest = {
  type: "estimate";
  id: number;
  image: ArrayBuffer;
  workingResolution: number;
};

type TonePreviewRequest = {
  type: "tone-preview";
  id: number;
  image: ArrayBuffer;
  exposure: number;
  shadows: number;
  highlights: number;
};

type WorkerRequest =
  | { type: "initialize"; modules: Record<string, string> }
  | EstimateRequest
  | TonePreviewRequest
  | MergeRegionsRequest
  | TransformRequest;

type WorkerResponse =
  | {
      type: "ready";
      pythonVersion: string;
      runtimeLoadMs: number;
      packageLoadMs: number;
    }
  | { type: "estimate"; id: number; abstraction: number }
  | { type: "tone-preview"; id: number; image: ArrayBuffer }
  | {
      type: "merge-complete";
      id: number;
      image: ArrayBuffer;
      regions: ArrayBuffer;
      regionValues: ArrayBuffer;
      regionWidth: number;
      regionHeight: number;
    }
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
  | { type: "error"; id?: number; message: string };

type WorkerContext = {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ) => void;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

const workerContext = globalThis as unknown as WorkerContext;
const pyodideIndexUrl = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
type PyodideRuntime = {
  FS: {
    mkdir: (path: string) => void;
    unlink: (path: string) => void;
    writeFile: (path: string, data: string | Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
  };
  globals: { set: (name: string, value: unknown) => void };
  loadPackage: (packages: string[]) => Promise<void>;
  runPython: (source: string) => unknown;
  runPythonAsync: (source: string) => Promise<unknown>;
};
type PyodideLoader = (options: { indexURL: string }) => Promise<PyodideRuntime>;

let pyodide: PyodideRuntime | undefined;
let initialization: Promise<void> | undefined;
let messageQueue = Promise.resolve();

const initialize = async (modules: Record<string, string>) => {
  const runtimeStartedAt = performance.now();
  const pyodideModuleUrl = `${pyodideIndexUrl}pyodide.mjs`;
  const { loadPyodide } = (await import(
    /* @vite-ignore */ pyodideModuleUrl
  )) as { loadPyodide: PyodideLoader };
  pyodide = await loadPyodide({ indexURL: pyodideIndexUrl });
  const runtimeLoadMs = Math.round(performance.now() - runtimeStartedAt);

  const packageStartedAt = performance.now();
  await pyodide.loadPackage(["numpy", "pillow"]);
  const packageLoadMs = Math.round(performance.now() - packageStartedAt);

  pyodide.FS.mkdir("/watercolorist");
  for (const [filename, source] of Object.entries(modules)) {
    pyodide.FS.writeFile(`/watercolorist/${filename}`, source);
  }
  await pyodide.runPythonAsync('import sys\nsys.path.insert(0, "/")');
  const pythonVersion = pyodide.runPython("import sys; sys.version.split()[0]") as string;

  workerContext.postMessage({
    type: "ready",
    pythonVersion,
    runtimeLoadMs,
    packageLoadMs,
  });
};

const handleMessage = async (data: WorkerRequest) => {
  const cleanupPaths: string[] = [];
  try {
    if (data.type === "initialize") {
      initialization ??= initialize(data.modules);
      await initialization;
      return;
    }

    if (!initialization || !pyodide) {
      throw new Error("The Python runtime is not initialized yet.");
    }
    await initialization;

    const inputPath = `/watercolorist-input-${data.id}`;
    pyodide.FS.writeFile(inputPath, new Uint8Array(data.image));
    cleanupPaths.push(inputPath);

    if (data.type === "estimate") {
      await pyodide.runPythonAsync("from watercolorist.images import load_rgb\nfrom watercolorist.defaults import estimate_abstraction");
      pyodide.globals.set("_watercolorist_working_resolution", data.workingResolution);
      const abstraction = pyodide.runPython(
        `estimate_abstraction(load_rgb(${JSON.stringify(inputPath)}), working_resolution=_watercolorist_working_resolution)`,
      ) as number;
      pyodide.FS.unlink(inputPath);
      workerContext.postMessage({ type: "estimate", id: data.id, abstraction });
      return;
    }

    const startedAt = performance.now();
    if (data.type === "tone-preview") {
      pyodide.globals.set("_watercolorist_exposure", data.exposure);
      pyodide.globals.set("_watercolorist_shadows", data.shadows);
      pyodide.globals.set("_watercolorist_highlights", data.highlights);
      const outputPath = `/watercolorist-output-${data.id}.png`;
      cleanupPaths.push(outputPath);
      await pyodide.runPythonAsync(`
from watercolorist.images import load_rgb
from watercolorist.transforms import adjust_tone

_preview = adjust_tone(
  load_rgb(${JSON.stringify(inputPath)}),
    exposure=_watercolorist_exposure,
    shadows=_watercolorist_shadows,
    highlights=_watercolorist_highlights,
)
_preview.save(${JSON.stringify(outputPath)}, format="PNG")
`);
      const previewOutput = pyodide.FS.readFile(outputPath);
      const previewImage = new ArrayBuffer(previewOutput.byteLength);
      new Uint8Array(previewImage).set(previewOutput);
      pyodide.FS.unlink(outputPath);
      pyodide.FS.unlink(inputPath);
      workerContext.postMessage(
        { type: "tone-preview", id: data.id, image: previewImage },
        [previewImage],
      );
      return;
    }

    if (data.type === "merge-regions") {
      const regionPath = `/watercolorist-regions-${data.id}.bin`;
      const regionValuesPath = `/watercolorist-region-values-${data.id}.bin`;
      const outputPath = `/watercolorist-output-${data.id}.png`;
      const outputRegionsPath = `/watercolorist-regions-merged-${data.id}.bin`;
      const outputRegionValuesPath = `/watercolorist-region-values-merged-${data.id}.bin`;
      cleanupPaths.push(regionPath, regionValuesPath, outputPath, outputRegionsPath, outputRegionValuesPath);
      pyodide.FS.writeFile(regionPath, new Uint8Array(data.regions));
      pyodide.FS.writeFile(regionValuesPath, new Uint8Array(data.regionValues));
      pyodide.globals.set("_watercolorist_levels", data.levels);
      await pyodide.runPythonAsync(`
import numpy as np
from PIL import Image
from watercolorist.transforms import merge_grayscale_regions

_labels = np.frombuffer(open(${JSON.stringify(regionPath)}, "rb").read(), dtype=np.uint32).copy()
_labels = _labels.reshape((${data.regionHeight}, ${data.regionWidth}))
_values = np.frombuffer(open(${JSON.stringify(regionValuesPath)}, "rb").read(), dtype=np.uint8).copy()
_merged_image, _merged_labels, _merged_values = merge_grayscale_regions(
    Image.open(${JSON.stringify(inputPath)}).convert("L"),
    _labels,
    _values,
    ${JSON.stringify(data.selectedRegions)},
    _watercolorist_levels,
    value_mode=${JSON.stringify(data.valueMode)},
)
_merged_image.save(${JSON.stringify(outputPath)}, format="PNG")
with open(${JSON.stringify(outputRegionsPath)}, "wb") as _region_file:
    _region_file.write(_merged_labels.tobytes())
with open(${JSON.stringify(outputRegionValuesPath)}, "wb") as _region_values_file:
    _region_values_file.write(_merged_values.tobytes())
`);
      const output = pyodide.FS.readFile(outputPath);
      const image = new ArrayBuffer(output.byteLength);
      new Uint8Array(image).set(output);
      const mergedRegions = pyodide.FS.readFile(outputRegionsPath);
      const regions = new ArrayBuffer(mergedRegions.byteLength);
      new Uint8Array(regions).set(mergedRegions);
      const mergedRegionValues = pyodide.FS.readFile(outputRegionValuesPath);
      const regionValues = new ArrayBuffer(mergedRegionValues.byteLength);
      new Uint8Array(regionValues).set(mergedRegionValues);
      for (const path of cleanupPaths) pyodide.FS.unlink(path);
      workerContext.postMessage(
        {
          type: "merge-complete",
          id: data.id,
          image,
          regions,
          regionValues,
          regionWidth: data.regionWidth,
          regionHeight: data.regionHeight,
        },
        [image, regions, regionValues],
      );
      return;
    }

    pyodide.globals.set("_watercolorist_transform", data.transform);
    pyodide.globals.set("_watercolorist_abstraction", data.abstraction);
    pyodide.globals.set("_watercolorist_levels", data.levels);
    pyodide.globals.set("_watercolorist_grayscale_method", data.grayscaleMethod);
    pyodide.globals.set("_watercolorist_threshold_method", data.thresholdMethod);
    pyodide.globals.set("_watercolorist_exposure", data.exposure);
    pyodide.globals.set("_watercolorist_shadows", data.shadows);
    pyodide.globals.set("_watercolorist_highlights", data.highlights);
    pyodide.globals.set("_watercolorist_working_resolution", data.workingResolution);

    const outputPath = `/watercolorist-output-${data.id}.png`;
    cleanupPaths.push(outputPath);
    await pyodide.runPythonAsync(`
from watercolorist.images import load_rgb
from watercolorist.transforms import _region_map_for_grayscale, grayscale_study_with_regions, notan_study

_source = load_rgb(${JSON.stringify(inputPath)})
_region_labels = None
_region_values = None
if _watercolorist_transform == "notan":
    _study = notan_study(
        _source,
        threshold_method=_watercolorist_threshold_method,
        abstraction=_watercolorist_abstraction,
        exposure=_watercolorist_exposure,
        shadows=_watercolorist_shadows,
        highlights=_watercolorist_highlights,
        working_resolution=_watercolorist_working_resolution,
    )
    _region_labels, _region_values = _region_map_for_grayscale(_study)
else:
    _study, _region_labels, _region_values = grayscale_study_with_regions(
        _source,
        levels=_watercolorist_levels,
        abstraction=_watercolorist_abstraction,
        grayscale_method=_watercolorist_grayscale_method,
        exposure=_watercolorist_exposure,
        shadows=_watercolorist_shadows,
        highlights=_watercolorist_highlights,
        working_resolution=_watercolorist_working_resolution,
    )
_study.save(${JSON.stringify(outputPath)}, format="PNG")
if _region_labels is not None:
    _region_height, _region_width = _region_labels.shape
    with open(${JSON.stringify(`/watercolorist-region-values-${data.id}.bin`)}, "wb") as _region_values_file:
        _region_values_file.write(_region_values.tobytes())
    with open(${JSON.stringify(`/watercolorist-label-map-${data.id}.bin`)}, "wb") as _region_file:
        _region_file.write(_region_labels.tobytes())
else:
    _region_width = _region_height = 0
`);

    const output = pyodide.FS.readFile(outputPath);
    const image = new ArrayBuffer(output.byteLength);
    new Uint8Array(image).set(output);
    const hasRegions = pyodide.runPython("_region_labels is not None") as boolean;
    let regions: ArrayBuffer | undefined;
    let regionValues: ArrayBuffer | undefined;
    let regionWidth = 0;
    let regionHeight = 0;
    if (hasRegions) {
      const labelMapPath = `/watercolorist-label-map-${data.id}.bin`;
      const regionValuesPath = `/watercolorist-region-values-${data.id}.bin`;
      cleanupPaths.push(labelMapPath, regionValuesPath);
      const labelMap = pyodide.FS.readFile(labelMapPath);
      regions = new ArrayBuffer(labelMap.byteLength);
      new Uint8Array(regions).set(labelMap);
      const regionValueMap = pyodide.FS.readFile(regionValuesPath);
      regionValues = new ArrayBuffer(regionValueMap.byteLength);
      new Uint8Array(regionValues).set(regionValueMap);
      regionWidth = pyodide.runPython("_region_width") as number;
      regionHeight = pyodide.runPython("_region_height") as number;
    }
    pyodide.FS.unlink(outputPath);
    pyodide.FS.unlink(inputPath);
    if (hasRegions && regions) {
      pyodide.FS.unlink(`/watercolorist-label-map-${data.id}.bin`);
      pyodide.FS.unlink(`/watercolorist-region-values-${data.id}.bin`);
    }
    workerContext.postMessage(
      {
        type: "complete",
        id: data.id,
        image,
        transformMs: Math.round(performance.now() - startedAt),
        ...(regions && regionValues ? { regions, regionValues, regionWidth, regionHeight } : {}),
      },
      regions && regionValues ? [image, regions, regionValues] : [image],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pyodide) {
      for (const path of cleanupPaths) {
        try {
          pyodide.FS.unlink(path);
        } catch {
          // Ignore paths already removed before a later step failed.
        }
      }
    }
    workerContext.postMessage({
      type: "error",
      id: data.type === "initialize" ? undefined : data.id,
      message,
    });
  }
};

workerContext.addEventListener("message", ({ data }) => {
  messageQueue = messageQueue.then(() => handleMessage(data));
});
