import { z } from "zod";

export type Timestamps = {
  createdAt: Date;
  updatedAt: Date | null;
};

export const timestampsValidation = z.object({
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
});
