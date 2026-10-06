/**
 * @file src/availability/schema.ts
 * @desc availabilitySchema: the zod shape of a stored grid.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";
import { assertTimeZone, isTimeZone } from "../zone/offset.js";

const WEEK_MINUTES = 10_080;

/**
 * A stored grid: slotMinutes a whole divisor of 1440 from 5 up, slots strictly increasing inside
 * the week, and zone (a valid IANA zone, output as Intl names it) with week (a Monday,
 * YYYY-MM-DD) both or neither.
 */
export const availabilitySchema = z
  .object({
    slotMinutes: z
      .number()
      .int()
      .min(5)
      .max(1440)
      .refine((m) => 1440 % m === 0, "slotMinutes must divide 1440"),
    slots: z.array(z.number().int().min(0)),
    zone: z
      .string()
      .refine(isTimeZone, "not an IANA time zone")
      .transform(assertTimeZone)
      .optional(),
    week: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((w) => {
        const d = new Date(`${w}T00:00:00Z`);
        return d.toISOString().startsWith(w) && d.getUTCDay() === 1;
      }, "week must be a Monday")
      .optional(),
  })
  .superRefine((grid, ctx) => {
    const total = WEEK_MINUTES / grid.slotMinutes;
    grid.slots.forEach((slot, i) => {
      const prev = grid.slots[i - 1];
      if (slot >= total || (prev !== undefined && slot <= prev)) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i],
          message: "slots must increase and fit the week",
        });
      }
    });
    if ((grid.zone === undefined) !== (grid.week === undefined)) {
      ctx.addIssue({ code: "custom", path: ["week"], message: "zone and week go together" });
    }
  });
