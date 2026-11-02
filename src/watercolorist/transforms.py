"""Initial value-study transforms."""

from typing import Literal

import numpy as np
from PIL import Image, ImageOps

from watercolorist.abstraction import abstract_image
from watercolorist.images import load_rgb

ThresholdMethod = Literal["otsu", "median"]
GrayscaleMethod = Literal["even", "histogram", "coherent-regions", "adaptive-regions"]


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


def _histogram_quantize_values(values: np.ndarray, levels: int) -> np.ndarray:
    """Map luminance values through equal-population bins from their histogram."""
    if not 2 <= levels <= 256:
        raise ValueError("levels must be between 2 and 256")
    histogram = np.bincount(values.ravel(), minlength=256).astype(np.float64)
    total = histogram.sum()
    if total == 0:
        return values.copy()

    cumulative = np.cumsum(histogram)
    midpoint_ranks = cumulative - histogram / 2.0
    level_lut = np.floor(midpoint_ranks * levels / total).astype(np.int32)
    np.clip(level_lut, 0, levels - 1, out=level_lut)
    palette = np.rint(np.arange(levels, dtype=np.float64) * 255 / (levels - 1)).astype(np.uint8)
    return palette[level_lut[values]]


def _slic_region_labels(rgb: np.ndarray, region_spacing: int) -> np.ndarray:
    """Find compact, color-aware superpixels using a small SLIC-style routine."""
    height, width, _ = rgb.shape
    spacing = max(2, region_spacing)
    color = rgb.astype(np.float32)
    center_y, center_x = np.mgrid[spacing // 2 : height : spacing, spacing // 2 : width : spacing]
    centers_y = center_y.ravel().astype(np.float32)
    centers_x = center_x.ravel().astype(np.float32)
    if centers_y.size == 0:
        return np.zeros((height, width), dtype=np.int32)
    luminance = np.dot(color, np.array([0.299, 0.587, 0.114], dtype=np.float32))
    gradient_y = np.gradient(luminance, axis=0) if height > 1 else np.zeros_like(luminance)
    gradient_x = np.gradient(luminance, axis=1) if width > 1 else np.zeros_like(luminance)
    gradient = np.hypot(gradient_y, gradient_x)
    for index, (cy, cx) in enumerate(zip(centers_y, centers_x, strict=True)):
        y = int(cy)
        x = int(cx)
        y0, y1 = max(0, y - 1), min(height, y + 2)
        x0, x1 = max(0, x - 1), min(width, x + 2)
        local_gradient = gradient[y0:y1, x0:x1]
        if gradient[y, x] > local_gradient.min():
            offset_y, offset_x = np.unravel_index(
                np.argmin(local_gradient),
                local_gradient.shape,
            )
            centers_y[index] = y0 + offset_y
            centers_x[index] = x0 + offset_x
    centers_color = color[centers_y.astype(np.int32), centers_x.astype(np.int32)].copy()
    spatial_weight = np.float32((10.0 / spacing) ** 2)
    yy, xx = np.mgrid[:height, :width].astype(np.float32)
    labels = np.zeros((height, width), dtype=np.int32)

    for _ in range(8):
        distances = np.full((height, width), np.inf, dtype=np.float32)
        labels.fill(0)
        for index, (cy, cx) in enumerate(zip(centers_y, centers_x, strict=True)):
            y0 = max(0, int(cy) - 2 * spacing)
            y1 = min(height, int(cy) + 2 * spacing + 1)
            x0 = max(0, int(cx) - 2 * spacing)
            x1 = min(width, int(cx) + 2 * spacing + 1)
            color_delta = color[y0:y1, x0:x1] - centers_color[index]
            color_distance = np.sum(color_delta * color_delta, axis=2)
            spatial_distance = (yy[y0:y1, x0:x1] - cy) ** 2 + (xx[y0:y1, x0:x1] - cx) ** 2
            distance = color_distance + spatial_weight * spatial_distance
            current = distances[y0:y1, x0:x1]
            update = distance < current
            current[update] = distance[update]
            labels[y0:y1, x0:x1][update] = index

        flat_labels = labels.ravel()
        counts = np.bincount(flat_labels, minlength=centers_y.size).astype(np.float32)
        safe_counts = np.maximum(counts, 1.0)
        centers_y = np.bincount(flat_labels, weights=yy.ravel(), minlength=centers_y.size) / safe_counts
        centers_x = np.bincount(flat_labels, weights=xx.ravel(), minlength=centers_x.size) / safe_counts
        for channel in range(3):
            centers_color[:, channel] = (
                np.bincount(
                    flat_labels,
                    weights=color[:, :, channel].ravel(),
                    minlength=centers_color.shape[0],
                )
                / safe_counts
            )

    _, compact_labels = np.unique(labels, return_inverse=True)
    return compact_labels.reshape((height, width)).astype(np.int32)


def _adaptive_region_grayscale(
    image: Image.Image,
    levels: int,
    abstraction: float,
) -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """Assign a grayscale value per coherent region using relative region luminance."""
    if not 2 <= levels <= 256:
        raise ValueError("levels must be between 2 and 256")

    rgb_image = load_rgb(image)
    analysis = rgb_image.copy()
    analysis.thumbnail((768, 768), Image.Resampling.BOX)
    rgb = np.asarray(analysis, dtype=np.uint8)
    luminance = np.asarray(ImageOps.grayscale(analysis), dtype=np.uint8)

    target_regions = max(48, min(400, round(1200 / max(1.0, abstraction**0.5))))
    region_spacing = max(2, round(np.sqrt(rgb.shape[0] * rgb.shape[1] / target_regions)))
    labels = _slic_region_labels(rgb, region_spacing)
    flat_labels = labels.ravel()
    region_count = int(flat_labels.max()) + 1
    counts = np.bincount(flat_labels, minlength=region_count).astype(np.float64)
    region_means = np.bincount(
        flat_labels,
        weights=luminance.ravel().astype(np.float64),
        minlength=region_count,
    ) / np.maximum(counts, 1.0)

    order = np.argsort(region_means, kind="stable")
    sorted_means = region_means[order]
    sorted_counts = counts[order]
    thresholds: list[float] = []
    cumulative = np.cumsum(sorted_counts)
    total = float(cumulative[-1])
    for level in range(1, levels):
        split_index = int(np.searchsorted(cumulative, total * level / levels, side="left"))
        if split_index + 1 >= sorted_means.size:
            thresholds.append(float(sorted_means[-1]))
        else:
            thresholds.append(float((sorted_means[split_index] + sorted_means[split_index + 1]) / 2.0))

    region_levels = np.digitize(region_means, thresholds, right=True)
    value_lut = np.rint(np.arange(levels, dtype=np.float64) * 255 / (levels - 1)).astype(np.uint8)
    region_values = value_lut[region_levels]
    mapped = region_values[labels]
    result = Image.fromarray(mapped, mode="L")
    labels, source_region_ids = _connected_value_regions(labels.astype(np.int32))
    region_values = region_values[source_region_ids]
    return (
        result.resize(rgb_image.size, Image.Resampling.NEAREST),
        labels,
        region_values.astype(np.uint8),
    )


def _connected_value_regions(source_values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Label 4-connected components of equal integer values."""
    if source_values.ndim != 2 or source_values.dtype.kind not in "ui":
        raise ValueError("values must be a two-dimensional integer array")
    height, width = source_values.shape
    labels = np.zeros((height, width), dtype=np.int32)
    parents = [0]

    def find(label: int) -> int:
        root = label
        while parents[root] != root:
            root = parents[root]
        while parents[label] != label:
            next_label = parents[label]
            parents[label] = root
            label = next_label
        return root

    for y in range(height):
        for x in range(width):
            value = source_values[y, x]
            left = int(labels[y, x - 1]) if x > 0 and source_values[y, x - 1] == value else 0
            above = int(labels[y - 1, x]) if y > 0 and source_values[y - 1, x] == value else 0
            if left and above:
                labels[y, x] = left
                left_root = find(left)
                above_root = find(above)
                if left_root != above_root:
                    parents[above_root] = left_root
            elif left or above:
                labels[y, x] = left or above
            else:
                labels[y, x] = len(parents)
                parents.append(len(parents))

    compact = np.empty(labels.size, dtype=np.uint32)
    component_values: list[int] = []
    compact_ids: dict[int, int] = {}
    for index, provisional in enumerate(labels.ravel()):
        root = find(int(provisional))
        if root not in compact_ids:
            compact_ids[root] = len(component_values)
            component_values.append(int(source_values.ravel()[index]))
        compact[index] = compact_ids[root]
    return compact.reshape((height, width)), np.asarray(component_values, dtype=source_values.dtype)


def _region_map_for_grayscale(grayscale: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """Create selectable regions whose pixels all have the same displayed value."""
    grayscale_image = grayscale.convert("L")
    grayscale_image.thumbnail((512, 512), Image.Resampling.NEAREST)
    return _connected_value_regions(np.asarray(grayscale_image, dtype=np.uint8))


def _grayscale_study(
    image: Image.Image,
    levels: int,
    abstraction: float,
    exposure: float,
    shadows: float,
    highlights: float,
    working_resolution: float,
    grayscale_method: GrayscaleMethod,
) -> tuple[Image.Image, np.ndarray | None, np.ndarray | None]:
    if grayscale_method not in ("even", "histogram", "coherent-regions", "adaptive-regions"):
        raise ValueError("grayscale_method must be 'even', 'histogram', or 'coherent-regions'")
    source, original_size = _working_image(image, working_resolution)
    source = abstract_image(source, abstraction)
    source = adjust_tone(source, exposure, shadows, highlights)
    if grayscale_method in ("coherent-regions", "adaptive-regions"):
        result, region_labels, region_values = _adaptive_region_grayscale(source, levels, abstraction)
        return _restore_output_size(result, original_size), region_labels, region_values

    grayscale = np.asarray(ImageOps.grayscale(source), dtype=np.uint8)
    quantized = (
        _histogram_quantize_values(grayscale, levels)
        if grayscale_method == "histogram"
        else _quantize_values(grayscale, levels)
    )
    result = Image.fromarray(quantized)
    region_labels, region_values = _region_map_for_grayscale(result)
    return _restore_output_size(result, original_size), region_labels, region_values


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
    grayscale_method: GrayscaleMethod = "even",
) -> Image.Image:
    """Create an 8-bit grayscale study with even or adaptive region values."""
    result, _, _ = _grayscale_study(
        image, levels, abstraction, exposure, shadows, highlights,
        working_resolution, grayscale_method,
    )
    return result


def grayscale_study_with_regions(
    image: Image.Image,
    levels: int = 5,
    abstraction: float = 1.0,
    exposure: float = 0.0,
    shadows: float = 0.0,
    highlights: float = 0.0,
    working_resolution: float = 1.0,
    grayscale_method: GrayscaleMethod = "coherent-regions",
) -> tuple[Image.Image, np.ndarray | None, np.ndarray | None]:
    """Create a grayscale study and return an editable region-label map if available."""
    return _grayscale_study(
        image, levels, abstraction, exposure, shadows, highlights,
        working_resolution, grayscale_method,
    )


def merge_grayscale_regions(
    image: Image.Image,
    region_labels: np.ndarray,
    region_values: np.ndarray,
    selected_regions: list[int],
    levels: int,
    value_mode: Literal["mean", "lighter", "darker"] = "mean",
) -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """Merge selected region labels and assign their area-weighted mean gray value."""
    if not 2 <= levels <= 256:
        raise ValueError("levels must be between 2 and 256")
    if region_labels.ndim != 2 or region_labels.dtype not in (np.uint8, np.uint32):
        raise ValueError("region_labels must be a two-dimensional uint8 or uint32 label map")
    unique_regions = sorted(set(int(label) for label in selected_regions))
    if len(unique_regions) < 2:
        raise ValueError("select at least two regions to combine")

    if region_values.ndim != 1 or region_values.dtype != np.uint8:
        raise ValueError("region_values must be a one-dimensional uint8 value map")
    if region_labels.size and int(region_labels.max()) >= region_values.size:
        raise ValueError("region_values must contain a value for every region label")
    if value_mode not in ("mean", "lighter", "darker"):
        raise ValueError("value_mode must be 'mean', 'lighter', or 'darker'")
    grayscale_image = image.convert("L")
    labels_image = Image.fromarray(region_labels.astype(np.int32), mode="I").resize(
        grayscale_image.size,
        Image.Resampling.NEAREST,
    )
    grayscale = np.asarray(grayscale_image, dtype=np.uint8).copy()
    full_labels = np.asarray(labels_image, dtype=np.uint32)
    selected_mask = np.isin(full_labels, unique_regions)
    if not np.any(selected_mask):
        raise ValueError("selected regions are not present in the image")

    region_area = np.bincount(region_labels.ravel().astype(np.int64), minlength=region_values.size)
    selected_values = region_values[unique_regions]
    if value_mode == "lighter":
        merged_value = int(np.max(selected_values))
    elif value_mode == "darker":
        merged_value = int(np.min(selected_values))
    else:
        selected_areas = region_area[unique_regions].astype(np.float64)
        mean_gray = int(np.rint(np.average(selected_values, weights=selected_areas)))
        merged_value = int(_quantize_values(np.array([mean_gray], dtype=np.uint8), levels)[0])
    grayscale[selected_mask] = merged_value

    merged_labels = region_labels.astype(np.uint32, copy=True)
    merged_labels[np.isin(merged_labels, unique_regions)] = unique_regions[0]
    merged_values = region_values.copy()
    merged_values[unique_regions] = merged_value
    return Image.fromarray(grayscale, mode="L"), merged_labels, merged_values


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
