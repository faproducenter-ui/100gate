# 100gate · local opening review

This is a review build of the existing Episode, not a separate game, a montage
substitute, or an update to the published site. Run Vite with the existing
dependencies and open `http://127.0.0.1:5182/?story-intro=1`. Choose **Новая
игра**. Hold R at the knife prompt, then release and press again at the cut
prompt. The touch button uses the same clock. Skipping lands on the first reach
pose, never after release. The preview does not read/write cloud progress or
write the ordinary chapter save.

## Scene and source map

| Beat | Editable local source under `outputs/story-intro` | Runtime evidence |
|---|---|---|
| 22:42 dialogue, reaction shots, approach, door and exit | `cast/story-home-performance.blend`; separate `hero/` and `partner/` originals | Two MPFB skins, separately animated 53-joint armatures, neutral replaceable subtitles |
| Walk, illuminated grocery storefront and glass doors | `street/story-street.blend`; `hero/story-hero-walk.blend` | Real skeletal gait sampled by distance, visible stock, animated door leaves; corrected coplanar sidewalk geometry |
| 23:16, return and approach by the stopped car | Same street set; `grocery/story-grocery-bag.blend` | Same original hero wardrobe, pivoted carrier, two articulated silhouette actors, timed car deceleration/doors and blackout |
| Upright chair, release of left hitch, knife | `escape/story-upright-escape.blend` | No fall; original native wrist geometry; short rear insert shows both chair hitches; FP camera then returns to the blade |
| Reach, grip, cut, unwrap, stand and FPS | Same 48 fps Blender source and exported GLB | R gates sampled poses. Right release requires consecutive travel on the blade, not just elapsed hold time. The same Episode controller handles subsequent movement |

Asset authoring entry points are in `scripts/art/author-story-*.py`. Third-party
source downloads are isolated under `../100gate-art-sources/`; editable results
and review GLBs stay in `outputs/` pending release acceptance. See each set's
JSON manifest for origin, scale, sources and material/mesh counts. The grocery
carrier geometry and paper grain are original. The city bed is [Seamless City
Loop by qubodup](https://freesound.org/people/qubodup/sounds/223093/), CC0, with
hash and download URL in `art/provenance/STORY-CITY-AUDIO.json`.

## Verification commands and boundaries

With Vite on port 5182:

1. `npx vitest run src/episode/story-intro-flow.test.ts src/episode/story-seated.test.ts src/episode/story-street-motion.test.ts`
2. `node scripts/verify-story-seated.mjs`: desktop/landscape touch, natural vs skip, R release and repeat on pause, right restraint, post-stand movement, no save writes.
3. `node scripts/verify-story-street.mjs`: actual WebGL street, actors, shop, car and blackout frames.
4. `node scripts/record-story-intro.mjs`: unstepped, continuous WebM from the start button with actual R/W inputs. Playwright's capture is video only; the game audio is not embedded.
5. `npm run build`: production excludes new story assets and development probes. The release entry remains unchanged.
6. `scripts/art/audit-story-escape.py` on the newly exported editable source: actual evaluated hand/knife and chair/fabric geometry, not object bounds.

Browser motion/control acceptance is distinct from art acceptance. The car
model/egress still uses a distant montage and shared actor base; final car-seat
contact and a finer unwrap performance are not yet approved. Do not promote
this build as a finished commercial cinematic or deploy it.

The verified capture is `outputs/story-intro/full-browser/intro-real-controls.webm`
(159.36 s, 960×540, VP9, no audio stream). A constrained software-rendered
browser took longer than authored scene time; this was not sped up or cut
together. `report.json` logs the actual 22:42–FREE run and the first W movement.
