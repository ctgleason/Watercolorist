"""Spatial detail reduction shared by image transforms."""

from PIL import Image

from watercolorist.images import load_rgb


def abstract_image(image: Image.Image, scale: float = 1.0) -> Image.Image:
    """Reduce fine detail while preserving the original image dimensions.

    ``scale`` is the factor by which each dimension is reduced before the
    result is enlarged smoothly. A scale of 1 returns an RGB copy unchanged.
    """
    if scale < 1:
        raise ValueError("scale must be greater than or equal to 1")

    rgb = load_rgb(image)
    if scale == 1:
        return rgb

    width, height = rgb.size
    reduced_size = (max(1, round(width / scale)), max(1, round(height / scale)))
    reduced = rgb.resize(reduced_size, Image.Resampling.BOX)
    return reduced.resize(rgb.size, Image.Resampling.BICUBIC)
