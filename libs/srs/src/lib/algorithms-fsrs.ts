import { mapObjectProperties } from "@koloda/app";
import type { ObjectPropertiesMapping } from "@koloda/app";
import { msg } from "@lingui/core/macro";
import { fsrs, generatorParameters } from "ts-fsrs";
import type { FSRSParameters } from "ts-fsrs";
import { z } from "zod";

export const LEARNING_STEPS_UNITS = [
  { id: "s", short: msg`fsrs.learning-steps.units.seconds.short`, long: msg`fsrs.learning-steps.units.seconds.long` },
  { id: "m", short: msg`fsrs.learning-steps.units.minutes.short`, long: msg`fsrs.learning-steps.units.minutes.long` },
  { id: "h", short: msg`fsrs.learning-steps.units.hours.short`, long: msg`fsrs.learning-steps.units.hours.long` },
  { id: "d", short: msg`fsrs.learning-steps.units.days.short`, long: msg`fsrs.learning-steps.units.days.long` },
];

export const FSRS_GRADES = [
  msg`fsrs.grades.again`,
  msg`fsrs.grades.hard`,
  msg`fsrs.grades.good`,
  msg`fsrs.grades.easy`,
];

export const LEARNING_STEP_UNITS = ["s", "m", "h", "d"] as const;
export const FSRS6_WEIGHT_COUNT = 21;

const learningStepValidation = z.tuple([z.number().int(), z.string()]);

const algorithmFSRSBaseValidation = z.object({
  type: z.literal("fsrs"),
  retention: z.number(),
  weights: z.string(),
  isFuzzEnabled: z.boolean(),
  learningSteps: z.array(learningStepValidation),
  relearningSteps: z.array(learningStepValidation),
  maximumInterval: z.number(),
});

export const algorithmFSRSValidation = algorithmFSRSBaseValidation.superRefine((data, ctx) => {
  if (data.retention < 70 || data.retention > 99 || !Number.isInteger(data.retention)) {
    ctx.addIssue({
      code: "custom",
      message: "validation.algorithm.fsrs.retention",
      path: ["retention"],
    });
  }

  for (let i = 0; i < data.learningSteps.length; i++) {
    const [amount, unit] = data.learningSteps[i];
    if (amount <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "validation.algorithm.fsrs.learning-steps.amount",
        path: ["learningSteps", i, 0],
      });
    }
    if (!LEARNING_STEP_UNITS.includes(unit as (typeof LEARNING_STEP_UNITS)[number])) {
      ctx.addIssue({
        code: "custom",
        message: "validation.algorithm.fsrs.learning-steps.unit",
        path: ["learningSteps", i, 1],
      });
    }
  }

  for (let i = 0; i < data.relearningSteps.length; i++) {
    const [amount, unit] = data.relearningSteps[i];
    if (amount <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "validation.algorithm.fsrs.relearning-steps.amount",
        path: ["relearningSteps", i, 0],
      });
    }
    if (!LEARNING_STEP_UNITS.includes(unit as (typeof LEARNING_STEP_UNITS)[number])) {
      ctx.addIssue({
        code: "custom",
        message: "validation.algorithm.fsrs.relearning-steps.unit",
        path: ["relearningSteps", i, 1],
      });
    }
  }

  if (data.maximumInterval <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "validation.algorithm.fsrs.maximum-interval",
      path: ["maximumInterval"],
    });
  }

  const weightParts = data.weights.split(",");
  if (weightParts.length !== FSRS6_WEIGHT_COUNT) {
    ctx.addIssue({
      code: "custom",
      message: "validation.algorithm.fsrs.weights",
      path: ["weights"],
    });
    return;
  }

  for (const part of weightParts) {
    if (part.trim().length === 0 || !Number.isFinite(Number(part.trim()))) {
      ctx.addIssue({
        code: "custom",
        message: "validation.algorithm.fsrs.weights",
        path: ["weights"],
      });
      return;
    }
  }
});

export type AlgorithmFSRS = z.infer<typeof algorithmFSRSValidation>;

export const DEFAULT_FSRS_ALGORITHM: AlgorithmFSRS = {
  type: "fsrs",
  retention: 90,
  weights: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483,
    0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ].join(", "),
  isFuzzEnabled: true,
  learningSteps: [
    [1, "m"],
    [10, "m"],
  ],
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
  // WHY: ts-fsrs takes StepUnit[] ("1m"); a joined string makes generatorParameters silently fall back to its default steps.
  const learningSteps = algorithm.learningSteps.map((step) => step.join(""));
  const relearningSteps = algorithm.relearningSteps.map((step) => step.join(""));
  const params = mapObjectProperties(
    { ...algorithm, retention, weights, learningSteps, relearningSteps },
    FSRS_ALGORITHM_PROPERTIES,
  );
  return fsrs(generatorParameters(params));
}
