# Overhaul progress

Branch `overhaul`, November 2026. See `PLAN.md` for the original plan.

## Done
- **Phase 0, groundwork.** Screenshot and regression scripts in `tools/` (gitignored, puppeteer-core + Chrome). `window.__game` debug hooks. `game.js` was **not** split into modules; new systems went into new files instead (`fx.js`, `weapons.js`, `props.js`), which kept risk low.
- **Phase 1, hydration removed.** Meter, water pickups, drain, fainting and save fields are gone. Old saves still load.
- **Phase 2, graphics.** Height fog with sun in-scatter, stylized rim light on every material, new sky (sunset fan, pink belt, Milky Way), split-tone color grade with subtle chromatic aberration, real cracked-mud playa (Poly Haven textures) with macro color variation and distance fade, sunlit dust motes, night starts after sunset instead of before.
- **Phase 3, characters and animation.** Full KayKit set (76 clips). Phoenix aims and shoots with an upper-body layer while the legs walk, strafe or back up; spine bends toward the aim; over-the-shoulder camera; recoil, shake, landing shake.
- **Phase 4, the drop.** "Phoenix Air" art plane flies a random line over the city; jump any time (forced at the end); other burners jump too; freefall steered by the camera with speed lines, wind and a landing marker; four gliders that unlock as you skydive; launch pads and B / phone to drop again; title card on the first drop.
- **Phase 5, guns.** Ten artist guns (Pollock, Van Gogh, Kusama, Lichtenstein, Dalí, disco, Magritte, Haring/Kandinsky, fireworks, confetti), unlimited ammo with heat, hotbar, crosshair with heat ring, pickups on pedestals at art pieces, touch buttons.
- **Phase 6, Rangers.** Wanted stars 0–5, ranger AI (patrol, notice, chase, search, give up), vision cones with line of sight, crowds/night/dust/disguise affect detection, hit effects (stun, confuse, knockback, slow, blind, bubble trap), trucks, drones, 7 searchlight towers, blimp at 5 stars, 22 hideable porta-potties, 9 free closets, Ranger outpost, radio lines, red/blue screen-edge pulse, chase music layer.
- **Phase 7, world (partial).** Couches, rugs, banners, light poles, bike piles, camp signs and lounges scattered through the camps.
- **Phase 8, audio (partial).** Synth sounds for every gun, chase music layer, wind that rises with fall speed.
- **Phase 9, HUD (partial).** Wanted stars, crosshair, hotbar, title card, phone: call plane, gliders, new stats; touch layout reworked.
- **Phase 10.** Regression scripts pass (drop, guns, hiding). Before/after image in `docs/before-after.jpg`.

## Not done / ideas for next time
- Bigger Man and Temple burns (collapse, smoke column) and rain weather.
- Proper weapon wheel; dodge roll; a separate aim sensitivity setting.
- Splitting `game.js` into modules.
- Characters are still the chunky KayKit style. A realistic-proportion swap (Quaternius Universal Base Characters + Universal Animation Library, both CC0) would mean a new rig for every character; noted in CREDITS research.

## Performance (headless Chrome on this Mac, 1280×720, High)
Busy night scenes run about 30 fps in the headless test, roughly 15–20% below the original build because of the extra props and Rangers. Shadows stayed at 2048 on High (4096 cost ~15%). Adaptive resolution still kicks in on slow machines, and the Low preset hides the dust motes and shadows.
