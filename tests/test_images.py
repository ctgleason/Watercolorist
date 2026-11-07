from pathlib import Path

import pytest
from PIL import Image, ImageOps

from watercolorist.images import load_rgb, save_image


def test_load_rgb_converts_and_copies_image() -> None:
    source = Image.new("RGBA", (3, 2), (10, 20, 30, 40))

    result = load_rgb(source)

    assert result.mode == "RGB"
    assert result.size == source.size
    assert result.getpixel((0, 0)) == (10, 20, 30)
    assert result is not source


@pytest.mark.parametrize("orientation", range(1, 9))
@pytest.mark.parametrize("use_path", [False, True])
def test_load_rgb_applies_exif_orientation_once(tmp_path: Path, orientation: int, use_path: bool) -> None:
    source = Image.new("RGB", (4, 3))
    source.putdata([(x * 50, y * 70, (x + y) * 30) for y in range(3) for x in range(4)])
    source.getexif()[274] = orientation
    expected = ImageOps.exif_transpose(source).convert("RGB")
    if use_path:
        path = tmp_path / "oriented.png"
        source.save(path, exif=source.getexif())
        result = load_rgb(path)
    else:
        result = load_rgb(source)

    assert result.size == expected.size
    assert result.tobytes() == expected.tobytes()
    assert result.getexif().get(274, 1) == 1
    assert load_rgb(result).tobytes() == expected.tobytes()


def test_save_image_creates_parent_directories(tmp_path: Path) -> None:
    destination = tmp_path / "nested" / "study.png"

    save_image(Image.new("RGB", (2, 2), "white"), destination)

    assert destination.exists()
    with Image.open(destination) as saved:
        assert saved.size == (2, 2)
