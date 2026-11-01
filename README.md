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

## Architecture direction

The proposed product is a Progressive Web App with a thin TypeScript/JavaScript interface and a Python image-processing core. The first implementation milestone deliberately focuses on the core algorithms. Before committing to browser-side Python, a small Pyodide prototype should verify package compatibility, startup cost, offline behavior, and performance on representative images. If those constraints are not acceptable, the same core can be exposed through a Python service instead.

## Planned phases

1. Python image core and transform tests (current milestone).
2. Abstraction defaults and transform refinement.
3. PWA shell, image viewer, controls, and worker integration.
4. Editable transform versions, local persistence, and region masks.
5. Color abstraction, harmony tools, and palette management.
6. Watercolor pigment-mixing suggestions and measured swatch refinement.
7. Offline, accessibility, mobile, and performance polish.
