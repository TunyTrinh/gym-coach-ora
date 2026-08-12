import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { bookGymSlot, cancelGymBooking, getGymSnapshot, markGymAttendance } from "./gym-store";
import { getDb } from "./db";
import { users, coachClients, coachNotes, auditLogs, coaches } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
  admin: router({
    updateRole: protectedProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "coach", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        await db.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "UPDATE_ROLE",
          targetUserId: input.userId,
          details: `Role updated to ${input.role}`,
        });
        return { success: true };
      }),
    assignClient: protectedProcedure
      .input(z.object({ coachId: z.number(), clientUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Admin access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        await db.insert(coachClients).values({
          coachId: input.coachId,
          clientUserId: input.clientUserId,
          isPrimary: true,
          assignedBy: ctx.user.id,
        });
        return { success: true };
      }),
  }),
  coach: router({
    clients: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
        throw new Error("Unauthorized: Coach access required.");
      }
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      
      const coachRecord = await db.select().from(coaches).where(eq(coaches.userId, ctx.user.id)).limit(1);
      const coach = coachRecord[0];
      
      if (!coach && ctx.user.role !== "admin") {
        throw new Error("Coach profile not found.");
      }
      
      const query = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .innerJoin(coachClients, eq(users.id, coachClients.clientUserId))
        .where(ctx.user.role === "coach" && coach ? eq(coachClients.coachId, coach.id) : undefined);
        
      return query;
    }),
    saveNote: protectedProcedure
      .input(z.object({ clientUserId: z.number(), note: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "coach" && ctx.user.role !== "admin") {
          throw new Error("Unauthorized: Coach access required.");
        }
        const db = await getDb();
        if (!db) throw new Error("Database unavailable");
        
        const coachRecord = await db.select().from(coaches).where(eq(coaches.userId, ctx.user.id)).limit(1);
        const coach = coachRecord[0];
        
        await db.insert(coachNotes).values({
          coachId: coach ? coach.id : 0,
          clientUserId: input.clientUserId,
          note: input.note,
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
