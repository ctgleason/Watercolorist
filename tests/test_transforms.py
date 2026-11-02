import numpy as np
import pytest
from PIL import Image

from watercolorist.abstraction import abstract_image
from watercolorist.defaults import estimate_abstraction
from watercolorist.transforms import (
    _histogram_quantize_with_brightness_weight,
    adjust_tone,
    grayscale_study,
    _connected_value_regions,
    grayscale_study_with_regions,
    merge_grayscale_regions,
    notan_study,
)


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


def test_grayscale_study_supports_sixteen_values() -> None:
    image = Image.fromarray(np.arange(256, dtype=np.uint8).reshape((16, 16)))

    result = grayscale_study(image, levels=16, grayscale_method="even")

    assert np.unique(np.asarray(result)).size == 16


def test_histogram_mapping_uses_pixel_luminance_distribution() -> None:
    image = Image.new("RGB", (10, 1))
    image.putdata([(0, 0, 0)] * 7 + [(100, 100, 100)] * 2 + [(255, 255, 255)])

    even = np.asarray(grayscale_study(image, levels=3, grayscale_method="even"))
    histogram = np.asarray(grayscale_study(image, levels=3, grayscale_method="histogram"))

    assert set(np.unique(histogram)) == {128, 255}
    assert np.count_nonzero(histogram == 128) == 7
    assert not np.array_equal(histogram, even)


def test_histogram_mapping_handles_constant_luminance() -> None:
    image = Image.new("RGB", (8, 8), (120, 120, 120))

    result = grayscale_study(image, levels=5, grayscale_method="histogram")

    assert np.unique(np.asarray(result)).size == 1
    assert result.getpixel((0, 0)) == 128


def test_brightness_weight_moves_histogram_thresholds_toward_brighter_values() -> None:
    luminance = np.array([0] * 100 + list(range(1, 256)), dtype=np.uint8)

    uniform_bins = _histogram_quantize_with_brightness_weight(luminance, 4, 0.0)
    bright_weighted = _histogram_quantize_with_brightness_weight(luminance, 4, 1.0)
    first_uniform_cut = int(luminance[np.flatnonzero(uniform_bins > 0)[0]])
    first_weighted_cut = int(luminance[np.flatnonzero(bright_weighted > 0)[0]])

    assert first_weighted_cut > first_uniform_cut


def test_region_histogram_respects_region_pixel_area() -> None:
    region_means = np.array([24, 208], dtype=np.uint8)

    equal_region_weight = _histogram_quantize_with_brightness_weight(
        region_means, 5, 4.0
    )
    area_weighted = _histogram_quantize_with_brightness_weight(
        region_means, 5, 4.0, sample_weights=np.array([1000.0, 1.0])
    )

    assert equal_region_weight[0] != area_weighted[0]
    assert area_weighted[0] < area_weighted[1]


def test_edge_guided_mapping_preserves_prominent_boundary_between_flat_areas() -> None:
    image = Image.new("RGB", (96, 48))
    image.putdata([
        (82, 82, 82) if x < 48 else (118, 118, 118)
        for _y in range(48)
        for x in range(96)
    ])

    result = grayscale_study(image, levels=2, grayscale_method="edge-guided")

    assert result.getpixel((24, 24)) != result.getpixel((72, 24))


def test_edge_guided_does_not_assign_large_dark_area_a_bright_value() -> None:
    image = Image.new("RGB", (100, 40))
    image.putdata([
        (24, 24, 24) if x < 90 else (208, 208, 208)
        for _y in range(40)
        for x in range(100)
    ])

    result = grayscale_study(image, levels=5, grayscale_method="edge-guided")

    assert result.getpixel((45, 20)) < result.getpixel((95, 20))
    assert result.getpixel((45, 20)) < 128


def test_edge_guided_dark_values_stay_near_even_step_anchor_at_sixteen_levels() -> None:
    image = Image.new("RGB", (100, 40))
    image.putdata([
        (24, 24, 24) if x < 90 else (208, 208, 208)
        for _y in range(40)
        for x in range(100)
    ])

    result = grayscale_study(image, levels=16, grayscale_method="edge-guided")
    even = grayscale_study(image, levels=16, grayscale_method="even")

    assert even.getpixel((45, 20)) <= result.getpixel((45, 20)) <= even.getpixel((45, 20)) + 17


def test_edge_guided_never_maps_pixels_darker_than_even_steps() -> None:
    image = Image.new("RGB", (40, 20))
    image.putdata([
        (value, value, value)
        for _y in range(20)
        for value in range(40)
    ])

    edge = np.asarray(grayscale_study(image, levels=5, grayscale_method="edge-guided"))
    even = np.asarray(grayscale_study(image, levels=5, grayscale_method="even"))

    assert np.all(edge >= even)
    step = int(np.ceil(255 / 4))
    assert np.all(edge <= np.minimum(255, even.astype(np.uint16) + step))


