import { GENERATION_TEMPERATURE } from "./prompts";

export function resolveGenerationTemperature(value?: number) {
  return typeof value === "number" ? value : GENERATION_TEMPERATURE;
}
