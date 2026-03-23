import { z } from "zod";

export const JsonRpcErrorSchema = z.object({
  id: z.union([z.string(), z.number(), z.null()]),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional()
  })
});

export const JsonRpcResultSchema = z.object({
  id: z.union([z.string(), z.number()]),
  result: z.unknown()
});

export const JsonRpcNotificationSchema = z.object({
  method: z.string(),
  params: z.unknown().optional()
});

export const InitializeResultSchema = z.object({
  protocolVersion: z.string().optional()
}).passthrough();

export const ThreadStartResultSchema = z.object({
  thread: z.object({
    id: z.string()
  }).passthrough()
}).passthrough();

export const TurnStartResultSchema = z.object({
  turn: z.object({
    id: z.string(),
    status: z.string()
  }).passthrough()
}).passthrough();

export type ThreadStartResult = z.infer<typeof ThreadStartResultSchema>;
export type TurnStartResult = z.infer<typeof TurnStartResultSchema>;
