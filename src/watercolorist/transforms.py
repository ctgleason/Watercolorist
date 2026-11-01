"""Initial value-study transforms."""

from typing import Literal

import numpy as np
from PIL import Image, ImageOps

from watercolorist.abstraction import abstract_image
from watercolorist.images import load_rgb

ThresholdMethod = Literal["otsu", "median"]


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
) -> Image.Image:
    """Create an 8-bit grayscale study with a configurable number of values."""
    source = abstract_image(load_rgb(image), abstraction)
    grayscale = np.asarray(ImageOps.grayscale(source), dtype=np.uint8)
    result = _quantize_values(grayscale, levels)
    return Image.fromarray(result)


def notan_study(
    image: Image.Image,
    threshold: int | None = None,
    threshold_method: ThresholdMethod = "otsu",
    abstraction: float = 1.0,
) -> Image.Image:
    """Create a black-and-white Notan study using Otsu or median thresholding."""
    if threshold is not None and not 0 <= threshold <= 255:
        raise ValueError("threshold must be between 0 and 255")
    if threshold_method not in ("otsu", "median"):
        raise ValueError("threshold_method must be 'otsu' or 'median'")

    source = abstract_image(load_rgb(image), abstraction)
    grayscale = np.asarray(ImageOps.grayscale(source), dtype=np.uint8)
    if threshold is None:
        threshold = (
            _otsu_threshold(grayscale)
            if threshold_method == "otsu"
            else int(np.median(grayscale))
        )

    result = np.where(grayscale > threshold, 255, 0).astype(np.uint8)
    return Image.fromarray(result)
