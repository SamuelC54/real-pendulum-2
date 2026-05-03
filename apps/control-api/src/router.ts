import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { friendlyMotorGrpcError } from "./motorErrors.js";
import * as motor from "./motorClient.js";

function friendlyMotorError(err: unknown): string {
  return friendlyMotorGrpcError(motor.motorConnectBaseUrl(), err);
}

const t = initTRPC.context<{ motorUnavailable?: boolean }>().create({
  transformer: superjson,
});

export const appRouter = t.router({
  connection: t.router({
    connect: t.procedure.mutation(async () => {
      try {
        return await motor.connectMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
    disconnect: t.procedure.mutation(async () => {
      try {
        return await motor.disconnectMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  jog: t.router({
    setVelocity: t.procedure
      .input(z.object({ rpm: z.number().finite() }))
      .mutation(async ({ input }) => {
        try {
          return await motor.setJogVelocityRpm(input.rpm);
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
    stop: t.procedure.mutation(async () => {
      try {
        return await motor.stopMotor();
      } catch (e) {
        throw new Error(`motor: ${friendlyMotorError(e)}`);
      }
    }),
  }),
  status: t.router({
    get: t.procedure.query(async () => {
      try {
        return await motor.getMotorStatus();
      } catch (e) {
        return {
          connected: false,
          commandedRpm: 0,
          detail: friendlyMotorError(e),
        };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
