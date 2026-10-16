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

## Sky lighting (`sky/`, Poly Haven, CC0)

A partly cloudy midday sky. The 1K HDRI (1024×512) lights the scene and
shows in reflections; it isn't drawn as the backdrop.

- Name: Kloofendal 48d Partly Cloudy (Pure Sky)
- Authors: Greg Zaal (original), Jarod Guest (sky edits)
- Source: https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/
  (Poly Haven's entire library is CC0)

| File | Size |
| --- | --- |
| `sky/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | 1.37 MB |

## Sky backdrop (`sky/campus_sky.jpg`, generated with Google Gemini)

The sky you see. Made from an image generated with Google AI (Gemini) for
this project: only the clouds and blue sky were kept (the generated picture
also had buildings and trees along the bottom, which were cropped out), the
strip was made to wrap seamlessly and repeated twice round a 4096×2048
panorama, with a gradient up to a deep blue zenith and a soft haze below the
horizon. 0.24 MB.

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
| `nature/Bush_Hedge.glb` | the pack's `Bush_Common`, leaf texture recoloured from red to green | 149 KB |
| `nature/Bush_Common_Flowers.glb` | bush (flowering) | 218 KB |
| `nature/Grass_Common_Tall.glb` | grass clump | 20 KB |
| `nature/Flower_3_Group.glb` | flower patch | 168 KB |

Note on the 300 KB/file target: `CommonTree_3` and `CommonTree_4` land at
~320–330 KB (textures are already down to 128px; the rest is mesh data I
have no tool here to simplify further, e.g. Blender). If that's a hard
limit, `CommonTree_5` (277 KB) is the one that fits cleanly, and I can drop
to two tree variants instead of three.

## Animals (`animals/`, Quaternius Low Poly Animals, CC0)

Used as downloaded (a self-contained `.glb`, no edits): one skinned mesh, 3,604
triangles, one 512x512 colour palette texture (6 KB), rigged with eight clips
(Idle, Idle_Eating, Walk, Run, Jump_Start, Jump_Loop, Headbutt, Death).

- Author: Quaternius (https://quaternius.com)
- Source: https://poly.pizza/m/2kUk0QqpCg (the "Dog" model, uploaded 15 Nov 2023;
  part of Quaternius's Low Poly / Animated Animal packs)
- Licence: Creative Commons Zero (CC0 1.0 / Public Domain), https://creativecommons.org/publicdomain/zero/1.0/

| File | Used as | Size |
| --- | --- | --- |
| `animals/dog.glb` | the dog in front of building 154 | 290 KB |

## Furniture (Kenney Furniture Kit)

All from the Furniture Kit, `Models/GLTF format/`, unmodified.

- Author: Kenney (https://www.kenney.nl)
- Source: https://kenney.nl/assets/furniture-kit
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/
  (stated on the asset page and in the pack's `License.txt`). Credit is not
  required but is given here anyway.

| File | Used as |
| --- | --- |
| `chairDesk.glb` | desk chair |
| `desk.glb` | desk |
| `computerScreen.glb` | monitor |
| `pottedPlant.glb` | potted plant |
| `plantSmall1.glb` | small plant on a coffee table |
| `bookcaseClosedWide.glb` | bookcase |
| `loungeDesignSofa.glb` | sofa |
| `tableCoffeeGlass.glb` | coffee table |
| `lampRoundFloor.glb` | floor lamp |
| `kitchenBar.glb` | coffee bar counter |
| `loungeSofa.glb`, `loungeSofaLong.glb`, `loungeChair.glb` | sofas and armchairs in the COMMON lounge |
| `table.glb`, `stoolBar.glb` | the big reading table and its stools (COMMON) |
| `bookcaseOpen.glb` | open shelves in the COMMON lounge |
| `kitchenCoffeeMachine.glb` | coffee machine |

## Textures (`tex/ai/`, generated with Google Gemini)

Generated with Google AI (Gemini) for this project and resized to 1024×1024
JPG (colour map only). Each one tiles: one tile is about 2 m of floor (or one
storey of facade).

| File | Used as |
| --- | --- |
| `tex/ai/facade_154.jpg` | building 154's white cladding with a ribbon window |
| `tex/ai/paving.jpg` | outdoor paving and the path |
| `tex/ai/grass.jpg` | the lawn and the grass round the campus |
| `tex/ai/carpet.jpg` | classroom carpet tiles |
| `tex/ai/wood_floor.jpg` | Student Hub floorboards |
| `tex/ai/library_floor.jpg` | Chifley Library's dark floorboards |

## Music

`A_Long_Silence_Observed.mp3`, `Morning_at_the_Quad.mp3` (campus),
`Margin_Notes.mp3` (Student Hub), `The_Library_Window.mp3` (classroom),
`Sunlight_on_Glass.mp3` (Chifley Library) — Music
generated with Google AI (Gemini) for this project.

Everything else in the scene (room shells, characters, sticky notes, UI) is
built from Three.js primitives and HTML/CSS in code.
