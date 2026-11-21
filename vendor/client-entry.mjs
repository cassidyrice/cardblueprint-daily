// Browser bundle: bun build vendor/client-entry.mjs --outfile public/engine.js --format iife --minify --target browser
import { CardBlueprints } from "./engine.mjs";
import { makeBrain } from "../shared/brain.mjs";
globalThis.CardBlueprints = CardBlueprints;
globalThis.makeBrain = makeBrain;
