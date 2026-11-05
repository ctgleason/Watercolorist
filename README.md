# Watercolorist

Watercolorist is a painting-assistant project for exploring image structure, value, color, and watercolor mixing. Its algorithmic core is Python-first and kept separate from any future browser interface so it can be understood, tested, and reused.

## First milestone

This initial slice provides a tested Python core for:

- Loading and saving images as RGB.
- Reducing fine detail with a spatial abstraction scale.
- Producing multi-level grayscale studies.
- Producing two-value Notan studies using Otsu or median thresholding.

## Development setup

Create and activate a virtual environment, then install the project with its development dependencies:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
```

Run the test suite with `pytest`.

Transform an image from the command line:

```sh
watercolorist notan input.jpg output.png --abstraction 8
watercolorist grayscale input.jpg values.png --levels 5 --abstraction 6
```

An abstraction value of `1` preserves the input resolution. Larger values reduce the image to a coarser working resolution before scaling it back to the original dimensions.

## Browser feasibility prototype

Install the JavaScript dependencies with `npm install`, then start the development server with `npm run dev`. Open the local URL printed by Vite, choose an image, and create a Notan or grayscale study. Use the previous/next buttons to browse the most recent 20 studies for the current image. Creating a study while viewing an earlier one appends it without removing later studies. This history is session-only until snapshots are saved.

Choose **Save snapshot** to pick a parent folder. Watercolorist creates a subfolder named after the source image and saves numbered PNG snapshots alongside JSON files containing their settings. Snapshot numbering checks the existing records, so branching from an earlier study does not reuse or remove numbers already saved. Turn on **Ask to save each new study** to choose a destination folder and then confirm each newly created or revisited unsaved study. This folder-writing feature requires a browser with the File System Access API; the PNG download remains available as a fallback.

The collapsed **Watercolor palette** panel lets artists search paint names from DANIEL SMITH Extra Fine, Winsor & Newton Professional, and QoR Artist Watercolors, filter by brand, and save their paint inventory in that browser. For each study, mark a subset of inventory colors as the painting palette or specify a maximum size and ask Watercolorist to suggest a palette from weighted image-region colors. Region auto-assignment then uses only that painting palette, including approximate two-paint mixtures and wash strengths. The chosen IDs and size are recorded with study snapshots. Manufacturer data is shown where verified: QoR product codes, pigments, opacity, staining, and granulation; Winsor & Newton product codes, pigment identifiers, permanence grade (AA/A/B), series, ASTM lightfastness (I/II), staining, and granulation; and CIE Lab measurements for the first 20 DANIEL SMITH chart entries. Swatches and mixing behavior are approximate screen-color estimates, not calibrated paint measurements or physical pigment predictions.

The Python transforms and image-aware abstraction estimate run in a Web Worker through Pyodide. For each new image, Watercolorist samples image edges and suggests an abstraction scale from 2× to 12×. The estimate sets the slider automatically; adjust the slider to override it. Each study records whether its scale came from the estimate or a manual adjustment. The optional prompt to save each new study is under the collapsed **Save preferences** section.

Grayscale studies offer four value mappings. **Even steps** maps each pixel into fixed-width luminance intervals. **Histogram** uses the cumulative luminance histogram to distribute pixels among the requested values; each pixel is mapped from its own luminance, with tied luminance values kept together. **Edge-guided hybrid** merges nearby superpixels across weak boundaries, preserving stronger smoothed-luminance edges as region boundaries. Low-variation regions receive one shared value from the pixel-histogram mapping, while high-variation texture uses the same mapping per pixel. The histogram gives brighter pixels up to five times the influence of black pixels, while final output is clamped between the pixel’s Even-step value and at most one brighter value step. This avoids large luminance jumps caused by region averaging or coarse analysis. The experimental method is intended to keep broad landscape edges without imposing superpixel blocks throughout textured areas. **Coherent regions** is the former Adaptive regions method: it forms compact, color-aware superpixels, then assigns one requested gray value to each region based on its mean luminance. It can separate coherent shapes whose brightnesses are close, but is an image-segmentation aid rather than semantic object recognition and can have visible superpixel boundaries. Region-based analysis is bounded to 768 pixels on the longest edge, with abstraction controlling superpixel scale. Region editing is available for all mappings and Notan studies.

Click a region to highlight it, then use Command-click (macOS) or Ctrl-click (other desktop platforms) to add more seed regions. On touch devices, turn on **Add regions** to tap any additional seed, including disconnected regions; tapping an already seeded region removes it. Increase **Similar values** tolerance to expand from each seed only through connected neighboring regions that are similar to that seed’s own grayscale value, so growth from one tap cannot pull in a disconnected area just because another seed has a similar value. The tolerance slider is nonlinear to provide finer adjustment near zero. **Combined value** chooses the selected regions’ area-weighted average, lighter value, or darker value. **Combine regions** creates a new study and leaves the previous study intact; **Undo combine** returns to the previous study while keeping the merged study available in history. Saved snapshots include compact region labels and value maps, although opening saved snapshots as editable studies is not yet implemented.

**Processing zones** let part of the image use its own abstraction scale, exposure, shadows, and highlights. With a photo loaded, choose **Draw zone** under it and trace around an area of the original photo; each closed stroke becomes a numbered zone with its own sliders. Areas outside every zone use the main study settings. Each zone also has an **Edge blend** slider (0–20% of the photo's shorter side, default 4%). At 0 the zone has a hard edge; higher values cross-fade the zone's result with whatever lies beyond it across a transition centered on the outline, so abstraction and exposure changes don't produce a harsh seam. Region selection still treats the outline itself as the boundary. **Create study with zones** (or **Create study**) processes the original image once for the main settings and once per zone, composites the results through the zone outlines (later zones on top), and merges the region maps so regions can still be selected, combined, and painted. Zones are saved with the study and snapshot metadata. The **Guide** button in the header opens a short in-app quick reference covering this workflow.

Tone controls are grouped in a collapsed **Tone adjustments** panel to keep the settings card uncluttered. Exposure uses EV stops; Shadows and Highlights apply soft tonal-range adjustments. All controls start neutral, can be reset together, and their settings are stored with each study/snapshot. They currently affect the whole image; the Python adjustment function is separated so the same operation can later be blended through a region mask.

**Working resolution** can be set to 100%, 75%, 50%, or 25% of the source dimensions. Reducing the percentage reduces processed pixels in both dimensions (so 50% is one quarter of the pixels). Studies are enlarged back to the source dimensions with nearest-neighbor resampling to preserve discrete value areas. The selected scale is saved with each study and applied to the live tone-preview proxy; 100% retains the original processing behavior.

The browser downloads the Python runtime and NumPy/Pillow packages from the Pyodide CDN on first use. The installable PWA precaches its app shell and stores those runtime/package downloads for repeat and offline launches. Offline use becomes available after a successful online visit and the initial downloads; browser storage can be cleared or evicted. In a supported browser, use its **Install app** or **Add to Dock** action to install Watercolorist.

The PWA icon files are generated from `web/public/watercolorist.svg` with `npm run generate:icons`.

## Deploy to GitHub Pages

The production build is configured for the `ctgleason.github.io/Watercolorist/` project-site path. The workflow at `.github/workflows/deploy-pages.yml` builds and deploys `dist/` whenever `main` is updated. In the repository's **Settings → Pages**, select **GitHub Actions** as the build source. After the first successful workflow, the site is available at `https://ctgleason.github.io/Watercolorist/`.

The GitHub repository is private, but the Pages website is public. Uploaded reference images are processed in the browser and are not sent to GitHub Pages.

## Architecture direction

The proposed product is a Progressive Web App with a thin TypeScript/JavaScript interface and a Python image-processing core. The first implementation milestone deliberately focuses on the core algorithms. Before committing to browser-side Python, a small Pyodide prototype should verify package compatibility, startup cost, offline behavior, and performance on representative images. If those constraints are not acceptable, the same core can be exposed through a Python service instead.

## Planned phases

1. Python image core and transform tests (complete for the initial slice).
2. Pyodide worker proof of concept and browser processing (feasibility validated).
3. Installable PWA, offline runtime caching, and an initial image-aware abstraction default (current milestone).
4. Persistent project/version storage and region masks.
5. Color abstraction, harmony tools, and palette management.
6. Watercolor pigment-mixing suggestions and measured swatch refinement.
7. Accessibility, mobile, and performance polish.
