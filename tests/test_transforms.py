import numpy as np
import pytest
from PIL import Image

from watercolorist.abstraction import abstract_image
from watercolorist.transforms import grayscale_study, notan_study


def test_abstraction_preserves_dimensions_and_rgb_mode() -> None:
    image = Image.new("RGBA", (24, 16), (120, 80, 40, 100))

    result = abstract_image(image, scale=4)

    assert result.size == image.size
    assert result.mode == "RGB"


def test_abstraction_rejects_scales_below_one() -> None:
    with pytest.raises(ValueError, match="scale"):
        abstract_image(Image.new("RGB", (8, 8)), scale=0.5)


def test_grayscale_study_uses_requested_number_of_values() -> None:
    image = Image.new("RGB", (5, 1))
    image.putdata([(0, 0, 0), (64, 64, 64), (128, 128, 128), (192, 192, 192), (255, 255, 255)])

    result = grayscale_study(image, levels=3)

    assert result.mode == "L"
    assert set(np.asarray(result).ravel()) <= {0, 128, 255}


def test_grayscale_study_rejects_invalid_level_count() -> None:
    with pytest.raises(ValueError, match="levels"):
        grayscale_study(Image.new("RGB", (2, 2)), levels=1)


def test_notan_separates_dark_and_light_pixels() -> None:
    image = Image.new("RGB", (2, 1))
    image.putdata([(0, 0, 0), (255, 255, 255)])

    result = notan_study(image, threshold=127)

    assert result.mode == "L"
    assert np.asarray(result).ravel().tolist() == [0, 255]


def test_notan_otsu_separates_two_value_groups() -> None:
    image = Image.new("RGB", (4, 1))
    image.putdata([(0, 0, 0), (0, 0, 0), (255, 255, 255), (255, 255, 255)])

    result = notan_study(image, threshold_method="otsu")

    assert np.asarray(result).ravel().tolist() == [0, 0, 255, 255]


def test_notan_otsu_handles_constant_image() -> None:
    image = Image.new("RGB", (3, 3), (120, 120, 120))

    result = notan_study(image)

    assert set(np.asarray(result).ravel()) == {0}


def test_notan_rejects_invalid_threshold() -> None:
    with pytest.raises(ValueError, match="threshold"):
        notan_study(Image.new("RGB", (2, 2)), threshold=300)
