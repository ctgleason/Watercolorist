"""Image-aware starting parameters for painting studies."""

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from watercolorist.images import load_rgb


def estimate_abstraction(image: Image.Image, working_resolution: float = 1.0) -> int:
    """Suggest a spatial abstraction scale based on visible edge density.

    The image is reduced to a small grayscale sample, edge strength is
    measured, and the result is mapped to a practical scale from 2 to 12.
    Edge-dense images receive finer starting scales; quieter images receive
    broader ones. The suggestion is only a starting point for the artist.
    """
    if not 0.1 <= working_resolution <= 1.0:
        raise ValueError("working_resolution must be between 0.1 and 1.0")

    rgb = load_rgb(image)
    if working_resolution < 1.0:
        width, height = rgb.size
        rgb = rgb.resize(
            (max(1, round(width * working_resolution)), max(1, round(height * working_resolution))),
            Image.Resampling.BOX,
        )
    sample = ImageOps.grayscale(rgb)
    sample.thumbnail((256, 256), Image.Resampling.BILINEAR)
    edges = np.asarray(sample.filter(ImageFilter.FIND_EDGES), dtype=np.uint8)
    edge_density = float(np.mean(edges >= 32))
    return max(2, min(12, round(12 - edge_density * 20)))
