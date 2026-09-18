# Ember, the DriftGuard companion

Ember is a little lantern-spirit: a round amber body, teal visor, living flame, and a compass badge. It nudges; it never scolds.

## Moods

| File | When it shows |
|---|---|
| `idle.svg` | No session. Hanging out. |
| `happy.svg` | Live session, on track. |
| `alert.svg` | Drift check-in. |
| `sleepy.svg` | On a break, or paused. |
| `celebrate.svg` | Session done, streak kept. |
| `thinking.svg` | Loading, or nothing to show yet. |

The animated SVG is the product art. Portraits in `assets/mascot/portraits/` are the illustration stills of the same character.

## Where it lives

- Extension: `assets/mascot/*.svg` — mapped in `src/mascot.js`
- Popup: inline SVG via `hydrateMascots()` into `[data-mascot]` slots
- In-page prompt: `<img src>` from `mascotUrl(mood)` (needs `web_accessible_resources`)
- Website: `site/public/mascot/*.svg` — mapped in `site/lib/mascot.ts`

## Regenerating the SVG files

```bash
node --input-type=module -e '
import { mascotMarkup } from "./src/mascot.js";
import { writeFileSync, copyFileSync } from "fs";
const moods = ["idle","happy","alert","thinking","sleepy","celebrate"];
for (const mood of moods) {
  writeFileSync("assets/mascot/"+mood+".svg", mascotMarkup(mood, { size: 200, id: "ember-"+mood })+"\n");
  copyFileSync("assets/mascot/"+mood+".svg", "site/public/mascot/"+mood+".svg");
}
writeFileSync("assets/mascot/ember.svg", mascotMarkup("idle", { size: 200, id: "ember" })+"\n");
'
```

Keep the same viewBox, scale and light direction so mood switches do not jump.