def test_edge_guided_mapping_uses_pixel_histogram_for_texture() -> None:
    checkerboard = (np.indices((48, 48)).sum(axis=0) % 2 * 255).astype(np.uint8)
    image = Image.fromarray(checkerboard).convert("RGB")

    histogram = np.asarray(grayscale_study(image, levels=2, grayscale_method="histogram"))
    edge_guided = np.asarray(grayscale_study(image, levels=2, grayscale_method="edge-guided"))

    assert np.array_equal(edge_guided, histogram)


def test_edge_guided_regions_match_displayed_values() -> None:
    image = Image.new("RGB", (96, 48))
    image.putdata([
        (80, 80, 80) if x < 48 else (120, 120, 120)
        for _y in range(48)
        for x in range(96)
    ])

    result, labels, values = grayscale_study_with_regions(
        image,
        levels=3,
        grayscale_method="edge-guided",
    )

    assert labels is not None
    assert values is not None
    assert labels.shape == (48, 96)
    for label in np.unique(labels):
        assert np.unique(np.asarray(result)[labels == label]).size == 1


def test_adaptive_regions_separate_large_areas_with_close_values() -> None:
    image = Image.new("RGB", (64, 32))
    image.putdata([
        (100, 100, 100) if x < 32 else (110, 110, 110)
        for _y in range(32)
        for x in range(64)
    ])

    even = grayscale_study(image, levels=2, grayscale_method="even")
    adaptive = grayscale_study(image, levels=2, grayscale_method="coherent-regions")

    even_values = np.asarray(even)
    adaptive_values = np.asarray(adaptive)

    assert np.unique(even_values).size == 1
    assert set(np.unique(adaptive_values)) == {0, 255}
    assert adaptive.getpixel((16, 16)) != adaptive.getpixel((48, 16))


def test_grayscale_rejects_unknown_mapping_method() -> None:
    with pytest.raises(ValueError, match="grayscale_method"):
        grayscale_study(Image.new("RGB", (2, 2)), grayscale_method="unknown")


def test_adaptive_grayscale_returns_source_sized_region_labels() -> None:
    image = Image.new("RGB", (64, 32))
    image.putdata([
        (100, 100, 100) if x < 32 else (110, 110, 110)
        for _y in range(32)
        for x in range(64)
    ])

    result, region_labels, region_values = grayscale_study_with_regions(
        image,
        levels=2,
        grayscale_method="coherent-regions",
    )

    assert region_labels is not None
    assert region_values is not None
    assert region_labels.shape == (32, 64)
    assert region_labels.dtype == np.uint32
    assert np.unique(region_labels).size >= 2
    assert result.size == image.size
    sampled_result = np.asarray(result.resize((region_labels.shape[1], region_labels.shape[0]), Image.Resampling.NEAREST))
    for region_id in np.unique(region_labels):
        assert np.unique(sampled_result[region_labels == region_id]).size == 1


def test_even_grayscale_returns_editable_region_maps() -> None:
    image = Image.new("RGB", (64, 32))
    image.putdata([
        (35, 35, 35) if x < 32 else (220, 220, 220)
        for _y in range(32)
        for x in range(64)
    ])

    result, region_labels, region_values = grayscale_study_with_regions(
        image,
        levels=2,
        grayscale_method="even",
    )

    assert region_labels is not None
    assert region_values is not None
    assert region_labels.shape == (32, 64)
    assert int(region_labels[16, 16]) != int(region_labels[16, 48])
    assert result.getpixel((16, 16)) != result.getpixel((48, 16))
    for label in np.unique(region_labels):
        assert np.unique(np.asarray(result)[region_labels == label]).size == 1


def test_histogram_grayscale_returns_editable_regions_matching_displayed_values() -> None:
    image = Image.new("RGB", (80, 10))
    image.putdata(
        [(20, 20, 20)] * 60
        + [(100, 100, 100)] * 10
        + [(230, 230, 230)] * 10
    )

    result, region_labels, region_values = grayscale_study_with_regions(
        image,
        levels=3,
        grayscale_method="histogram",
    )

    assert region_labels is not None
    assert region_values is not None
    assert region_labels.shape == (10, 80)
    sampled = np.asarray(result)
    for label in np.unique(region_labels):
        assert np.unique(sampled[region_labels == label]).size == 1


