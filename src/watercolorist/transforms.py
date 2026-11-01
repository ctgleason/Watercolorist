"""Initial value-study transforms."""

from typing import Literal

import numpy as np
from PIL import Image, ImageOps

from watercolorist.abstraction import abstract_image
from watercolorist.images import load_rgb

ThresholdMethod = Literal["otsu", "median"]


def _working_image(image: Image.Image, working_resolution: float) -> tuple[Image.Image, tuple[int, int]]:
    if not 0.1 <= working_resolution <= 1.0:
        raise ValueError("working_resolution must be between 0.1 and 1.0")

    source = load_rgb(image)
    original_size = source.size
    if working_resolution < 1.0:
        width, height = original_size
        working_size = (
            max(1, round(width * working_resolution)),
            max(1, round(height * working_resolution)),
        )
        source = source.resize(working_size, Image.Resampling.BOX)
    return source, original_size


def _restore_output_size(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    if image.size == size:
        return image
    # Nearest-neighbor enlargement retains the discrete value groups in
    # grayscale and Notan studies rather than introducing new in-between tones.
    return image.resize(size, Image.Resampling.NEAREST)


def adjust_tone(
    image: Image.Image,
    exposure: float = 0.0,
    shadows: float = 0.0,
    highlights: float = 0.0,
) -> Image.Image:
    """Apply exposure and soft shadow/highlight adjustments to an RGB image.

    Exposure is measured in stops and limited to -2..2. Shadows and highlights
    are local exposure adjustments in stops, each limited to -1..1. Tonal
    masks are computed from linear-light luminance and softly blended.
    """
    if not -2.0 <= exposure <= 2.0:
        raise ValueError("exposure must be between -2 and 2 stops")
    if not -1.0 <= shadows <= 1.0:
        raise ValueError("shadows must be between -1 and 1 stops")
    if not -1.0 <= highlights <= 1.0:
        raise ValueError("highlights must be between -1 and 1 stops")

    source = load_rgb(image)
    if exposure == 0.0 and shadows == 0.0 and highlights == 0.0:
        return source

    source_pixels = np.asarray(source, dtype=np.uint8)
    result = np.empty_like(source_pixels)
    luminance_coefficients = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    gamma = np.float32(2.4)
    inverse_gamma = np.float32(1.0 / 2.4)
    scale = np.float32(255.0)
    exposure_stops = np.float32(exposure)

    def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
        start = np.float32(edge0)
        width = np.float32(edge1 - edge0)
        normalized = np.clip((value - start) / width, 0.0, 1.0)
        return normalized * normalized * (np.float32(3.0) - np.float32(2.0) * normalized)

    # Bound temporary floating-point buffers for large phone photos. A full
    # float64 RGB intermediate for a 24 MP image alone would need about 560 MiB.
    chunk_rows = 128
    for row_start in range(0, source.height, chunk_rows):
        row_end = min(row_start + chunk_rows, source.height)
        encoded = source_pixels[row_start:row_end].astype(np.float32) / scale
        linear = np.where(
            encoded <= np.float32(0.04045),
            encoded / np.float32(12.92),
            np.power(
                (encoded + np.float32(0.055)) / np.float32(1.055),
                gamma,
            ),
        )
        luminance = np.einsum("...c,c->...", linear, luminance_coefficients)

        shadow_mask = np.float32(1.0) - smoothstep(0.03, 0.62, luminance)
        highlight_mask = smoothstep(0.38, 0.97, luminance)
        local_stops = (
            np.float32(shadows) * shadow_mask
            + np.float32(highlights) * highlight_mask
            + exposure_stops
        )
        adjusted = linear * np.exp2(local_stops)[..., np.newaxis]
        np.clip(adjusted, 0.0, 1.0, out=adjusted)
        srgb = np.where(
            adjusted <= np.float32(0.0031308),
            adjusted * np.float32(12.92),
            np.float32(1.055) * np.power(adjusted, inverse_gamma) - np.float32(0.055),
        )
        result[row_start:row_end] = np.rint(srgb * scale).astype(np.uint8)

    return Image.fromarray(result)


def _quantize_values(values: np.ndarray, levels: int) -> np.ndarray:
    if not 2 <= levels <= 256:
        raise ValueError("levels must be between 2 and 256")

    indices = np.rint(values.astype(np.float64) * (levels - 1) / 255)
    quantized = np.rint(indices * 255 / (levels - 1))
    return quantized.astype(np.uint8)


def _otsu_threshold(values: np.ndarray) -> int:
    """Compute an Otsu threshold from an 8-bit grayscale image."""
    histogram = np.bincount(values.ravel(), minlength=256).astype(np.float64)
    total = histogram.sum()
    if total == 0:
        return 0

    occupied = np.flatnonzero(histogram)
    if occupied.size == 1:
        return int(occupied[0])

    probabilities = histogram / total
    cumulative_weight = np.cumsum(probabilities)
    cumulative_mean = np.cumsum(probabilities * np.arange(256))
    total_mean = cumulative_mean[-1]
    denominator = cumulative_weight * (1 - cumulative_weight)
    between_class_variance = np.zeros(256, dtype=np.float64)
    valid = denominator > 0
    between_class_variance[valid] = (
        (total_mean * cumulative_weight[valid] - cumulative_mean[valid]) ** 2
        / denominator[valid]
    )
    return int(np.argmax(between_class_variance))


def grayscale_study(
    image: Image.Image,
    levels: int = 5,
    abstraction: float = 1.0,
    exposure: float = 0.0,
    shadows: float = 0.0,
    highlights: float = 0.0,
    working_resolution: float = 1.0,
) -> Image.Image:
    """Create an 8-bit grayscale study with a configurable number of values."""
    source, original_size = _working_image(image, working_resolution)
    source = abstract_image(source, abstraction)
    source = adjust_tone(source, exposure, shadows, highlights)
    grayscale = np.asarray(ImageOps.grayscale(source), dtype=np.uint8)
    result = _quantize_values(grayscale, levels)
    return _restore_output_size(Image.fromarray(result), original_size)


def notan_study(
    image: Image.Image,
    threshold: int | None = None,
    threshold_method: ThresholdMethod = "otsu",
    abstraction: float = 1.0,
    exposure: float = 0.0,
    shadows: float = 0.0,
    highlights: float = 0.0,
    working_resolution: float = 1.0,
) -> Image.Image:
    """Create a black-and-white Notan study using Otsu or median thresholding."""
    if threshold is not None and not 0 <= threshold <= 255:
        raise ValueError("threshold must be between 0 and 255")
    if threshold_method not in ("otsu", "median"):
        raise ValueError("threshold_method must be 'otsu' or 'median'")

    source, original_size = _working_image(image, working_resolution)
    source = abstract_image(source, abstraction)
    source = adjust_tone(source, exposure, shadows, highlights)
    grayscale = np.asarray(ImageOps.grayscale(source), dtype=np.uint8)
    if threshold is None:
        threshold = (
            _otsu_threshold(grayscale)
            if threshold_method == "otsu"
            else int(np.median(grayscale))
        )

    result = np.where(grayscale > threshold, 255, 0).astype(np.uint8)
    return _restore_output_size(Image.fromarray(result), original_size)
