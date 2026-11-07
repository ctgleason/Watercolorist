"""Image input and output helpers."""

from pathlib import Path

from PIL import Image, ImageOps

ImageSource = Image.Image | str | Path


def load_rgb(source: ImageSource) -> Image.Image:
    """Load an image or normalize an existing image to an independent RGB copy."""
    if isinstance(source, Image.Image):
        return ImageOps.exif_transpose(source).convert("RGB")

    with Image.open(source) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def save_image(image: Image.Image, destination: str | Path) -> None:
    """Save an image, creating parent directories when needed."""
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