def test_legacy_adaptive_regions_identifier_remains_supported() -> None:
    image = Image.new("RGB", (32, 16), (90, 90, 90))

    renamed = grayscale_study(image, grayscale_method="coherent-regions")
    legacy = grayscale_study(image, grayscale_method="adaptive-regions")

    assert np.array_equal(np.asarray(renamed), np.asarray(legacy))


def test_connected_value_regions_keep_disconnected_areas_separate() -> None:
    grayscale = np.array(
        [[0, 255, 0], [0, 0, 0], [0, 255, 0]],
        dtype=np.uint8,
    )

    labels, values = _connected_value_regions(grayscale)

    assert labels.dtype == np.uint32
    assert labels[0, 1] != labels[2, 1]
    assert values[labels[0, 1]] == values[labels[2, 1]] == 255


def test_disconnected_adaptive_label_pieces_become_separate_selectable_regions() -> None:
    raw_labels = np.array(
        [[3, 0, 0, 3]],
        dtype=np.int32,
    )

    labels, source_ids = _connected_value_regions(raw_labels)

    assert labels[0, 0] != labels[0, 3]
    assert source_ids[labels[0, 0]] == source_ids[labels[0, 3]] == 3


def test_connected_value_region_labels_exceed_uint8_range() -> None:
    grayscale = np.indices((33, 33)).sum(axis=0).astype(np.uint8) % 2 * 255

    labels, values = _connected_value_regions(grayscale)

    assert np.unique(labels).size > 255
    assert values.size == np.unique(labels).size


def test_combining_regions_assigns_one_shared_value_and_label() -> None:
    image = Image.new("RGB", (64, 32))
    image.putdata([
        (100, 100, 100) if x < 32 else (110, 110, 110)
        for _y in range(32)
        for x in range(64)
    ])
    result, region_labels, region_values = grayscale_study_with_regions(
        image,
        levels=3,
        grayscale_method="coherent-regions",
    )
    assert region_labels is not None
    assert region_values is not None
    left_label = int(region_labels[16, 16])
    right_label = int(region_labels[16, 48])
    assert left_label != right_label

    merged, merged_labels, merged_values = merge_grayscale_regions(
        result,
        region_labels,
        region_values,
        [left_label, right_label],
        levels=3,
    )

    assert merged.getpixel((16, 16)) == merged.getpixel((48, 16))
    assert int(merged_labels[16, 16]) == int(merged_labels[16, 48])
    assert merged_values[left_label] == merged_values[right_label]


def test_combining_selected_regions_leaves_unselected_region_unchanged() -> None:
    image = Image.new("RGB", (96, 32))
    image.putdata([
        (40, 40, 40) if x < 32 else (100, 100, 100) if x < 64 else (210, 210, 210)
        for _y in range(32)
        for x in range(96)
    ])
    original, region_labels, region_values = grayscale_study_with_regions(
        image,
        levels=3,
        grayscale_method="coherent-regions",
    )
    assert region_labels is not None
    assert region_values is not None
    left = (16, 16)
    middle = (48, 16)
    right = (80, 16)
    selected = [int(region_labels[left[1], left[0]]), int(region_labels[middle[1], middle[0]])]
    assert int(region_labels[right[1], right[0]]) not in selected

    merged, merged_labels, _ = merge_grayscale_regions(
        original, region_labels, region_values, selected, levels=3
    )

    assert merged.getpixel(left) == merged.getpixel(middle)
    assert merged.getpixel(right) == original.getpixel(right)
    assert int(merged_labels[left[1], left[0]]) == int(merged_labels[middle[1], middle[0]])
    assert int(merged_labels[right[1], right[0]]) != int(merged_labels[left[1], left[0]])


def test_region_merge_requires_at_least_two_selected_regions() -> None:
    with pytest.raises(ValueError, match="at least two"):
        merge_grayscale_regions(
            Image.new("L", (2, 2)),
            np.zeros((2, 2), dtype=np.uint8),
            np.zeros(1, dtype=np.uint8),
            [0],
            levels=3,
        )


@pytest.mark.parametrize(("value_mode", "expected"), [("lighter", 255), ("darker", 0)])
def test_region_merge_can_choose_lighter_or_darker_value(value_mode: str, expected: int) -> None:
    image = Image.new("L", (4, 2))
    image.putdata([0, 0, 255, 255] * 2)
    labels = np.array([[0, 0, 1, 1], [0, 0, 1, 1]], dtype=np.uint8)
    values = np.array([0, 255], dtype=np.uint8)

    merged, _, merged_values = merge_grayscale_regions(
        image,
        labels,
        values,
        [0, 1],
        levels=2,
        value_mode=value_mode,  # type: ignore[arg-type]
    )

    assert set(np.asarray(merged).ravel()) == {expected}
    assert set(merged_values) == {expected}


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
