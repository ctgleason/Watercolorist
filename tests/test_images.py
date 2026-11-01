from pathlib import Path

from PIL import Image

from watercolorist.images import load_rgb, save_image


def test_load_rgb_converts_and_copies_image() -> None:
    source = Image.new("RGBA", (3, 2), (10, 20, 30, 40))

    result = load_rgb(source)

    assert result.mode == "RGB"
    assert result.size == source.size
    assert result.getpixel((0, 0)) == (10, 20, 30)
    assert result is not source


def test_save_image_creates_parent_directories(tmp_path: Path) -> None:
    destination = tmp_path / "nested" / "study.png"

    save_image(Image.new("RGB", (2, 2), "white"), destination)

    assert destination.exists()
    with Image.open(destination) as saved:
        assert saved.size == (2, 2)
