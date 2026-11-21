// Rebuild: clone cassidyrice/cardology-mirror next to this project, then
//   bun build vendor/engine-entry.ts --outfile vendor/engine.mjs --format esm --minify --target browser
// The bundle is the cardblueprints.com engine + copy libraries, unmodified.
import { buildCardApp } from "../../repos/cardology-mirror/lib/card-app";
import { appReadingLibrary } from "../../repos/cardology-mirror/lib/period-library";
import { READING_INTERPRETATION_GUIDE } from "../../repos/cardology-mirror/lib/interpretation-guidance";
import { cardBible } from "../../repos/cardology-mirror/lib/card-bible";
import { cardCopy } from "../../repos/cardology-mirror/lib/year-copy";
import { toYearCard } from "../../repos/cardology-mirror/lib/year-blueprint";
import { buildQuestionReadingFacts } from "../../repos/cardology-mirror/lib/question-reading-facts";
import { cardology } from "../../repos/cardology-mirror/lib/engine-core/engine.js";
import NOTES from "../../repos/cardology-mirror/lib/card-reading-notes.json";
export const CardBlueprints = { buildCardApp, appReadingLibrary, GUIDE: READING_INTERPRETATION_GUIDE, cardBible, cardCopy, toYearCard, NOTES, buildQuestionReadingFacts, cardology };
