import { fsrs, generatorParameters } from "ts-fsrs";
import type { FSRSParameters } from "ts-fsrs";
import { z } from "zod/v4";
import { mapObjectProperties } from "./utility";
import type { ObjectPropertiesMapping } from "./utility";

export const algorithmFSRSValidation = z.object({
  type: z.literal("fsrs"),
  retention: z.number(),
  weights: z.string(),
  isFuzzEnabled: z.boolean(),
  learningSteps: z.string(),
  relearningSteps: z.string(),
  maximumInterval: z.number(),
});

export type AlgorithmFSRS = z.infer<typeof algorithmFSRSValidation>;

export const DEFAULT_FSRS_ALGORITHM: AlgorithmFSRS = {
  type: "fsrs",
  retention: 0.9,
  weights: [
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    0.001,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    0.1542,
  ].join(", "),
  isFuzzEnabled: false,
  learningSteps: ["1m", "10m"].join(", "),
  relearningSteps: ["10m"].join(", "),
  maximumInterval: 36500,
};

const FSRS_ALGORITHM_PROPERTIES: ObjectPropertiesMapping<AlgorithmFSRS, FSRSParameters> = {
  retention: "request_retention",
  weights: "w",
  learningSteps: "learning_steps",
  relearningSteps: "relearning_steps",
  isFuzzEnabled: "enable_fuzz",
  maximumInterval: "maximum_interval",
} as const;

export function createFSRSAlgorithm(algorithm: AlgorithmFSRS) {
  const weights = algorithm.weights.split(",").map(Number);
  const params = mapObjectProperties({ ...algorithm, weights }, FSRS_ALGORITHM_PROPERTIES);
  return fsrs(generatorParameters(params));
}
