import archetypes from "../data/archetypes.json" with { type: "json" };
import deities from "../data/deities.json" with { type: "json" };
import regionDefaults from "../data/region-defaults.json" with { type: "json" };
import type { Registry } from "./registry.types.js";

export * from "./registry.types.js";

export function loadRegistry(): Registry {
  return {
    deities: deities as Registry["deities"],
    archetypes: archetypes as Registry["archetypes"],
    regionDefaults: regionDefaults as Registry["regionDefaults"],
  };
}
