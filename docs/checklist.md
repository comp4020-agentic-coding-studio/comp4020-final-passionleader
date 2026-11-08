# Integrated checklist (English translation)

> This is a translation of my own planning checklist (`Integreted_checklist.md`),
> which I kept in Korean outside the repo for the whole project. It is
> translated as it stood on 9 November 2026, so a few items marked open here
> were finished that day (the README, PROCESS, diagrams 8–12, the final audit
> and the research note). Their commits are in the history. Local network
> addresses, local file paths for secrets and account details were left out.
> The item numbers are the same ones the commit messages and `docs/plan.md`
> use.

> The whole file was reorganised on 2026-10-29. The original (every record
> from 10/16 to 10/25, with long explanations) is kept in a local backup.
> Commit messages, `docs/plan.md` and the documents refer to these numbers, so
> **they never change**. New items start at 83.
> Dates are commit dates (Canberra time), or the day it was checked when there
> is no commit.
> **As of the night of 11/4: next work on Sat 11/7. Start from "Next week (Sat
> 11/7 – Mon 11/9 12:00)" under "To do".** Last push `3f7eba1` (CI passed).

## How to use this file (when I say "update it")

1. New work goes at the bottom of **"To do"** with the next number.
2. Finished work moves to the matching group in **"Done"**, written as
   `- [x] number. title: one or two lines (MM/DD, commit)`.
3. Partly finished work stays in "To do", with only the finished part noted
   as `(partly ✅ MM/DD commit)`.
4. When unsure, leave it in "To do".
5. Format: done `- [x]`, open `- [ ]`, in progress `- [~]`, decided against
   `- [-]` (one line of reason).

---

# Done

## Foundation · accounts · permissions

- [x] 0. Live position and action sync (WebSocket) (10/10, `1cb36a4`, `a83202c`)
- [x] 1. Test accounts `qa_master` (admin) + `qa_bot01`–`10`, a DB `role` column, secrets kept outside the repo (10/11, `d4d4645`). Sign-in problems caused by phone keyboards → names and passwords normalised (NFKC, spaces) (10/17, `606b59d`). Student-number hint on the first screen (10/11, `1ba3c0f`)
- [x] 2. WebSocket and data split by space (you only see and hear people in the same space) (10/11, `d4d4645`)
- [x] 3. Doors + E to move between spaces, only one space rendered at a time (10/11, `70b03b9`)
- [x] 38. Sign-up, sign-in, guests and roles redesigned (= 1a, email verification). A six-digit code to an ANU address (SES), passwords of 8+ with reset, guests `guestNNN` (no posts, comments, hearts, files or reporting people), old free-name accounts retired, sign-in by student number, a four-step sign-up wizard (10/24, `d6ffb2d`, `809a492`, `468280d`, `b7d7264`). Security review applied (guests cleaned up after 30 days, IP limits, kicked on reset) (10/24, `d3a2a9c`). Sign-in no longer judges names (10/25, `b4d60ea`). Sonnet's real-app QA: 7 passed
  - [-] 1b (guests get one note per space): dropped in 38. Guests may not stick notes at all (user, 10/25)
- [x] 38-staff. Staff rights: write Notices, open and close classrooms, set board links, read private enquiries (checked on the server) (10/24, `b55216c`). Note: the staff name-tag badge and staff-only first entry to counselling rooms were not done → see 115
- [x] 80. 🚪 Sign out for members (not guests) (10/25, `35d85d3`, pushed)
- [x] 10. Server log: one JSON line per action (who, what, when, never chat text or movement), refusals logged as "refused" (10/16, `d1a50b3`, `114ae4f`). The admin's 7-day log + bug reports (Hub reception PC, `/admin/`) (10/16, `9fe0e7f`), bug report screenshots in S3 (10/17, `606b59d`, `8dce598`)
- [x] 33 (partly). Reporting a person (last 5 minutes of chat attached) + admin Restrictions (1 hour to 1 year) (10/17, `919fbc5`). Mute (on your own screen only) (10/24, `74cdbb7`). Reporting posts and comments (10/24, `2a387e0`). The rest → 115
- [x] 54. A "coming in" ban kicks at once, checked + a plain kick (10/24, `74cdbb7`)

## Map · spaces

- [x] 4. Campus outside: 155 and 154 exteriors and paths, trees, flowers and hedges at the edges, sky, benches, 154's sign, eaves and doors lined up, Gemini textures, lawn moved 3 m west (10/11, `12f9cac`, `7182068`, `c868ed3`, `c9a9159`, `82dd867`, `f120cbf`)
- [x] 4a. Background buildings (the white row to the north, O'Donoghue, red brick to the east, the library's exterior and bridge to the south), walkable area limited on both server and client (10/16, `ae865a6`). Shops on the white building's ground floor: Symposium, Subway, Broger (10/16, `6482ea5`, `f49db81`)
- [x] 4b. The asphalt road east of 154 extended north, no centre line (10/16, `b908505`, `6482ea5`)
- [x] 5. Student Hub inside: enlarged, 6 counselling room doors, an office + lounge, wooden floor, softer indoor light (10/11, `865dc15`, `ced558a`, `32f084d`). Three arcade machines (10/16, `185cfc5`). Rearranged (reception ┘, admin desk) (10/17)
- [x] 6. COMP8020 classroom (renamed from COMP8280 to COMP8020), board lettering, carpet (10/11, `149ebbe`). 6a exit door behind the right-hand wall (10/16, `fb17501`)
- [x] 26. Chifley Library inside: main door at the end of the bridge, reception + 3 search PCs (room booking in the app, catalogue and research ethics in a new tab), bookcases, study desks, light through arched windows (10/16, `f480247`, `a84c5e9`, `185cfc5`). Beige floor (10/17, `6654fe5`). 70 research ethics shown as a pile of papers (10/24, `47f3ef2`)
- [x] Lab Coffee (north-west of 154) + a list of 12 campus cafés, each located by a Google Maps link (10/17, `8031751`, `0d94d7c`)
- [x] 53. (= 32a) Outdoor minimap on PC, names of the buildings you can enter (10/24, `17e00c4`)
- [x] 58·61. Lawn noticeboard moved south of Broger's flower bed, the white east-west path continues across the asphalt (10/24, `c294ef3`, `47f3ef2`)
- [x] 59. ANU Sport blue tent + PC (new tab) + an NPC spot. Moved to x −45.5 after the white building was extended (10/24, `2a387e0`, 10/25, `0b671bb`)
- [x] 60. Lawn → Sullivans Creek (west): Badger & Co (OpenStreetMap position), University Ave bridge, creek twice as wide and endless north–south, deck and fence, western walk limit x −51 (the creek is scenery), picnic tables and trees, yellowed footpath (10/24, `3a75640`, `1068101`, `50a1413`, `4aa1ce3`, 10/25, `b4d60ea`, `0b671bb`). Remaining S-curve and bike path → 76
- [x] 62. Easter egg Poop Room: a "Staff only" door at the east end of Lab Coffee, inside Q→1 💩 (10/24, `8305f7c`). Rule changes → 104
- [x] 68. COMMON removed, replaced by the ANUSA Student Lounge (up the stairs of 154): twice the size, furniture, two meeting rooms (10/24, `f113d34`, `ff9c5ed`)
- [x] 154: benches, half-depth eaves, eaves over the ANUSA entrance, green sign (10/24, `6625026`, `d6ffb2d`). First-visit spawn next to the advertising board (5, −28) (10/25, `0b671bb`)
- [x] 35 (partly). Wind in leaves, grass and flowers on High (10/24, `fe3f6c0`), 35a moving clouds (10/24), library north-window light restored, light through the west glass walls of the Hub and ANUSA (10/25, `def9c3f`). The rest → 105
- [x] 76 (partly). Matched Badger's position by overlaying map.osm in Python, no Blender, ODbL in CREDITS (10/24, `1068101`). The rest → 76

