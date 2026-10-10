# Asset credits

## Characters (`char/`, Kenney Mini Characters, CC0)

Rigged humanoid characters with a shared skeleton and animation set (idle,
walk, sprint, jump, emotes and more — see the PROCESS/handoff notes for the
full clip list). `Textures/colormap.png` is one shared texture atlas used by
both files (and by every other variant in the pack), so it must ship
alongside them.

- Author: Kenney (https://www.kenney.nl)
- Source: https://kenney.nl/assets/mini-characters
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/
  (stated on the asset page and in the pack's `License.txt`).

| File | Notes |
| --- | --- |
| `char/character-male-a.glb` | male variant |
| `char/character-female-a.glb` | female variant |
| `char/Textures/colormap.png` | shared texture atlas for both |

## Sky (`sky/`, Poly Haven, CC0)

A clear-sky daytime HDRI, 1K equirectangular (1024×512), for `RGBELoader`.

- Name: Autumn Field (Pure Sky)
- Authors: Sergej Majboroda (original), Jarod Guest (sky edit)
- Source: https://polyhaven.com/a/autumn_field_puresky
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/
  (Poly Haven's entire library is CC0)

| File | Size |
| --- | --- |
| `sky/autumn_field_puresky_1k.hdr` | 1.04 MB |

## Nature (`nature/`, Quaternius Stylized Nature MegaKit, CC0)

Converted from the pack's `.gltf` + `.bin` + textures into self-contained
`.glb` (via `gltf-pipeline -b`). Each model's normal map was dropped (the
scene uses flat/Lambert shading, so it wasn't doing anything) and its colour
textures were resized down (to 128–256px) to fit the size budget — this pack
ships 2048px textures by default, which is far more than a tiled, stylised
low-poly scene needs.

- Author: Quaternius (https://quaternius.com)
- Source: https://quaternius.com/packs/stylizednaturemegakit.html (standard/free
  version mirrored at https://opengameart.org/content/stylized-nature-megakit)
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/

| File | Used as | Size |
| --- | --- | --- |
| `nature/CommonTree_5.glb` | tree | 277 KB |
| `nature/CommonTree_3.glb` | tree | 320 KB |
| `nature/CommonTree_4.glb` | tree | 330 KB |
| `nature/Bush_Common.glb` | bush | 120 KB |
| `nature/Bush_Common_Flowers.glb` | bush (flowering) | 218 KB |
| `nature/Grass_Common_Tall.glb` | grass clump | 20 KB |
| `nature/Flower_3_Group.glb` | flower patch | 168 KB |

Note on the 300 KB/file target: `CommonTree_3` and `CommonTree_4` land at
~320–330 KB (textures are already down to 128px; the rest is mesh data I
have no tool here to simplify further, e.g. Blender). If that's a hard
limit, `CommonTree_5` (277 KB) is the one that fits cleanly, and I can drop
to two tree variants instead of three.

## Furniture (Kenney Furniture Kit)

All from the Furniture Kit, `Models/GLTF format/`, unmodified.

- Author: Kenney (https://www.kenney.nl)
- Source: https://kenney.nl/assets/furniture-kit
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/
  (stated on the asset page and in the pack's `License.txt`). Credit is not
  required but is given here anyway.

| File | Used as |
| --- | --- |
| `loungeSofa.glb` | sofa |
| `tableCoffee.glb` | coffee table |
| `table.glb` | table |
| `chair.glb` | chair |
| `chairDesk.glb` | desk chair |
| `desk.glb` | desk |
| `pottedPlant.glb` | potted plant |
| `bookcaseOpen.glb` | bookcase |

## Textures (`tex/`, ambientCG, CC0)

512×512 JPG, colour map only (no normal/roughness/etc. maps kept). Each
resized down from the source's 1K colour map.

- Author: ambientCG contributors (https://ambientcg.com)
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/

| File | Source asset | URL |
| --- | --- | --- |
| `tex/grass.jpg` | Grass005 | https://ambientcg.com/a/Grass005 |
| `tex/pavement.jpg` | PavingStones151 | https://ambientcg.com/a/PavingStones151 |
| `tex/brick.jpg` | Bricks097 | https://ambientcg.com/a/Bricks097 |
| `tex/carpet.jpg` | Carpet016 | https://ambientcg.com/a/Carpet016 |
| `tex/woodfloor.jpg` | WoodFloor051 | https://ambientcg.com/a/WoodFloor051 |

## Music

`StudentHub.mp3`, `Classroom.mp3`, `Outdoor_Map.mp3` — Music generated with
Google AI (Gemini) for this project.

Everything else in the scene (room shells, characters, sticky notes, UI) is
built from Three.js primitives and HTML/CSS in code.
