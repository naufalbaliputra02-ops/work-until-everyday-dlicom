import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const level = JSON.parse(
  readFileSync(fileURLToPath(new URL("../assets/level.json", import.meta.url)), "utf8"),
);

/** A point inside `zone` the player can actually stand on. */
export function freeSpotIn(world, zone) {
  for (let y = zone[1] + 2; y <= zone[3] - 2; y += 2) {
    for (let x = zone[0] + 2; x <= zone[2] - 2; x += 2) {
      if (!world.collides(x, y)) return [x, y];
    }
  }
  return null;
}
