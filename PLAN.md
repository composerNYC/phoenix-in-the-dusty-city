# Phoenix in the Dusty City: the big overhaul

This plan is for a long autonomous session. Work through the phases in order. Each phase ends with a working game, a screenshot check, and a git commit. If a phase runs into a wall, write down what happened in `PROGRESS.md`, take the fallback listed, and keep going. Do not stop to ask questions mid-run. The decisions below are already made.

## What the owner asked for

1. **Graphics and animation pushed as far as a browser can go.** Right now it looks like a sketch.
2. **A drop like a battle-royale game, but single player.** The game opens on a plane flying over the city. You jump, skydive, open a parachute or glider, and land anywhere you like.
3. **Lots of artsy guns with unlimited ammo.**
4. **No more hydration.** Remove the water meter completely.
5. **The Dusty City Rangers are hunting Phoenix.** Phoenix has to hide and get away from them.

## Decisions already made

- **Look: premium stylized, not photoreal.** Bright, saturated, chunky shapes, soft lighting, strong silhouettes, cel-ish shading with good materials. It's the genre look the owner pointed to, but the art must be our own: no names, characters, logos, sounds or UI copied from Fortnite or any other game. Stylized also runs better in a browser than photoreal.
- **Stay a no-build browser game.** Plain ES modules, three.js from the CDN (`three@0.170.0`, keep this version unless an upgrade is needed and tested), hosted on GitHub Pages. No bundler, no npm in the shipped game. Dev tools such as puppeteer go outside the shipped files.
- **Guns are non-lethal and artsy.** They hit rangers with paint, glitter, bubbles and so on, and a hit ranger is stunned, slowed or confused for a while, then gets back up. Nobody dies. That fits the festival theme and keeps the game fun.
- **Unlimited ammo**, but every gun has a fire rate, a short overheat or reload rhythm and recoil, so the guns feel different and good.
- **Performance target:** 60 fps on a mid-range laptop at the High preset. Low must run on an older laptop or a phone. Keep the existing High, Medium and Low graphics setting and extend it.
- **Keep what already works:** the city layout, quests, art cars, the masters installations, the Dalí Dream, bikes, flight (V), radio, flame cannons, crowds, saving.

## Ground rules for the session

