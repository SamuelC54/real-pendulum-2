import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import * as motor from "./motorClient.js";

const t = initTRPC.context<{ motorUnavailable?: boolean }>().create({
  transformer: superjson,
});

export const appRouter = t.router({
  jog: t.router({
    setVelocity: t.procedure
      .input(z.object({ rpm: z.number().finite() }))
      .mutation(async ({ input }) => {
        try {
          return await motor.setJogVelocityRpm(input.rpm);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`motor: ${msg}`);
        }
      }),
    stop: t.procedure.mutation(async () => {
      try {
        return await motor.stopMotor();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`motor: ${msg}`);
      }
    }),
  }),
  status: t.router({
    get: t.procedure.query(async () => {
      try {
        return await motor.getMotorStatus();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          connected: false,
          commandedRpm: 0,
          detail: msg,
        };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
