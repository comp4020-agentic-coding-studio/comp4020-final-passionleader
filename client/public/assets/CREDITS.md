# Asset credits

## Characters (`char/`, Kenney Mini Characters, CC0)

Rigged humanoid characters with a shared skeleton and animation set (idle,
walk, sprint, jump, emotes and more). `Textures/colormap.png` is one shared texture atlas used by
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

The sky you see (replaced 29 October 2026: the earlier one read as storm
clouds). Made from a sky image generated with Google AI (Gemini) for this
project: the picture fills the upper half of a 4096×2048 panorama, twice,
each copy blended into the next so it wraps round without a seam, with the
horizon's colours fading to a pale haze below it.

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
| `nature/CommonTree_5.glb` | trees along the road and the creek (squeezed narrow as poplars) | 277 KB |
| `nature/CommonTree_3.glb` | trees in the grove north of Badger & Co | 320 KB |
| `nature/CommonTree_4.glb` | the willows along Sullivans Creek (leaves tinted gold) | 330 KB |
| `nature/Bush_Hedge.glb` | the pack's `Bush_Common`, leaf texture recoloured from red to green | 149 KB |
| `nature/Bush_Common_Flowers.glb` | bush (flowering) | 218 KB |
| `nature/Grass_Common_Tall.glb` | grass clump | 20 KB |
| `nature/Flower_3_Group.glb` | flower patch | 168 KB |

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
| `animals/dog.glb` | the dog on the lawn | 290 KB |

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
| `loungeSofa.glb`, `loungeSofaLong.glb`, `loungeChair.glb` | sofas and armchairs in the ANUSA Student Lounge (and the Career Hub's waiting sofas) |
| `stoolBar.glb` | stools at the ANUSA lounge's and Lab Coffee's counters |
| `trashcan.glb`, `coatRackStanding.glb`, `plantSmall2.glb`, `plantSmall3.glb`, `books.glb`, `rugRectangle.glb` | small props (bins, coat stand, desk plants, books, doormat) |
| `bookcaseOpen.glb` | open shelves in the ANUSA Student Lounge |
| `kitchenCoffeeMachine.glb` | coffee machines (Hub, ANUSA, Lab Coffee) |
| `toilet.glb` | the toilets in the Poop Room's stalls (brought over from crit 8) |
| `laptop.glb`, `computerKeyboard.glb`, `computerMouse.glb`, `lampSquareTable.glb` | the staff's desks (Hub, library, Career Hub, the tents) |
| `bookcaseClosedDoors.glb`, `cardboardBoxClosed.glb` | a cupboard and archive boxes behind them |

## Textures (`tex/ai/`, generated with Google Gemini)

Generated with Google AI (Gemini) for this project and resized to 1024×1024
JPG (colour map only). Each one tiles: one tile is about 2 m of floor (or one
storey of facade).

| File | Used as |
| --- | --- |
| `tex/ai/facade_154.jpg` | building 154's white cladding with a ribbon window |
| `tex/ai/paving.jpg` | outdoor paving and the path |
| `tex/ai/grass.jpg` | the lawn and the grass round the campus |
| `tex/ai/carpet.jpg` | carpet tiles (classrooms, meeting rooms, ANUSA, the Career Hub) |
| `tex/ai/wood_floor.jpg` | Student Hub floorboards |
| `tex/ai/library_floor.jpg` | Chifley Library's dark floorboards |
| `tex/ai/interior_wall.jpg` | painted plaster on indoor walls (tinted per room) |
| `tex/ai/library_wall.jpg` | Chifley Library's wood panelling |
| `tex/ai/wood_tabletop.jpg` | desks, tables and the lectern |
| `tex/ai/poster_hub.jpg`, `poster_classroom.jpg`, `poster_meeting.jpg` | framed posters (flat illustrations, no text) |
| `tex/ai/poster_art.jpg` | an abstract painting, framed on bare walls (the classrooms, the ANUSA lounge and the Career Hub; scaled down to 1200 px) |

## Sound effects (`sfx/`, Kenney, CC0)

From Kenney's "Interface Sounds" (`click_002`, `open_001`, `close_001`,
`confirmation_001`, `drop_002`, `error_004`) and "Impact Sounds"
(`footstep_concrete_*`, `footstep_wood_*`, `footstep_carpet_*`,
`impactPlank_medium_000`), unmodified `.ogg` files.

- Author: Kenney (https://www.kenney.nl)
- Source: https://kenney.nl/assets/interface-sounds and https://kenney.nl/assets/impact-sounds
- Licence: Creative Commons Zero (CC0 1.0), stated in each pack's `License.txt`.

`dog_bark.ogg` (the dog on the lawn): two barks cut from "Barking dog #1"
(0.9 s from 3.75 s), levelled, faded and re-encoded at 22 kHz mono.

- Author: Joseph Sardin, BigSoundBank
- Source: https://bigsoundbank.com/detail-0916-barking-dog.html
- Licence: Creative Commons Zero (CC0 1.0), stated on the sound's page.

## Music

`Noon_On_The_Green.mp3`, `Dappled_Sunlight_Trail.mp3`,
`Windows_Down_in_July.mp3` and `Along_the_Griffin_Lake.mp3` (campus),
`Margin_Notes.mp3`, `The_Library_Window.mp3`, `Common_Room_Afternoon.mp3`,
`The_Velvet_Clearing.mp3` and `Midnight_Rain_on_the_Glass.mp3` (shared by the
Student Hub, the classrooms, the ANUSA Student Lounge, the Career Hub and
their meeting rooms),
`Sunlight_on_Glass.mp3` and `Where_The_Light_Settles.mp3` (Chifley Library
and its team rooms) — Music generated with Google AI (Gemini) for this project.

`Calm_Loop.mp3` (the Poop Room, as in crit 8):

- Track: "Calm Loop" (file `Relaxing.mp3`, unmodified, renamed)
- Author: wipics (https://opengameart.org/users/wipics)
- Source: https://opengameart.org/content/calm-loop
- Licence: Creative Commons Zero (CC0 1.0), https://creativecommons.org/publicdomain/zero/1.0/
  (stated on the item page). Credit is not required but is given here anyway.

The Poop Room's fart is synthesised in the browser with the Web Audio API
(`client/src/sfx.ts`, crit 8's sound); no recorded asset is used.

The Campus Guide's clips (`guide/*.webp`) are screen recordings of the app
itself, made by the author.

Everything else in the scene (room shells, buildings, tents, sticky notes,
the UI, the app's icons) is built from Three.js primitives and HTML/CSS in
code. The academic calendar's dates are from ANU's University Calendar and
the Academic Skills summary from ANU's pages (both linked where shown); the
AI assistants answer from ANU's public pages, read by the app's own crawler.

## Seongsu's ghost

`npc/boo.glb`: "Boo", a little ghost in sneakers, from Fab
(https://www.fab.com/listings/a1830c99-ca66-48e0-aea3-b3d0fa6ebf12), licensed
under Creative Commons Attribution 4.0 (CC BY 4.0,
https://creativecommons.org/licenses/by/4.0/). Used unchanged as the model
for the author's assistant on the picnic bench north of Badger & Co; its
backdrop plane and turntable are hidden in code, not edited out of the file.

## Map data

Where Badger & Co., Sullivans Creek, its footbridge and the lawn sit relative
to 154 and 155 was checked against OpenStreetMap data (an export of the
area around Kambri), read for positions only: no map tiles or OSM files ship
with the app. Map data © OpenStreetMap contributors, available under the Open
Database Licence (ODbL), https://www.openstreetmap.org/copyright.
