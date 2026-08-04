import type { DemoSeed } from "../seed";
import complex from "./algorithms/complex.json";
import simple from "./algorithms/simple.json";
import reveal from "./templates/reveal.json";
import typeTemplate from "./templates/type.json";

export const demoSeed = {
  templates: [typeTemplate, reveal],
  algorithms: [simple, complex],
} as DemoSeed;
