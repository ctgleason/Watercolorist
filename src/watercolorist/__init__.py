"""Inspectable image-processing primitives for Watercolorist."""

from watercolorist.abstraction import abstract_image
from watercolorist.defaults import estimate_abstraction
from watercolorist.transforms import grayscale_study, notan_study

__all__ = ["abstract_image", "estimate_abstraction", "grayscale_study", "notan_study"]
