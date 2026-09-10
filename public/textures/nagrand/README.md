# Nagrand ground

`ground.png` is an AI-reconstructed, top-down 4-by-4 square-slab atlas based on
the Nagrand arena reference images supplied by the user. It is not a direct
pixel crop: perspective, props, and cast shadows were removed in reconstruction.

The tile renderer selects sixteen individual square slabs through mesh UVs and
adds alternating brightness. Team and draw-square material hues are retained.

`platform-grass.png` is a separate continuous olive-green turf texture generated
with the built-in image-generation tool. The platform repeats it every 5.76
world units (three board cells), using sRGB color and the existing scene lighting.
This separates the surrounding platform and gaps from the playable stone slabs.

Generation prompt:

> Use case: stylized-concept. Asset type: seamless square 1024x1024 game ground albedo texture for a Warcraft-like Nagrand arena platform. Create a continuous carpet of dense short grassy turf, muted olive and moss greens, a few subtle patches of warm brown earth and dried straw. Hand-painted fantasy game texture with small readable grass tufts and soft organic mottling, medium-dark restrained value, clearly green overall. Orthographic straight-down view, flat even diffuse illumination, no directional shadows or baked highlights. Seamlessly tileable on all four edges with uniform density and brightness. NO paving stones, NO tiles, NO grid, NO borders, no large rocks, no flowers, no objects, no text. Entire canvas is the texture, no mockup or perspective.
