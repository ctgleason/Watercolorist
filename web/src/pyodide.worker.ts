type TransformRequest = {
  type: "transform";
  id: number;
  image: ArrayBuffer;
  transform: "notan" | "grayscale";
  abstraction: number;
  levels: number;
  thresholdMethod: string;
};

type EstimateRequest = { type: "estimate"; id: number; image: ArrayBuffer };

type WorkerRequest =
  | { type: "initialize"; modules: Record<string, string> }
  | EstimateRequest
  | TransformRequest;

type WorkerResponse =
  | {
      type: "ready";
      pythonVersion: string;
      runtimeLoadMs: number;
      packageLoadMs: number;
    }
  | { type: "estimate"; id: number; abstraction: number }
  | { type: "complete"; id: number; image: ArrayBuffer; transformMs: number }
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

workerContext.addEventListener("message", async ({ data }) => {
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

    if (data.type === "estimate") {
      await pyodide.runPythonAsync("from PIL import Image\nfrom watercolorist.defaults import estimate_abstraction");
      const abstraction = pyodide.runPython(
        `estimate_abstraction(Image.open(${JSON.stringify(inputPath)}).convert("RGB"))`,
      ) as number;
      workerContext.postMessage({ type: "estimate", id: data.id, abstraction });
      return;
    }

    const startedAt = performance.now();
    pyodide.globals.set("_watercolorist_transform", data.transform);
    pyodide.globals.set("_watercolorist_abstraction", data.abstraction);
    pyodide.globals.set("_watercolorist_levels", data.levels);
    pyodide.globals.set("_watercolorist_threshold_method", data.thresholdMethod);

    await pyodide.runPythonAsync(`
from PIL import Image
from watercolorist.transforms import grayscale_study, notan_study

_source = Image.open(${JSON.stringify(inputPath)}).convert("RGB")
if _watercolorist_transform == "notan":
    _study = notan_study(
        _source,
        threshold_method=_watercolorist_threshold_method,
        abstraction=_watercolorist_abstraction,
    )
else:
    _study = grayscale_study(
        _source,
        levels=_watercolorist_levels,
        abstraction=_watercolorist_abstraction,
    )
_study.save("/watercolorist-output.png", format="PNG")
`);

    const output = pyodide.FS.readFile("/watercolorist-output.png");
    const image = new ArrayBuffer(output.byteLength);
    new Uint8Array(image).set(output);
    workerContext.postMessage(
      {
        type: "complete",
        id: data.id,
        image,
        transformMs: Math.round(performance.now() - startedAt),
      },
      [image],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerContext.postMessage({
      type: "error",
      id: data.type === "initialize" ? undefined : data.id,
      message,
    });
  }
});
