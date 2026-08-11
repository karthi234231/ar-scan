#!/usr/bin/env python3
"""
Enhance target images for better AR tracking:

1. Histogram equalization (cv2.equalizeHist) to maximize pixel variance
2. Unsharp masking with kernel [[-1,-1,-1],[-1,9,-1],[-1,-1,-1]] to enhance edges
3. Resize to minimum 800x800 with cubic interpolation
4. Recompile .mind file

Usage:
  python enhance-target.py input.jpg output.jpg
  python enhance-target.py input.jpg output.jpg --mind output.mind
"""

import argparse
import cv2
import numpy as np
import os
import sys


def enhance_target_image(input_path: str, output_path: str) -> None:
    """Apply histogram equalization + unsharp masking to a target image."""
    img = cv2.imread(input_path)
    if img is None:
        print(f"Error: Could not read {input_path}", file=sys.stderr)
        sys.exit(1)

    # Convert to grayscale for processing
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Histogram equalization to maximize pixel variance
    equalized = cv2.equalizeHist(gray)

    # 2. Unsharp masking: enhance edges via high-boost filter
    # Kernel: [[-1,-1,-1],[-1,9,-1],[-1,-1,-1]] - sharpens, increases gradient magnitude
    kernel = np.array([[-1, -1, -1],
                       [-1,  9, -1],
                       [-1, -1, -1]], dtype=np.float32)
    sharpened = cv2.filter2D(equalized, -1, kernel)

    # 3. Resize to minimum 800x800 with cubic interpolation
    h, w = sharpened.shape[:2]
    scale = max(w, h, 800) / max(w, h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(sharpened, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    cv2.imwrite(output_path, resized)
    print(f"Enhanced image saved to {output_path} ({new_w}x{new_h})")


def recompile_mind(target_dir: str, mind_output: str) -> None:
    """Recompile .mind file from enhanced target images."""
    cmd = f"npx mind-ar-compiler -i {target_dir} -o {mind_output}"
    print(f"Compiling: {cmd}")
    os.system(cmd)


def main():
    parser = argparse.ArgumentParser(description="Enhance AR target images for better tracking")
    parser.add_argument("input", help="Input image path")
    parser.add_argument("output", help="Output image path")
    parser.add_argument("--mind", help="Output .mind file path")
    parser.add_argument("--target-dir", help="Directory of target images for compilation")
    args = parser.parse_args()

    enhance_target_image(args.input, args.output)

    if args.mind and args.target_dir:
        recompile_mind(args.target_dir, args.mind)


if __name__ == "__main__":
    main()