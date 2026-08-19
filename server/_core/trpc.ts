import { UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx, path }) {
    if (shape.data.code !== "INTERNAL_SERVER_ERROR") return shape;
    const reference = String(ctx?.res.locals.requestId ?? "unavailable");
    // Keep the correlation reference and failure class server-side without
    // emitting SQL, bind parameters, stack traces, or user input to clients.
    console.error("[api] internal tRPC failure", { reference, path, code: error.code, causeCode: (error.cause as { code?: string } | undefined)?.code });
    return {
      ...shape,
      message: `Request could not be completed. Please try again or contact the administrator. Reference: ${reference}`,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

function requireRole(...roles: Array<"client" | "coach" | "admin">) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This account does not have permission to perform that action." });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const clientProcedure = t.procedure.use(requireRole("client"));
export const coachProcedure = t.procedure.use(requireRole("coach"));
export const coachOrAdminProcedure = t.procedure.use(requireRole("coach", "admin"));

export const adminProcedure = t.procedure.use(requireRole("admin"));
