import numpy as np
import pytest
from PIL import Image

from watercolorist.abstraction import abstract_image
from watercolorist.defaults import estimate_abstraction
from watercolorist.transforms import adjust_tone, grayscale_study, notan_study


def test_abstraction_preserves_dimensions_and_rgb_mode() -> None:
    image = Image.new("RGBA", (24, 16), (120, 80, 40, 100))

    result = abstract_image(image, scale=4)

    assert result.size == image.size
    assert result.mode == "RGB"


def test_abstraction_rejects_scales_below_one() -> None:
    with pytest.raises(ValueError, match="scale"):
        abstract_image(Image.new("RGB", (8, 8)), scale=0.5)


def test_smart_abstraction_prefers_broader_scale_for_flat_image() -> None:
    flat = Image.new("RGB", (48, 48), "white")
    detailed = Image.fromarray(
        ((np.indices((48, 48)).sum(axis=0) % 2) * 255).astype(np.uint8)[:, :, None].repeat(3, axis=2)
    )

    assert 2 <= estimate_abstraction(flat) <= 12
    assert estimate_abstraction(flat) > estimate_abstraction(detailed)


def test_grayscale_study_uses_requested_number_of_values() -> None:
    image = Image.new("RGB", (5, 1))
    image.putdata([(0, 0, 0), (64, 64, 64), (128, 128, 128), (192, 192, 192), (255, 255, 255)])

    result = grayscale_study(image, levels=3)

    assert result.mode == "L"
    assert set(np.asarray(result).ravel()) <= {0, 128, 255}


def test_working_resolution_reduces_processing_and_restores_output_dimensions() -> None:
    image = Image.new("RGB", (40, 24))
    image.putdata([
        (255, 255, 255) if x < 20 else (0, 0, 0)
        for _y in range(24)
        for x in range(40)
    ])

    grayscale = grayscale_study(image, levels=5, working_resolution=0.25)
    notan = notan_study(image, threshold=127, working_resolution=0.25)

    assert grayscale.size == image.size
    assert notan.size == image.size
    assert set(np.asarray(grayscale).ravel()) <= {0, 64, 128, 191, 255}
    assert set(np.asarray(notan).ravel()) <= {0, 255}


def test_working_resolution_rejects_invalid_values() -> None:
    image = Image.new("RGB", (4, 4))

    with pytest.raises(ValueError, match="working_resolution"):
        grayscale_study(image, working_resolution=0.05)
    with pytest.raises(ValueError, match="working_resolution"):
        notan_study(image, working_resolution=1.1)


def test_grayscale_study_rejects_invalid_level_count() -> None:
    with pytest.raises(ValueError, match="levels"):
        grayscale_study(Image.new("RGB", (2, 2)), levels=1)


def test_tone_adjustment_defaults_preserve_image() -> None:
    image = Image.new("RGB", (3, 1))
    image.putdata([(24, 24, 24), (128, 128, 128), (238, 238, 238)])

    result = adjust_tone(image)

    assert np.array_equal(np.asarray(result), np.asarray(image))


def test_exposure_lifts_all_tones() -> None:
    image = Image.new("RGB", (3, 1))
    image.putdata([(24, 24, 24), (128, 128, 128), (220, 220, 220)])

    result = np.asarray(adjust_tone(image, exposure=1.0), dtype=np.int16)

    assert np.all(result > np.asarray(image, dtype=np.int16))


def test_tone_adjustment_is_consistent_across_processing_chunks() -> None:
    image = Image.new("RGB", (3, 260), (48, 96, 144))

    result = np.asarray(adjust_tone(image, exposure=0.5, shadows=0.2))

    assert result.shape == (260, 3, 3)
    assert np.all(result == result[0:1])


def test_shadows_and_highlights_target_their_tonal_ranges() -> None:
    image = Image.new("RGB", (3, 1))
    image.putdata([(24, 24, 24), (128, 128, 128), (238, 238, 238)])
    before = np.asarray(image, dtype=np.int16)[0, :, 0]

    lifted_shadows = np.asarray(adjust_tone(image, shadows=1.0), dtype=np.int16)[0, :, 0]
    lowered_highlights = np.asarray(adjust_tone(image, highlights=-1.0), dtype=np.int16)[0, :, 0]

    assert lifted_shadows[0] > before[0]
    assert lifted_shadows[0] - before[0] > lifted_shadows[2] - before[2]
    assert lowered_highlights[2] < before[2]
    assert before[0] - lowered_highlights[0] < before[2] - lowered_highlights[2]


@pytest.mark.parametrize(
    ("settings", "message"),
    [
        ({"exposure": 2.1}, "exposure"),
        ({"shadows": -1.1}, "shadows"),
        ({"highlights": 1.1}, "highlights"),
    ],
)
def test_tone_adjustment_rejects_out_of_range_values(
    settings: dict[str, float], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        adjust_tone(Image.new("RGB", (1, 1)), **settings)


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