## Communication

- [x] 7. Chat (speech bubble + bottom left, gone after a minute), your own chat on the left too (10/11, `70b03b9`, `5091344`)
- [x] 8. Q action menu (wave, yes/no, How ya doing mate, dance) + voice lines, female figures get a female voice (10/11, `88a384a`, `b8da036`). 50 emotes limited to one per 2 seconds (server) (10/24, `47f3ef2`)
- [x] 9. Sticky notes: stick, read with E, choose between overlapping notes, bright colours, thin border (10/11, `2390eb1`, `4126b9b`, `a08a08e`). Gone after a month, none in the Hub, none within 2 m of a door, 40% smaller (10/16, `35731bc`). 45 an opened note comes to the top (10/24, `47f3ef2`)
- [x] 46. Notes and every board: 46a hearts (only the most-hearted pinned as 🔥 HOT) (10/24, `2a387e0`, `8ec1bbe`, 10/25, `bcb6369`), 46b reporting (`2a387e0`), 46c delete confirmation (`c294ef3`)
- [x] 16. Mailbox: send by name, read when they come in (10/24, `62f0a52`)
- [x] 17. Whisper `/w name` (members only, not stored) (10/24, `e614240`)
- [x] 51. `/all` chat to every space (30-second limit) (10/24, `74cdbb7`)
- [x] 32. Online count per space (HUD, classroom picker) (10/17, `2e53582`)
- [x] 21·22·30. Meeting rooms: 6 counselling rooms in the Hub (by invitation), 3 team rooms per classroom + 4 in the library (open), at most 6 people (server), chat and invitations cleared when a room empties, host handed over (10/16, `ed5d0ef`, `185cfc5`). File attachments in S3, images shown (10/17, `606b59d`, `470f623`). Toolbar + Chat button with unread count, warning for the last one out (10/17, `0340a68`, `502cfc4`)
- [x] 37. Meeting room "Save chat" (the saver only, 30 days, 50 saves, "Saved chats" tab in the mailbox) (10/24, `e4b1419`)
- [x] 39. Shared Markdown notes in meeting rooms (last write wins) (10/24, `5e1169c`)
- [x] 64. Private enquiry PC in the Hub (choose public or private, private = writer + staff) (10/24, `2a387e0`)
  - [-] 36 (one-to-one counselling and private enquiries): replaced by the 64 private enquiry PC + 17 whispers (10/24 bundle table)
  - [-] 18 (attachments in one-to-one chat): replaced by meeting room files (10/24 bundle table)
- [x] 23. Sit on chairs, sofas and benches with E (live, one person per seat) (10/16, `e23c0e2`). 55 jumping on sofas (10/24, `47f3ef2`, `b5ff887`). Standing up moves you forward (10/24, `ff9c5ed`)

## Boards · web links · PCs

