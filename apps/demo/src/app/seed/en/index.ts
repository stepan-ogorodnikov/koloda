import type { DemoSeed } from "../seed";
import complex from "./algorithms/complex.json";
import simple from "./algorithms/simple.json";
import architects from "./decks/architects.json";
import famousLandmarks from "./decks/famous-landmarks.json";
import literaryAuthors from "./decks/literary-authors.json";
import medicalDiscoveries from "./decks/medical-discoveries.json";
import nobelPrizeWinners from "./decks/nobel-prize-winners.json";
import philosopherQuotes from "./decks/philosopher-quotes.json";
import reveal from "./templates/reveal.json";
import typeTemplate from "./templates/type.json";

export const demoSeed = {
  templates: [typeTemplate, reveal],
  algorithms: [simple, complex],
  decks: [literaryAuthors, architects, famousLandmarks, philosopherQuotes, nobelPrizeWinners, medicalDiscoveries],
} as DemoSeed;
