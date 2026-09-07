"""Cut the generated glyph sheet into compact transparent PNGs. Requires Pillow.

Usage: python scripts/prepare-icon-atlas.py path/to/generated-sheet.png
"""
from pathlib import Path
import sys
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(sys.argv[1]).convert('RGB')
# The generated sheet's rows need explicit trimming before uniform packing.
row_bands = [(32, 250), (260, 463), (475, 681), (689, 873), (893, 1091)]
reference_height = 1145
cell_size = 64
names = re.findall(r"'([a-z-]+)'", (ROOT / 'src/game-icons.ts').read_text().split('] as const')[0])
assert len(names) == 30
output = ROOT / 'src/assets/icons'
output.mkdir(parents=True, exist_ok=True)
total = 0
for row, (top, bottom) in enumerate(row_bands):
    for column in range(6):
        crop = source.crop((
            round(column * source.width / 6 + source.width * 12 / 1374),
            round(top * source.height / reference_height),
            round((column + 1) * source.width / 6 - source.width * 12 / 1374),
            round(bottom * source.height / reference_height),
        ))
        # Remove the generated backdrop and its subtle noise before downsizing.
        mask = crop.convert('L').point(lambda value: 255 if value > 65 else 0)
        bounds = mask.getbbox()
        if bounds is None:
            raise ValueError(f'Empty icon at row {row}, column {column}')
        crop = crop.convert('RGBA')
        crop.putalpha(mask)
        crop = crop.crop(bounds)
        crop.thumbnail((50, 50), Image.Resampling.LANCZOS)
        icon = Image.new('RGBA', (cell_size, cell_size))
        icon.paste(crop, ((cell_size - crop.width) // 2, (cell_size - crop.height) // 2))
        path = output / f'{names[row * 6 + column]}.png'
        indexed = icon.quantize(colors=32, method=Image.Quantize.FASTOCTREE)
        palette = indexed.getpalette('RGBA')
        for alpha in range(3, len(palette), 4):
            if palette[alpha] >= 240:
                palette[alpha] = 255
        indexed.putpalette(palette, rawmode='RGBA')
        indexed.save(path, optimize=True)
        total += path.stat().st_size
        exported = Image.open(path).convert('RGBA')
        assert exported.getchannel('A').getextrema() == (0, 255)

assert total < 40_000, 'PNG set exceeds the 40 KB budget'
print(f'{output}: 30 transparent 64x64 PNGs, {total:,} bytes total')
