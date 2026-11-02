"""Inspectable image-processing primitives for Watercolorist."""

from watercolorist.abstraction import abstract_image
from watercolorist.defaults import estimate_abstraction
from watercolorist.transforms import (
	adjust_tone,
	grayscale_study,
	grayscale_study_with_regions,
	merge_grayscale_regions,
	notan_study,
)

__all__ = [
	"abstract_image",
	"adjust_tone",
	"estimate_abstraction",
	"grayscale_study",
	"grayscale_study_with_regions",
	"merge_grayscale_regions",
	"notan_study",
]