- [x] 11a. Classroom picker on entering 155 (two steps), the admin adds and closes classrooms (10/16, `fb17501`, `658447e`). 11 classrooms auto-close after 6 months (10/24, `74cdbb7`)
- [x] 11c. Classroom boards Q&A, Notices, Board, file attachments (10/16, `ea18534`, 10/17, `606b59d`). 67 shaped like a PC (10/24, `c294ef3`)
- [x] 11b (partly). COMP8020 right-hand board = classmates' final project list (every 6 hours, kept across restarts), other classrooms get a link from the admin (10/16, `185cfc5`, 10/17, `1f7e78a`). 69 new tab / web view checkbox (10/24, `c294ef3`). Guestbook → 115
- [x] 12·63. Hub board → "Lab matching board" (two tabs, Ask the Hub taken out), unofficial notice (10/17, `f13eaef`, 10/24, `c294ef3`)
- [x] 12a·47. Lawn noticeboard (thumbnail grid), posts deleted after 30 days + a note saying so (10/17, `a67eece`, `c388d44`, `5190b64`, 10/24, `c294ef3`)
- [x] All boards: Markdown bodies, chalkboard look, authors edit their own posts and comments (10/17, `f34664d`, `5190b64`, `a1eabc5`). 40 Esc closes (10/24, `47f3ef2`)
- [x] 68a. Study group board (beside 155's entrance, group size, joining) (10/24, `ff9c5ed`)
- [x] 66. Wall calendar in the Hub (E → ANU calendar in a new tab) (10/24, `2e49ba0`, `cda0bbf`, 10/25, `caf7e54`). Our own calendar → 103
- [x] 27·65. Hub reception: matching PC → researcher portal (new tab) → a pile of AI essentials documents (10/17, `f13eaef`, 10/24, `c294ef3`)
- [x] 25·41. Web pages with E: an in-app window (sites that block it open in a new tab), phone Use button bug, "new tab" wording (10/16, `fb17501`, `79bf5df`, 10/24, `74cdbb7`)
- [x] 28. Sketch & Guess on the Hub arcade machine (moved onto our server, 11 specs) (10/16, `114ae4f`)
- [x] 29·44. A dog in front of 154 + "Buy me a feed" (new tab), barking, happy several times (10/16, `39f786e`, 10/17, `8e0c987`, 10/24, `47f3ef2`)
- [x] 48·57·74·75. First screen "This isn't a game…", E badge (changes colour only), E explanations taken off signs, E badge height, meeting room notice cut off (10/18, `5f33b61`, 10/24, `47f3ef2`)
- [x] 49. Times shown in Canberra time (10/24, `47f3ef2`)

## Settings · customisation · graphics · sound

- [x] 13 (partly). Graphics Low/High (default Low) (10/11, `c8ae34e`), music and sound-effect sliders + a BGM player on PC (10/16, `4a0c6de`), shared playlists per space (10/17, `fadfac8`, `121d5ff`, `2d2a234`). The rest → 115
- [x] 13a. Sound effects (footsteps by floor, doors, windows, sitting, chat ping, notes, refusals, Kenney CC0) (10/16, `e23c0e2`)
- [x] 14. Character customisation (2 bodies + 6 skins, 10 hair, 10 tops, 10 bottoms + 6 hats) (10/16, `e23c0e2`), 3 bugs (gun, skin, hat) (10/17, `121d5ff`). 42 hat colour, 43 yellow hard hat for qa, 52 hanger button, 52a face outline (10/24, `47f3ef2`, `196d664`)
- [x] 15 (partly). 15a–15i placeholders tidied, labels, phone overlaps, indoor windows, props, colours, furniture, loading fade, fake lighting (10/16, `e23c0e2`), phone HUD overlaps (10/16, `eb5c9fd`), hidden-attribute bug (10/16, `e9fc496`), library atmosphere (10/16, `185cfc5`). Phone: volume, new tab, zoom, blue selection (10/17, `276292a`). The rest (real phone performance) → 115
- [x] 72. Six "Things to try" quests on desktop (skippable) (10/24). Mobile and guide merged → 112

## AI assistants (NPCs)

- [x] 56·71 (foundation). Five assistants (Robin in the library, Kai at ANU Sport, Sam at ANUSA, Priya for courses and Alex for careers in the Hub), a chat window, a "nothing is stored" notice, office props (10/24, `cc92d65`, `da3e648`), E positions (10/24, `3810938`), out-of-credit message NPC-CREDIT (10/24, `7354a25`). Bedrock Nova 2 Lite, 200 a day in all and 30 per person (10/25, `1f07dd2`, `d819ce2`), answers grounded in their own pages with Markdown links (10/25, `98fc799`, `6e145ac`). Quality → 78
- [x] 73b. Research: which pages can be crawled, `soco-fast` = the School's Qwen (unreachable from Fly), what removing COMMON affects, moving existing users (10/24)

## AWS

- [x] A0. Root MFA (passkey), Budget alerts (10/17, user). The Budget **only alerts** (user correction 10/29: the free tier has no automatic stop → there is no automatic stop. Older notes and the plan file's claim of "two layers of protection" are wrong and must not go into documents. The only stop is the server's limit (78))
- [x] A1. Private S3 bucket, the browser uploads directly with a signed five-minute link, deleted after 30 days, 200 MB (10/17, `606b59d`, `8dce598`, `470f623`)
- [x] A2. SES sender `no-reply@passionleader.click`, production access approved (10/24, user), wired into the server (10/24, `d6ffb2d`)
- [x] Bedrock: IAM `bedrock:InvokeModel` only, Nova 2 Lite (`NPC_MODEL` secret), Haiku 4.5 calls checked (10/25)

- [-] A4. RDS: not built (SQLite is what the course expects, enough for the scale, and RDS costs more)

## This week's build, 10/29–10/30 (main Opus + helper QA + user live QA, pushed up to `3b93a50`, CI and deploy passed)

- [x] 78. RAG for the AI assistants: a crawler (`server/crawl.ts`, 2 seconds apart, robots.txt, a contact User-Agent, monthly by itself once a first crawl is seeded) + `knowledge.db` (FTS5, candidates per source, ranked by word match, weight on titles and subheadings, price questions get price tables first) + no model call when no source matches + a model per NPC (Priya, Alex, Jordan = Haiku 4.5, the rest Nova 2 Lite) + limits (30 per person, 50 per NPC a day) + tidied answers (`[n]` and `<url>` removed). Four rounds of test questions (f5) fixed by cause (census date boxes, empty JS tables, term synonyms). First local crawl 6,885 pages (all of the 2026 catalogue, about 1,900 of 2027, stopped when the site stopped answering) → uploaded to Fly `/data/knowledge.db` and restarted (63,448 pieces) (10/29–30, `9c594c5`, `62731ee`, `f4dae97`, `530b644`, `094c4c6`, `735b1e9` and others)
- [x] 79·106. NPC voice greetings (voice by gender), an occasional wave (10/29, `b93eb5c`)
- [x] 81·83·84·87·88·89·90·109. All mobile bugs, room menu (Chat, Notes, Mic, Whiteboard, Save chat/notes, 📂 saved copies, Help, 🚪 Leave, and when closed it becomes "Open Room UI" at the top right), first-use NPC popup and AI label, one-line quests on phones, full screen and home-screen app, HUD shows the name only and phones show the total online, popup keys (A/D, W/S, Space, Esc to confirm) (10/29–30, `b93eb5c`, `5fe5eb2`, `60c815d`, `aa1dc34` and others)
- [x] 85. Whiteboard: an Excalidraw link per room, in a **new tab** (collaboration switches off inside an iframe), checked live with two accounts (10/30, `60c815d`)
- [x] 86. Voice (LiveKit, with the EC2 set up by the user with Codex): the server gives a 2-hour token only to someone in that room or outside, listening is automatic, talking = the room menu's Mic or V outside (PC), outside voices fade with distance up to 18 m, Mute, Voices volume and the chat restriction all apply (10/30, `7d000b9`, `f9bca64`). User's live check: "hear it really well"
- [x] 92. BGM on automatic sign-in (10/29, `6d6a8e8`)
- [x] 93·99·101. qa account roles (01–04 staff, 05–08 student, 09–10 guest), staff notes in the Hub, Roles tab on the admin PC (top admin only) (10/29, `ee0e148`)
- [x] 94 (look and spot). Seongsu the ghost (boo.glb, CC BY, twice the size, on a picnic bench, "coming soon") (10/29–30). RAG next week
- [x] 95·96. Jordan (green Accommodation tent), Mei (international students, in the Hub) (10/29, `a76ffcb`)
- [x] 98·100·103·104·107·110. Canvas button, Academic Skills PC and summary page, Hub academic calendar (2026–27), Poop Room (DB for 30 days, 1.5× size), 2 BGM tracks, sky and framed pictures (10/29–30)
- [x] 102. ANUSA clubs board: the public Rubric list (the one ANUSA itself uses) in an app window, clubs / events (10/30, `735b1e9`, scrolling `f9bca64`)
- [x] 111. Career Hub: front door of O'Donoghue, a 30×20 interior (sign on the front of the reception desk, 2 PCs = Career Central and STEM internships in new tabs, coffee bar, bookcases, lounge, study desks), 6 interview rooms by invitation (10/29–30, `9cf41f2`)
- [x] 112. Campus Guide (❓), a first-visit tour, quest arrow (above my head, pointing to the goal), 7 guide clips (animated WebP, 750 KB) (10/29–30, `b718b00`)
- [x] Part of 115: staff badge on name tags, pictures in shared notes, credits and licences screen, 34 camera turning (⟳, top right between ❓ and ✉️, R) (10/29–30)
- [x] Counselling room invitations: a popup for the invitee (Accept → teleported in), good for one visit, re-invite every 10 seconds (10/30, `1adc036`, `ea376e5`)
- [x] Map (user requests): a curve in the creek to the south (water, banks, railings, footpath, road), a two-lane road and footpath across it, an underpass lane with ramps and an open bridge, library 3 m south, the path to Badger curved, one lawn colour, the dog moved to the lawn, northern buildings and O'Donoghue fade (10/30, `935376b`–`9cf41f2`)
- [x] Key guide laid out (Move at bottom left, Q E R V / Shift Space Enter) (10/30, `7533de5`)
- [x] Black "ANU" T-shirts for the NPCs, credit for Seongsu's artist dm-mayu, re-reading saved room copies (chat and notes) (10/30)
- [x] 78 follow-up (user's live feedback: "feels like a search engine", "the answers got dumb"): the model answers even with no source, under a no-facts brief (a hello or "what can you do?" → an introduction and examples, anything else → not found + links) (10/30, `dd6fce1`). The answer language is set from the question's letters (Hangul → Korean, Latin → English) + "what time does it close?" → Opening Hours first (10/30, `dfd6cb5`). Small sources (Sport) sent whole, otherwise 8 pieces, "where?" puts address pieces first, the brief loosened to answer directly instead of "see the page" → gym address, prices, borrowing steps and prerequisites come out specific (checked locally) (10/30, the `0b343d0` batch)
- [x] 73a (partly). Workflow review: **only the RAG search stage finished before the user stopped it** (10/30, cost was climbing). Of the 11 RAG findings, fixed: an out-of-range `&#…;` halted the whole crawl, hyphenated titles cut off, course codes with Korean particles attached (COMP2300은) translated, translations counted in the daily limit, adding a topic to a one-word question only when nothing is found, "open access" ≠ opening hours, the latest year first, a no-match spec that proved nothing → a brief spec (10/30, the `0b343d0` batch). The rest folded into 97
- [x] Admin PC log search: a dropdown for all/members/guests/staff/admin, a small dropdown inside the Who field (name, student number, email), partial matches (YU → YUE), event checkboxes (by group, an "All but connect/disconnect" button, checkboxes rather than radio buttons because several have to be excluded at once) (10/30, the `0b343d0` batch)
- [x] Tutorial quests: asking an NPC moved to Robin in the library (Nova, the cheap model), the arrow points to Robin, it comes after "go into the library" (10/30, the `0b343d0` batch)
- [x] 116. Guide clips updated: recorded with a member account while no QA was running, **16 clips** (moving, E, turning, chat, notes, a real NPC answer, mail, rooms, save → Saved, Hub calendar, library, classrooms, Career Hub, advertising board, customisation, settings) + an "Easy to miss" card (/w, /all, invitations, staff label, calendar, Canvas). No clip for voice, since there is nothing to see. Recording tool `qa-tools/guide-clips.mjs` (10/30, `33cf664`)
- [x] AI "Thinking..." indicator (three blinking dots, user request) (10/30, `1e29b3b`)
- [x] AI quality follow-up: fixed the translation that dropped "prerequisites" from Korean course questions + requisite pieces first, repeated links tidied (10/30, `1e29b3b`, `3310353`). Helper f5's 28-question test: answers that looked made up (Alex's opening hours, the MyHealth app, who Sam serves) were **really in the crawled data**
- [x] RICE v2 written (`ANU-Crossing-RICE-v2.md`, updated for what was built after Codex's version, 16 items scored), then the top 3 + user requests built:
  - 1st **Who's here**: tap the online line to see the names in this space (staff marked), only counts elsewhere, tap a name for `/w name` (10/30, in the `3310353` batch)
  - 2nd **Day and night by Canberra time**: sky photo colour, sun, daylight, fog and exposure through dawn, day, sunset, dusk and night, checkable with `?hour=21`. User: "the night sky is awesome" (10/30)
  - 3rd **Chat status** (👋 Happy to chat / 📚 Studying / 🌙 Away, beside the name, the server takes only those 3 values with a 2-second limit, spec) (10/30, `3310353`)
  - Street lamps (user request): pools of light and glowing bulbs at night (fake light, keeps phones fast), 8 pairs **like a highway on both sides** of the northern east-west road (north = inside the east end of the flower bed, south = the kerb where it meets the lawn, none at road entrances), heads facing the road (10/30, `5ca436b`, `0f8c1eb`)
  - Indoor windows at night (user request): library, Hub and ANUSA windows turn deep navy at night, sunbeams, floor light and dust switch off (10/30, `3b93a50`)

## 11/4 user bug list and requests (push `fa80eb6`, CI and deploy passed, Fly knowledge.db re-uploaded with 7,963 pages)

- [x] One sign-in message: a student number or email gets the same answer for "no account" and "wrong password" (no hint whether someone signed up) (`33e4795`)
- [x] Guests leave less in the DB: position and look not saved, poops in memory only (at most 2,000), deleted a day after the last visit (was 30), names up to guest9999 (`a5fe3ac`). Measured: one guest = one small row, so even ten thousand is about 1 MB. The real limit had been 1,000 names
- [x] Three graphics levels on mobile (Low, Medium, High), phones default to Medium (`8371c85`): part of 105 done early (post-processing and water reflections stayed in 105)
- [x] Mobile screen stays on (Screen Wake Lock, touch devices only) (`229a32a`)
- [x] Bugs 1, 4, 5: a big Close button in the room UI, phones enter with it closed, counselling room header fixed (helper d1 + main fixes) (`8371c85`)
- [x] Bug 2: outdoor voice fades with distance (iPhone ignores audio volume → Web Audio gain, 14 m, squared falloff) (`a11c60d`): needs a live check
- [x] Bug 3: the AI chat window wouldn't scroll and the input hid under the keyboard (cause: flex min-height) (`8371c85`)
- [x] Bug 6: phone settings window scrolls, Close at the top (`8371c85`)
- [x] Bug 7: talking to Seongsu tells you where the Poop Room is (`d593091`)
- [x] Bug 8: a PC in the accommodation tent (Compare residences, new tab) (`7444345`)
- [x] Bugs 9 and 17: Alex crawls 42 STEM internship pages on systems.anu.edu.au (Career Central is a sign-in app, so it can't be read), Jordan searches price tables with a "coursework" hint, Robin gets the whole "all libraries" list page (`d593091`, `1f7297f`, `fa80eb6`)
- [x] Bug 10: the talking indicator moved below the name and online line (no longer over the music player) (`229a32a`)
- [x] Bug 11: the northern white building turns see-through only when the camera faces north (`229a32a`)
- [x] Bug 12: a flower border around the lawn (`7444345`)
- [x] Bugs 13 and 13-1: brighter nights, the 4 nearest street lamps are real lights (Medium, High), multicoloured pools (additive blending on mobile) → normal blending, wider (`229a32a`)
- [x] Bug 14: indoor windows back to normal at night, only the sunbeams switch off (`229a32a`)
- [x] Bug 15: building windows and shops light up at night (`229a32a`)
- [x] Bug 16: a test server with the clock reversed = local :8090 (`CLOCK_SHIFT_HOURS=12`, reachable from a phone on the same Wi-Fi) (`229a32a`)
- [x] "For markers" guidance at the top of the README (user's Ed question, checked at the top of the live /readme/) (`349e7fb`): revise when Ed answers

## 11/4 evening to night (push `2087eb3` → … → `3f7eba1`, all CI and deploys passed, Fly knowledge.db 8,747 pages)

- [x] The sign-up window sits above every window (sticky notes and others), a first-visit guide card for guests (what they can't do, IP kept 7 days) (`d4ba08d`)
- [x] AI assistants remember the conversation while the window is open (forgotten when closed or after 10 quiet minutes), follow-up questions are searched together with the previous one (`54d6019`, `9c3a9d4`)
- [x] Guide clips: voice in a room and voice outside (PC only) as separate clips, camera turning explained (`ad3fede`)
- [x] One line at the bottom of the plan file noting that stageshow was used for the UI work (11/4)
- [x] UI (b) checked against stageshow's rules (PC 960×540 and phone 390×844 captures): the ✕ on 10 windows → one "Close" pill button, phone HUD names cut off ("Qa1…") → name, online count and status stacked, the PC online line lists only occupied places, phone sign-up tips use the on-screen button names (`a24ccbc`)
- [x] The upper block of Marie Reay (155) stuck out 0.5 m west and north of the lower block → moved in (`2e1b115`)
- [x] 105 High effects: post-processing (bloom, blur, colour grading) only lagged on a MacBook with no visible gain, so it was **taken out** (user, 11/4). Kept = ripples and sky reflection on the creek, stronger sky reflection on glass, a CSS vignette (free), High also capped at 1.5× on retina (`35f1129`, `2087eb3`)
- [x] Notices such as the microphone permission hidden under the music player → one line under the name, minimap below it (`9be588a`)
- [x] PC settings window scrolls too (the bottom was cut off) (`9be588a`)
- [x] Street-lamp pools flickered at lawn height → raised slightly + depth priority (`2087eb3`)
- [x] 117 the rest of the catalogue crawled (784 more pages, 0 failures) → uploaded to Fly and restarted (11/4)
- [x] **UI round 2 (user suggestion)**: one font and spacing across windows (`dff0cf8`), board windows tidied, emoji icons → one SVG set (`7be584a`)
- [x] **More hidden UI found (user, 11/4)**: on phones, in-room notices, the talking badge and the quest bar, the same person twice in Who's here (`24f6ba1`), overlapping minimap labels on PC (`a8d6df9`)
- [x] iPhone street-lamp blotches, first pass: highp shaders, no point lights on phones, normal blending for halos (`63e166e`): **still there (below)**
- [x] Bottom of the plan file: "a campus that changes with the time / how stageshow was used" (11/4 night)
- [x] **UI colour: yellow window backgrounds → white** (the colour of the round buttons at the top right), brown accents kept, only sticky notes stay yellow (`3c3ac6e`)
- [x] **Multicoloured blotches under iPhone street lamps**: cause = Safari adds colour noise (dithering) to canvas gradients, stretched over 10 m → a texture computed per pixel (`0cbc1ed`): **needs a check on a real iPhone**
- [x] **Characters dark under street lamps at night** → characters warm up and brighten as much as the nearest lamp, phones too (`736ffe8`)
- [x] **Chifley Library lit at night** (`54ebb04`)
- [x] **Random lit windows on the northern residences** (16 windows × 8 floors, about seven in ten lit, slightly different brightness) (`54ebb04`)
- [x] **Lab Coffee seen from behind**: a second sign on the far outer edge of the upper floor, a menu on the back of the menu board (`e15ff38`)
- [x] **A soft filter on High** (a light CSS layer, no frame cost) (`3c3ac6e`)
- [x] **Ground-floor shops of 155 (the far side)**: from the left, an empty shop, Yori, Sushi Smith, Rex Espresso, benches → café tables (seat numbers unchanged) (`abba5b1`)
- [x] 155's shops rebuilt to sit inside the ground floor (no more cardboard look, glass behind removed) (`e1fb753`). Ivory UI (`a8c80d3`). Music title "Along the Lake Griffin" (`eb70ce6`)
- [x] Wooden pillars removed from the ground floor of 155's shop side only (`1912b1a`). The empty shop lit too (`bc35d07`). Full screen in settings on PC too (`d6190f9`)
- [x] A 30 fps demo GIF + WebM at the top of the README (`3f7eba1`, docs/demo/, recorder qa-tools/demo.mjs, virtual time)
- [x] 105. Low, Medium, High graphics finished (post-processing left out for lag, see "105 High effects" above) (11/4)
- [x] User check (11/4 night): "checked everything": lamp blotches, characters at night, library, residences, Lab Coffee, 155 shops. The question about shadows (visible even at midnight) closed by the user: "never mind the shadows"
- [x] From 118, the README demo clip (`3f7eba1`). Accessibility and the pomodoro timer not yet → 119 under "Next week" below
- What remains of this section moved to **"Next week (Sat 11/7 – Mon 11/9)"** below: Credits screen (120), demo clip check, High on real devices, 11/4 live checks, flaky spec, reply to a8

## Crits · documents · operations

- [x] Crit 8, 9 and 10 tags (`crit-8`, `crit-9`, `crit-10` = `c043c45`), reflections for crits 8–10, decision record 001 (10/12, `0b98a60`) and 002, `docs/roles.md` (10/11, `238efdf`), `docs/self-hosting.md`, LICENSE (10/17, `1630496`)
- [x] Pages served no-cache so a deploy shows at once (10/17, `43f7136`)
- [x] Bundle 1 (10/24, push `4e7c46e..8ec1bbe`), most of bundle 2 (10/24–25, up to push `0b671bb`): the order table is in the local backup, "order until the final"
- [x] 113. 10/29 reflection material added at the bottom of the plan file (10/29)

- [ ] research-note.md: **required for COMP8020** (confirmed by the user on 11/9: enrolled in COMP8020). 600–800 words, repo root, a quarter of the final. I write it in Korean, the documents helper translates → the main session commits and pushes (before 12:00)

---

# To do

> Every one of the user's 10/29 requests is included. `[request n]` = number n in the 10/29 list.
> **Scope (user, 10/29): only 105 graphics moves to next week, everything else this week (10/29–11/4).** Budget refills 11/5 09:00.
> Build order is "This week's order" below. Feature introductions and clips (112) once the real UI is stable.

## State on the evening of 10/30 (main, stopped at about $191 of $200)

- This week's scope (everything except 105 graphics) is **built, pushed and deployed**. On the user's "let's spend the whole $200", guide clips, the RICE v2 top 3 and night effects were done too. Last push `3b93a50`, spec 122 pass / 6 skipped
- Roles (10/30): main = build and commit, Sonnet `comp4020-8a` = local browser QA, Haiku `comp4020-f5` = NPC test questions. Both report to main (results of the last round to be checked next session)
- Crawling: the 2027 catalogue is on Fly with about 1,800 pages missing. programsandcourses keeps not answering this computer (not worked around). A local waiting script checks robots.txt every 10 minutes → runs `node server/crawl.ts catalogue` when it answers. Then re-upload `knowledge.db` (gzip → `flyctl ssh sftp put` → unpack, delete WAL → restart). The Fly server also re-crawls by itself a month later
- Asking an NPC directly from inside the Fly machine was blocked by the permission check → moved to "Last week's live QA" below
- Local servers: QA on localhost:8080, spec on :8086 (started by the main session, gone when the session ends)

## Last week's live QA (one batch request to the user, qa_ accounts)

- [ ] NPC: ask Kai "who r u" / "안녕 뭐해?" (Korean: "hi, what are you up to?") / "who won the 2022 World Cup?" / "where is the gym" → correct in English and Korean, an introduction for small talk, "couldn't find" with no facts for the unknown, gym = Building 19 North Road
- [ ] NPC: Robin "what time does the library close?", Priya "COMP2100 prerequisites", Jordan "how much is Fenner Hall a week?"
- [ ] Admin PC log: role dropdown, Who field by student number, email and partial match, event checkboxes ("All but connect/disconnect")
- [ ] Tutorial: quest order in a fresh browser (library → ask Robin), the arrow points to the library door outside and to Robin inside (helper 8a passed locally)
- [ ] The admin PC search needs the top admin account, so the helper can't do it → the user, live
- [ ] Night: visit in a real evening (or with `?hour=22`) to check the sky, lamp light and indoor windows, and that frame rates are fine on a phone
- [ ] Who's here and the status button: visible to each other with two accounts

## User decisions on the night of 10/29 (before bed)

- Push straight away (don't ask). **No live QA during the week: collect it and send the user one batch in the last week** (with the local server address). Local QA in parallel by helpers: Sonnet `comp4020-8a`, Haiku `comp4020-f5`
- Stop at about $190 of budget and update this file. The main session proposes the dynamic workflow (73a) when the budget allows
- 115: **only the staff badge on name tags**. Staff-only first entry to counselling rooms and reporting by tapping a name tag **dropped for good**. **Guestbook dropped for good**, pictures in shared notes (S3) done. No shadow toggle, folded into the 105 graphics levels. **Licence and credits screen done**. 76 creek S-curve not done. **34 camera turning done (one button)**. 20 spaces still on hold
- 86 voice: **only the EC2 guide for Codex, build after the EC2 is ready**
- 78 first crawl: **overnight, locally** → result to Fly `/data`, then Fly once a month
- 102: analysing the Rubric API was refused by the permission check (not worked around) → solved with the public Rubric URL the user gave, in an app window (10/30, "Done" above)
- 94 Seongsu's look: `boo.glb` (a ghost, from Fab, **CC BY 4.0**, https://www.fab.com/listings/a1830c99-ca66-48e0-aea3-b3d0fa6ebf12), artist **dm-mayu** (confirmed by the user 10/30, credited)

## This week's order (Thu 10/29 – Wed 11/4)

| Order | Items | Why this order |
| --- | --- | --- |
| 1 | 81 mobile bugs · 83 team room UI · 84 NPC confirmation popup · 89·90 HUD tidy · 109 popup keyboard · 88 full screen | The real UI has to be settled before the guide (112) can be made |
| 2 | 92 BGM bug · 93 QA accounts · 99 staff Hub notes · 101 admin assigns roles | Small and independent, QA accounts are needed for later QA |
| 3 | 78 assistant RAG, crawler, models · 79 voice greetings · 106 waving | User's verdict "the answers are poor", the biggest piece |
| 4 | 95 residences · 96 international students · 100 Academic Skills · 94 Seongsu (spot only) | Built on 78's RAG |
| 5 | 102 ANUSA clubs · 103 Hub calendar · 98 Canvas · 104 Poop Room · 107 BGM · 110 sky and posters | Content, independent of each other |
| 6 | 111 Career Hub (Alex moves) | A new space, after 78 |
| 7 | 85 whiteboard · 86 voice (team room P2P + EC2 guide for Codex + V outside) | On top of 83's team room menu |
| 8 | 112 feature intro · Campus Guide · quest arrow · clips | Last (based on the final UI) |
| As needed | 73a review → 10/30 only RAG finished and stopped, the rest into 97 | |

> All of 1–8 above is done (10/30). The table stays as a record.

## Not done last week because the credit ran short

- [~] 73a. Workflow review: on 10/30 only the RAG part was finished and fixed ("Done" above), the security, real-time, rules, client and map searches were stopped → **merged with 97 for next week. Search stages = Sonnet, only verification on Opus (user, 10/30)**

## New requests, 10/29

### UI · mobile · team rooms [request 1]

### Voice · whiteboard [request 1]

  - Secrets live only in a local config folder outside the repo and in Fly secrets

### Accounts · permissions

### Bugs

### AI assistants · new NPCs [requests 6, 10, 11, 17]

### Spaces · content

### Guidance · finishing

- [~] 118. (partly ✅ 11/4 `3f7eba1` README demo clip, the rest → 119) (10/30, RICE v2 🟡) If time allows: place shortcut links, a pomodoro timer in meeting rooms, text size and reduced camera motion (accessibility), a panel of activities to join now. The rest of RICE v2's 4th–7th (board search, emote particles, draft autosave, birds, water sounds) are candidates too
- [x] 117. (10/30) Crawl the rest of the 2027 catalogue: finished and uploaded on 11/4. Original note: → re-upload `knowledge.db` (starts by itself when the site answers, see "State" above)
- [ ] 108. (→ "Next week ②" below) **Final polish** [request 19]: list where I think it falls short → helper QA walks every space once (PC and phone) → work that raises the finish
- [ ] 97. (→ "Next week ②" below) **Final security and feature check** [request 7] (main's check on 11/4: the school information a guest can see is public pages only. One small problem = `/api/join` answered "Wrong password" when a student number had an account and "No account" when it didn't, so **you could tell whether that student number had signed up** → consider one message for both) (= 73c extended + what remains of 73a, starting 11/6. The workflow searches on Sonnet and verifies on Opus. The spec `rooms.test.ts` "shares one set of notes" failed once in a full run and passed on rerun = flaky, look at it too. Helper 8a: Robin's E spot doesn't line up with the desk label and is hard to find): server permission checks, input limits, secret exposure, S3 signing, rate limits, XSS, README claims ↔ spec ↔ CLAUDE.md ↔ real behaviour, desktop and phone screenshots of every space, gaps against the rubric

## Next week (Sat 11/7 – Mon 11/9 12:00): the order the user set (11/4 night)

> Budget about **$300**. From Fri 11/6 the rules allow only bugs, small things and documents. **Order: ① documents → ② workflow and QA → ③ RICE once more (v3).** Keep the deploy up until 11/9 12:00.

### ① Documents first

- [ ] 120. **Settings → Credits screen**: the user's GitHub link, a README summary, the ANU course (COMP4020 Agentic Coding Studio), what the user did (planning, QA, AWS and so on). Main checks the facts, **the user's own sentences come in through a template**
- [ ] Documents (the user writes them, main gives blank templates and checks facts): README 400–600 words (about 2,200 now), PROCESS from scratch (the plan file → checklist → bundles story is required), CLAUDE.md (rules only), spec list = README, `crit-8.md` under 300 words (352 now), decision records 003 onwards (roles, assistant RAG, voice). Details under "# Final Project" in the plan file
- [ ] README "For markers": revise when Ed answers (`349e7fb`, never any qa_ names or passwords)
- [ ] User check of the README demo clip (`3f7eba1`: the scene, 10.5 s, GIF 8.9 MB, or 7.2 MB at 640 px). To re-record = `qa-tools/demo.mjs` + `qa-tools/demo-scene-meet.mjs` (local :8090), about 2 minutes
- [ ] 82. 🗺️ System architecture diagram (final version): browser ↔ WebSocket/HTTPS ↔ Fly (Hono, SQLite `/data`) ↔ AWS (S3, SES, Bedrock Nova and Haiku, EC2 LiveKit) + the assistant RAG flow + GitHub Actions. In `diagrams/`, for PROCESS and the stack docs. Check there are no IPs, account numbers or keys. The text is the user's
- [ ] 94. Connect Seongsu's NPC to RAG (once the user points to the documents)
- [ ] 91. **Translate this checklist and the plan file into English → submit them too** [request 3]. **Last of all**. English versions = the ANU repo + my personal repo, the Korean originals = personal repo only. Filter out secrets, IPs, accounts and photo-folder references

### ② Workflow and QA first

- [ ] 97. **Final security and feature check workflow** (= what remains of 73a + 73c, see 97 above): search on Sonnet, verify on Opus. Server permission checks, input limits, secret exposure, S3 signing, rate limits, XSS, README claims ↔ spec ↔ CLAUDE.md ↔ real behaviour, gaps against the rubric. Fix the results
  - Already known: in full spec runs, rooms.test "shares one set of notes" and the 5-second WebSocket timeout fail now and then (when the helper's Chrome is busy, pass on rerun). Robin's E spot doesn't line up with the desk label (helper 8a)
- [ ] 108. Final polish (see 108 above): helper QA walks every space once on PC and phone → fix
- [ ] Real browser QA (helper d1, qa_ accounts, main never does it itself): the "Last week's live QA" list above + the 11/4 items (outdoor voice falloff (iPhone), flickering lamp pools, notice positions, 155 shops, pillars and lights, Full screen in settings (PC), Priya on 2027 courses, ivory UI)
- [ ] High on real devices (MacBook and phone), whether the iPhone lamp blotches are gone: the user
- [ ] a8's report (memory, Kai's follow-up questions) is applied in `9c3a9d4`: only the reply is left

### ③ RICE once more (v3)

- [ ] 121. **RICE v3**: take out what was built after `ANU-Crossing-RICE-v2.md` (the 11/4 UI, night, 155, demo and so on), score again against the app as it is now → choose with the user, then build from the top within the post-11/6 rules (small things only)
- [ ] 119. What remains of 118 (rescored in v3): text size and reduced camera motion (accessibility), a pomodoro timer in meeting rooms, place shortcut links, a panel of activities to join now, board search, emote particles, draft autosave, birds, water sounds

### Finishing

- [ ] 114. Decide on documents and the backup plan before submitting (an AWS instance or Render) [request 20] → together with 77
- [ ] `pnpm check` + `pnpm check:evidence`, live check on desktop and phone, keep the deploy up until 11/9 12:00

## Planned earlier but not done, or unclear (including candidates to drop)

- [ ] 115. Tidy-up bundle (ask the user before starting each one)
  - 24 **teamwork workspace design**: mostly absorbed by 83 and 85, what remains: linking classmates' apps (with their permission)
  - What remains of 13: UI language (shadow toggle folded into 105, credits screen finished 10/30)
  - What remains of 15: performance on real phones
  - What remains of 37: a file archive (500 MB per person) (pictures in shared notes finished 10/30)
  - 56d: now that email verification exists, ask again whether to store course and career conversations (not stored now)
  - 28: check Sketch & Guess live to the end (correct guess, score, game over)
  - Cafés: opening hours, a Lab Coffee interior, location on the map (optional)
  - 29: whether to add a one-line donation link to the README
  - Clean up the empty live account `qabot04` (there is no delete feature)
- [-] 76. Creek S-curve: not done (user, 10/29). A gentle curve south of the bridge instead (10/30, "This week's build" above)
- [x] 34. Camera turns 90° (one ⟳ button + R, outside only) (10/29–30)
- [ ] 20. Club, residence and college spaces (originally "on hold"): partly covered by 102 and 95, the spaces themselves are candidates to drop
- [ ] The user's part: temporary IAM permissions for 86c (EC2 and Route 53, for Codex)

## After submission (after 11/9 12:00)

- [ ] 77. Where to keep the app running: Render free / Fly free (personal account) / cheapest AWS (EC2 t4g.nano–small or Lightsail). Compare: monthly cost, SQLite kept, WebSocket, sleeping, HTTPS, moving S3, SES and secrets, CI. Before that, back up `/data/app.db` and move the code to my personal repo. Guide: `docs/self-hosting.md`

---

# Reference (decisions that still hold)

- **Roles** (38, updated 10/29): guest / student / staff / admin. Guests can only walk, chat, emote and use team rooms (no posts, comments, hearts, files or sticky notes). Staff = Notices, classrooms, board links, reading private enquiries (+ 99 Hub notes). Admin (top admin `qa_master`) = admin PC, log, restrictions, removing others' posts, assigning roles (101)
- **iframes**: blocked (new tab): `anulib.anu.edu.au`, `services.anu.edu.au`, `researchportalplus`, `buymeacoffee.com`, `anu-sport.com.au`, the ANU calendar, Canvas. Allowed: `anu.libcal.com`, `comp.anu.edu.au`, our own server
- **AWS**: region `ap-southeast-2`, the server's IAM user `campus-fly-server` (S3 Put/Get/Delete, `ses:SendEmail`, `bedrock:InvokeModel`), its keys only in a local file outside the repo (mode 600) and in Fly secrets. The Budget **only alerts** (no automatic stop on the free tier, corrected 10/29)
- **QA**: the main session never does browser QA → the helper (Sonnet). Live testing only with `qa_` accounts, the spec never runs against fly.dev. Local DBs get the qa accounts from a seed script. A dead headless Chrome overwrites visitors' positions, so visitors are kept separate (no pkill)
- **Budget**: refills every Thursday 09:00 (about $300 a week from 11/5, user 11/4). The user's point: "if it's done carelessly I end up fixing more, and that costs more budget" → take care of the area around each change too
- **Push**: in bundles, ask before a new session's first push, only after `pnpm check` passes, then `gh run watch` + a live check after the push