- Work on a branch named `overhaul`. Commit after every phase with a clear message. Push to GitHub and merge into `main` only at the very end (Phase 10), after the final check passes.
- `game.js` is 2,563 dense lines. Before adding big systems, split it into modules (Phase 0). New systems each get their own file.
- **Check your work by looking at it.** After each phase, run the game on a local server and take screenshots of fixed scenes (see "Screenshot checks"). Look at every screenshot. Fix anything that looks broken, black, washed out or missing before committing.
- Keep a running log in `PROGRESS.md`: phase, what was done, what was skipped and why, known bugs.
- Every downloaded asset must be CC0 or CC-BY. Record each one in `CREDITS.md` with source URL, author and license. If an asset's license isn't clear, don't use it.
- Never use assets that need a login to download (this rules out Mixamo). Good sources with direct downloads:
  - **Poly Haven** (polyhaven.com, CC0): HDRI skies, ground and material textures. It has a public API at api.polyhaven.com.
  - **Quaternius** (quaternius.com, CC0) and **Poly Pizza** (poly.pizza, which hosts many Quaternius and Kenney models as direct `.glb` downloads; check each model's license): animated stylized characters, weapons, props.
  - **Kenney** (kenney.nl, CC0): Blaster Kit (guns), particle packs, UI sounds, more car kits.
  - **KayKit** (CC0): already in use. The newer character packs have more animations.
- If a download fails, fall back to building the thing in code, the way the art cars already are. Never block on an asset.
- Keep the asset folder lean: compress textures (resize to 1K or 2K, use `.jpg` or `.webp`), and keep the total download under about 60 MB. Load big things lazily after the game starts.

## Screenshot checks

Set this up in Phase 0 and reuse it every phase.

- Previous sessions already tested this way: serve the folder with `python3 -m http.server`, then drive Chrome with `puppeteer-core` using the SwiftShader flags (software WebGL). `window.__game` exposes `startGame`, `state` and `cam()`. When setting a test time of day, push `state.nextStorm` past it, or a dust storm greys out the shot. Reuse this. Keep any dev tooling in `tools/` (in `.gitignore`) or the scratchpad, never in the shipped files.
- Add a debug URL hook such as `index.html?shot=dropzone&time=17.5` that skips the start screen, puts the camera at a named spot and time of day, waits for assets, and sets `window.__ready = true`.
- Scenes to capture each phase: plane interior or plane view, freefall, parachute over the city, landing, Center Camp at golden hour, an art car at night, the Man burning, a dust storm, a gun firing, a ranger chase, Phoenix hiding, the HUD.
- Save them to `tools/shots/<phase>/` and look at them before committing. Also log the frame time (fps) for each scene, and treat a big drop as a bug.

---

## Phase 0: Groundwork

- Create the `overhaul` branch.
- Split `game.js` into modules without changing behavior: for example `core/` (renderer, loop, input, state, save), `world/` (city, ground, structures, sky), `actors/` (player, NPCs, crowd, vehicles), `systems/` (quests, jobs, audio, UI). Keep `artcars.js`, `artcars2.js`, `dali.js`, `masters.js` as they are.
- Set up the screenshot checks above. Take "before" screenshots of every scene so the owner can compare later.
- Add an fps and draw-call counter, hidden behind a `?debug` flag.
- Commit: "Split game into modules, add screenshot checks".

## Phase 1: Remove hydration

Hydration code is spread around. Remove all of it:
- `state.hydration` and `state.lastWater` in the state object (`game.js` around line 814), the save and load (around 913 and 918), and old saves must still load.
- The drain over time (around line 2265), the dust devil drain (around 1341), the bike crash penalty (around 1517), the job reward (around 1199), the respawn value (around 2291), the quest reward line (around 867, "a full water bottle").
- The water pickups (`add('water')` around line 667) and any "drink" prompts.
- The Hydration meter in `index.html` (around line 179) and the low-water warnings and vignette (around 2438).
- Search for `hydrat` and `water` afterwards, and leave only things that aren't about drinking.
- Commit.

## Phase 2: Graphics foundation (the biggest visual jump)

This phase changes the whole feel. Do it before new content, so everything new is built to the new look.

- **Renderer:** ACES or AgX tone mapping, tuned exposure, proper sRGB everywhere, device-pixel-ratio cap per preset.
- **Sky:** a real sky dome with sun, scattering and a gradient that changes through the day. Golden hour and blue hour must look stunning. Use a Poly Haven HDRI, or a sky shader, for reflections and ambient light, and blend between day, sunset and night.
- **Sun and shadows:** cascaded or tightly fitted soft shadows that follow the player, contact shadows under characters and vehicles.
- **Post-processing stack**, scaled by preset: ambient occlusion (SSAO or GTAO), bloom (already there, retune), depth of field for photo mode and cinematics, a color grade with a desert LUT look, a light vignette, film grain, and screen-space god rays from the sun through dust. Keep the existing NaN guard pass.
- **The playa ground:** a high-quality cracked-mud material with normal and roughness maps, detail texture up close, tire tracks and footprints that fade, a subtle heat-shimmer distortion near the ground at midday.
- **Atmosphere:** height fog and distance haze tinted by the sun, drifting dust particles in the air at all times, much better dust storms (wall of dust rolling in, whiteout, wind-blown streaks, sound muffling).
- **Night:** this is where the city should look best. Thousands of LED points with bloom, glowing art cars, fire with heat haze and embers, lasers, searchlights, a starry sky with the Milky Way.
- **Materials pass:** give the existing structures real materials (fabric, wood, metal, chrome, plastic) with stylized roughness and rim light, instead of flat colors.
- **Water-free, but wet-looking:** reflective chrome and mirror art should reflect the new environment.
- Commit.

## Phase 3: Characters and animation

- **Phoenix:** replace the blocky KayKit model with a better stylized animated character (Quaternius or a similar CC0 pack with a full animation set). Give Phoenix a signature look: fiery red and gold outfit, goggles, the wings already in the game. Keep the outfit system working.
- **Animation set:** idle, walk, jog, sprint, crouch, crouch-walk, jump start, in air, land (soft and hard), roll, freefall, parachute, glide, swim-dance, several dances, aim and shoot (pistol and rifle poses), reload, hit reaction, hide.
- **Animation quality:** smooth blending between states (a small state machine with crossfades), foot planting so feet don't slide, the upper body aiming while the legs run (split body layers), head and eyes looking at the camera target, procedural lean into turns and bank when running fast.
- **Burners and crowds:** upgrade the NPC and crowd models to match the new style, with more costume variety (fur coats, LED suits, tutus, masks, goggles, wings). Keep the instanced crowd for performance, but give it better animation (several dance loops, walking, cheering).
- **Camera:** a third-person over-the-shoulder camera that shifts in to aim, a smooth follow with spring damping, sprint field-of-view kick, landing dip, camera shake for explosions and big hits, and collision so the camera never goes through tents.
- **Vehicles:** add suspension bounce, body roll and pitch, wheel spin, dust trails behind wheels. Upgrade the Kenney cars where possible.
- Commit.

## Phase 4: The drop

The plane and skydiving already exist (`boardPlane`, `updatePlaneRide`, `jumpOut`, `updateSkydive`, `openChute`, `landSkydive` in `game.js` around lines 1878–1950). Build the new opening on top of them.

- **New game starts in the air.** A colorful art plane (our own design, something like a flying art car with wings and lights) flies a random straight line over the city. The map shows the flight path. A countdown shows when the plane leaves the city.
- **Press Space to jump** whenever you want. Show the plane interior or tail view before jumping, with wind noise and other burners jumping too.
- **Freefall:** steer with the mouse and W/S to dive faster or slow down, with speed lines, wind roar, clothes flapping and clouds rushing past. Show the altitude and the land spot under you.
- **Deploy:** the canopy opens automatically at a safe height, or earlier with Space. Choose between a parachute and an art glider (a glider shaped like a phoenix, a butterfly, a hot-air-balloon style canopy). Gliders unlock as you play.
- **Landing:** a dust puff, landing animation and camera dip, then straight into play.
- **Redeploy:** jump towers or launch pads around the city, and calling the plane from the phone, so the player can drop again any time.
- First drop of a new game also shows a short title card ("Phoenix in the Dusty City") during the descent.
- Update the first quest so it starts from wherever Phoenix lands instead of the old start point.
- Commit.

## Phase 5: Artsy guns

- **New module** `weapons.js`: a weapon definition table (name, art style, fire rate, spread, projectile type, effect on hit, recoil, sound, overheat), the firing system, projectiles and hit effects.
- **Controls:** left mouse fire, right mouse aim (over-the-shoulder zoom), 1 to 6 or mouse wheel to switch, hold Q for a weapon wheel. Note that Q is currently the art car radio: keep radio on Q only while driving an art car, and use a different key for anything that clashes. Update the controls list in `index.html` and the README.
- **Touch:** a fire button, an aim toggle and a weapon-switch button.
- **Feel:** crosshair that spreads while moving, hit markers, muzzle flash, recoil kick, camera shake, shell or confetti ejection, splat decals on surfaces that fade over time.
- **Unlimited ammo.** No ammo counter. Each gun has an overheat or rhythm meter instead.
- **The guns** (each one a model built in code or from the Kenney Blaster Kit, repainted in the style of its artist):
  1. **Splatter Blaster** (Pollock): fast paint blobs that leave drip splats everywhere.
  2. **Starry Night Rifle** (Van Gogh): swirling blue and yellow star bolts, zoom scope.
  3. **Dot Repeater** (Kusama): rapid polka-dot shots that cover a ranger in dots and confuse them.
  4. **POW! Launcher** (pop art): comic-book shells that burst into a big "POW!" with a knockback blast.
  5. **Melting Clock Cannon** (Dalí): a slow orb that makes a bubble of slow time.
  6. **Glitter Shotgun**: a cone of glitter that blinds rangers for a few seconds.
  7. **Bubble Gun** (Magritte): traps a ranger in a floating bubble.
  8. **Neon Laser** (Haring and Kandinsky): a continuous beam that dances in color.
  9. **Firework Launcher**: homing rockets that burst like the burn-night fireworks.
  10. **Confetti Minigun**: spins up, sprays confetti, very loud, very fun.
- **Getting guns:** some are found in the world as glowing pickups at art pieces, some are gifts from camps (a reason to keep exploring), some unlock through quests. Phoenix starts with the Splatter Blaster after landing.
- **Reactions:** burners cheer or duck when splashed, art cars and props wobble, nothing breaks permanently.
- Add stats to the phone: shots fired, rangers stunned, favorite gun.
- Commit.

## Phase 6: The Rangers' manhunt

The game already has "Ranger attention" badges, `state.heat`, a ranger truck and a ranger driver. Replace that light system with a proper hunt.

- **Story reason:** the Rangers have heard a fiery bird-person has been seen flying over the city, and they want to "bring Phoenix in for a chat". It stays playful, never dark.
- **Wanted level:** 0 to 5 stars, shown in the HUD. It goes up when Phoenix flies in view, shoots at rangers, speeds, or is spotted by a ranger while wanted. It goes down when Phoenix stays hidden and out of sight long enough.
- **Ranger AI**, one small state machine per ranger: patrol, notice (a "?" over their head while a meter fills), search (go to last known position, look around, check hiding spots), chase (run, call for backup), stunned (from the guns), give up (return to patrol).
- **Seeing:** rangers have a view cone and need line of sight. Night, dust storms, crowds and tents block or shorten their vision. Show the "?" and "!" icons above them, and their facing on the minimap.
- **Escalation by star level:** more rangers on foot; ranger trucks driving the streets; ranger bikes; at night, searchlight towers and drones sweeping the city; at 5 stars, a ranger helicopter or blimp with a spotlight.
- **Hiding:** this is the heart of it.
  - Hide spots: porta-potties (step inside, door closes), tents, domes, shade structures, art car decks, inside big art pieces.
  - Blend into crowds: walk or dance (G) in a big dancing crowd and the "seen" meter fills much slower.
  - Change outfit at your camp or a costume rack: knocks off a star.
  - Dust storms: the best cover; rangers lose track of you.
  - Breaking line of sight shows a "last seen here" ghost on the map, the way it does in crime games, and rangers search that spot.
- **Getting caught:** a ranger who reaches Phoenix triggers a short, funny "ranger chat" scene and Phoenix is let go at the Ranger outpost with wanted level reset and a small karma loss. No game over.
- **Sound:** ranger radio chatter, a tense music layer that rises with wanted level, a "they lost you" sting when you escape.
- Make sure existing quests still work while wanted (for example, can't talk to quest givers at 3 stars or more, with a clear message).
- Commit.

## Phase 7: World detail

- Denser, richer camps: more varied structures, banners, rugs, couches, string lights, signs with funny camp names, bikes piled up, props.
- Better art cars: tune the 16 existing artist art cars with the new materials and lighting, add moving parts, more fire and lights at night.
- The Man and the Temple: bigger, more detailed, with a much better burn (flame volume, embers, smoke column, the structure collapsing, crowd reaction).
- More ambient life: people on bikes, people waving, dust devils, birds or bats at night, distant music from each sound camp.
- Weather: a forecast on the phone, sunrise, sunset, the occasional rain shower turning the playa dark and muddy.
- Commit.

## Phase 8: Audio

- Positional sound for every gun, ranger radios, footsteps that change on hard playa vs. dust, wind that rises with height and speed, bike chain and art car engines, crowd murmur.
- Music: keep the art car radio, add a dynamic game score that shifts between explore, chase and hide, and a big theme for the drop.
- Compression and limiting on the master bus so nothing clips.
- Commit.

## Phase 9: HUD, menus and polish

- Redesign the HUD to match the new style: wanted stars, crosshair, weapon and heat meter, altitude during the drop, minimap with ranger cones, objective, toasts.
- New start screen with the game title over a live flyover of the city.
- Settings: graphics preset (and separate toggles for shadows, AO, bloom, render scale), field of view, mouse sensitivity, aim sensitivity, invert, subtitles, volume sliders for music, effects and voices.
- A short tutorial during the first drop and the first few minutes (jump, steer, land, shoot, hide).
- Photo mode: add depth of field, filters and hide-HUD.
- Loading: a progress bar, and lazy-load heavy assets after the player lands.
- Commit.

## Phase 10: Performance, test and ship

- Profile each preset. Use instancing, merged static geometry, level of detail for characters and art cars, culling, and fewer shadow casters. Hit the fps targets.
- Test every scene in the screenshot list on High and Low. Test on a narrow, phone-sized window with touch controls.
- Test old saves load without errors, and that a brand new game starts with the drop.
- Play a full scripted run with puppeteer: drop, land, get a gun, stun a ranger, get wanted, hide, lose the rangers, finish the first quest. Fix anything that fails.
- Update `README.md`: controls, new features, credits. Update `CREDITS.md`.
- Take "after" screenshots of the same scenes as Phase 0 and put a before/after section in `PROGRESS.md`.
- Merge `overhaul` into `main`, push, and check that the GitHub Pages site (composernyc.github.io/phoenix-in-the-dusty-city) loads and plays.

## If time runs short

Do the phases in this order of importance: 1 (hydration), 2 (graphics), 4 (drop), 5 (guns), 6 (rangers), 3 (characters), 9 (HUD), 10 (ship). Phases 7 and 8 can wait for a later session. Never end the session with the game broken on `main`.
