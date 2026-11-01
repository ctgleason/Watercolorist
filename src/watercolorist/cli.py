"""Command-line entry point for the initial image studies."""

import argparse
from collections.abc import Sequence

from watercolorist.images import load_rgb, save_image
from watercolorist.transforms import grayscale_study, notan_study


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="watercolorist")
    subparsers = parser.add_subparsers(dest="transform", required=True)

    notan = subparsers.add_parser("notan", help="create a black-and-white Notan study")
    notan.add_argument("input")
    notan.add_argument("output")
    notan.add_argument("--abstraction", type=float, default=1.0)
    notan.add_argument("--threshold", type=int)
    notan.add_argument("--threshold-method", choices=("otsu", "median"), default="otsu")

    grayscale = subparsers.add_parser("grayscale", help="create a multi-value grayscale study")
    grayscale.add_argument("input")
    grayscale.add_argument("output")
    grayscale.add_argument("--levels", type=int, default=5)
    grayscale.add_argument("--abstraction", type=float, default=1.0)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    image = load_rgb(args.input)

    if args.transform == "notan":
        result = notan_study(
            image,
            threshold=args.threshold,
            threshold_method=args.threshold_method,
            abstraction=args.abstraction,
        )
    else:
        result = grayscale_study(
            image,
            levels=args.levels,
            abstraction=args.abstraction,
        )

    save_image(result, args.output)
    return 0
