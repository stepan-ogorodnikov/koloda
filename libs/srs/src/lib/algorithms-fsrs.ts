import { msg } from "@lingui/core/macro";
import { fsrs, generatorParameters } from "ts-fsrs";
import type { FSRSParameters } from "ts-fsrs";
import { z } from "zod/v4";
import { mapObjectProperties } from "./utility";
import type { ObjectPropertiesMapping } from "./utility";

export const LEARNING_STEPS_UNITS = [
  { id: "s", short: msg`fsrs.learning-steps.units.seconds.short`, long: msg`fsrs.learning-steps.units.seconds.long` },
  { id: "m", short: msg`fsrs.learning-steps.units.minutes.short`, long: msg`fsrs.learning-steps.units.minutes.long` },
  { id: "h", short: msg`fsrs.learning-steps.units.hours.short`, long: msg`fsrs.learning-steps.units.hours.long` },
  { id: "d", short: msg`fsrs.learning-steps.units.days.short`, long: msg`fsrs.learning-steps.units.days.long` },
];

const learningStepsValidation = z.array(
  z.tuple([z.int(), z.literal(["s", "m", "h", "d"])]),
);

export const algorithmFSRSValidation = z.object({
  type: z.literal("fsrs"),
  retention: z.number().min(70).max(99),
  weights: z.string(),
  isFuzzEnabled: z.boolean(),
  learningSteps: learningStepsValidation,
  relearningSteps: learningStepsValidation,
  maximumInterval: z.number(),
});

export type AlgorithmFSRS = z.infer<typeof algorithmFSRSValidation>;

export const DEFAULT_FSRS_ALGORITHM: AlgorithmFSRS = {
  type: "fsrs",
  retention: 90,
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
  isFuzzEnabled: true,
  learningSteps: [[1, "m"], [10, "m"]],
  relearningSteps: [[10, "m"]],
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
  const retention = algorithm.retention / 100;
  const weights = algorithm.weights.split(",").map(Number);
  const learningSteps = algorithm.learningSteps.map((step) => step.join()).join(", ");
  const relearningSteps = algorithm.relearningSteps.map((step) => step.join()).join(", ");
  const params = mapObjectProperties(
    { ...algorithm, retention, weights, learningSteps, relearningSteps },
    FSRS_ALGORITHM_PROPERTIES,
  );
  return fsrs(generatorParameters(params));
}
