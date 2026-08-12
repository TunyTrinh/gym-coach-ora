import { z } from "zod";

import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { bookGymSlot, cancelGymBooking, getGymSnapshot, markGymAttendance } from "./gym-store";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  gym: router({
    snapshot: publicProcedure.query(() => getGymSnapshot()),
    book: protectedProcedure
      .input(z.object({ slotId: z.string().min(1).max(64) }))
      .mutation(({ ctx, input }) => bookGymSlot(input.slotId, ctx.user.id)),
    cancel: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), reason: z.string().trim().min(1).max(240).optional() }))
      .mutation(({ ctx, input }) => cancelGymBooking(input.bookingId, ctx.user.id, input.reason)),
    attendance: protectedProcedure
      .input(z.object({ bookingId: z.string().min(1).max(64), status: z.enum(["Completed", "No-show"]) }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "admin") return { success: false as const, error: "Staff access is required to update attendance." };
        return markGymAttendance(input.bookingId, input.status);
      }),
  }),
});

export type AppRouter = typeof appRouter;
