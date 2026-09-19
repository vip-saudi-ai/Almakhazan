"""Decodes the codes written by tools/verify-qr.mjs with OpenCV.

    pip install opencv-python-headless
    node tools/verify-qr.mjs && python3 tools/verify-qr.py

Exits non-zero if any payload does not come back exactly as it went in.
"""
import json
import sys

import cv2
import numpy as np

QUIET = 4
SCALE = 8

codes = json.load(open('/tmp/qr-verify/codes.json'))
detector = cv2.QRCodeDetector()
failures = []

for text, rows in codes.items():
    n = len(rows)
    size = (n + QUIET * 2) * SCALE
    image = np.full((size, size), 255, np.uint8)
    for y, row in enumerate(rows):
        for x, module in enumerate(row):
            if module == '1':
                top = (y + QUIET) * SCALE
                left = (x + QUIET) * SCALE
                image[top:top + SCALE, left:left + SCALE] = 0

    result = detector.detectAndDecode(image)
    decoded = result[0] if isinstance(result[0], str) else result[1]
    status = 'ok' if decoded == text else 'MISMATCH'
    if decoded != text:
        failures.append((text, decoded))
    print(f'{status:9} {text!r} -> {decoded!r}')

print(f'\n{len(codes) - len(failures)}/{len(codes)} decoded correctly')
sys.exit(1 if failures else 0)
