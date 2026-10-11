import "server-only";

import { z } from "zod";

import { isDatabaseConfigured } from "@/lib/db";
import { reportError } from "@/lib/monitoring";
import { callerOf, countBadToken, LIMITS, takeRequest } from "./rate-limit";

// Conventions of the REST API (plan §4.9): JSON in and out, errors as
// { "error": { "code", "message", "fields"? } } with the HTTP status, never cached.

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/** Throw from a handler to answer with an error; the message is for developers, in English. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
    /** Extra machine-readable facts, e.g. what was recorded despite a conflict. */
    readonly details?: Record<string, unknown>,
    /** Extra response headers, e.g. Retry-After. */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export function errorResponse(e: ApiError) {
  const headers: Record<string, string> = {
    ...(e.code === "unauthorized" ? { "www-authenticate": 'Bearer realm="api"' } : {}),
    ...e.headers,
  };
  return json(
    {
      error: {
        code: e.code,
        message: e.message,
        ...(e.fields ? { fields: e.fields } : {}),
        ...(e.details ? { details: e.details } : {}),
      },
    },
    { status: STATUS[e.code], headers },
  );
}

/** Field errors of a failed Zod parse, as `{ field: [message keys] }`. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const flat = z.flattenError(error);
  const fields = Object.fromEntries(
    Object.entries(flat.fieldErrors as Record<string, string[] | undefined>).filter(
      (e): e is [string, string[]] => Boolean(e[1]?.length),
    ),
  );
  if (flat.formErrors.length) fields._ = flat.formErrors;
  return fields;
}

/** Parse with a Zod schema or answer 400 with the field errors. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError("validation_failed", "Some fields are invalid.", fieldErrors(result.error));
  }
  return result.data;
}

/** Query string as a plain object (first value of repeated keys, empty values dropped). */
export function queryOf(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (value !== "" && !(key in out)) out[key] = value;
  }
  return out;
}

/** JSON body of a request, or 400. */
/** The JSON body; an empty body gives `whenEmpty` if the endpoint allows one. */
export async function bodyOf(request: Request, whenEmpty?: unknown): Promise<unknown> {
  const text = await request.text();
  if (!text.trim() && whenEmpty !== undefined) return whenEmpty;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", "The request body must be JSON.");
  }
}

/** Counts the request (API-6): its rate-limit headers, or 429 when the caller is over the limit. */
async function limitRequest(request: Request) {
  if (!isDatabaseConfigured()) return null;
  const caller = callerOf(request);
  const { count, badTokens, resetIn } = await takeRequest(caller);
  const headers = {
    "x-ratelimit-limit": String(caller.limit),
    "x-ratelimit-remaining": String(Math.max(0, caller.limit - count)),
    "x-ratelimit-reset": String(resetIn),
  };
  const tokenSent = !caller.key.startsWith("ip:");
  if (count > caller.limit || (tokenSent && badTokens >= LIMITS.badTokens)) {
    throw new ApiError(
      "rate_limited",
      `Too many requests: at most ${caller.limit} a minute. Try again in ${resetIn} s.`,
      undefined,
      { limit: caller.limit, retryAfter: resetIn },
      { ...headers, "retry-after": String(resetIn) },
    );
  }
  return { headers, badKey: tokenSent ? caller.badKey : null };
}

/**
 * Wraps a route handler: counts the request against the caller's limit (API-6), ApiErrors
 * become their JSON answer, anything else is reported and answered with a generic 500 (no
 * internals leak).
 */
export function apiRoute<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    let limit: Awaited<ReturnType<typeof limitRequest>> = null;
    try {
      limit = await limitRequest(request);
      return withHeaders(await handler(request, context), limit?.headers);
    } catch (e) {
      if (e instanceof ApiError) {
        // A refused token counts against the address, so made-up tokens don't escape the limit.
        if (e.code === "unauthorized" && limit?.badKey) await countBadToken(limit.badKey);
        return withHeaders(errorResponse(e), limit?.headers);
      }
      await reportError(e, {
        where: "api",
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return errorResponse(new ApiError("internal", "Something went wrong."));
    }
  };
}

function withHeaders(response: Response, headers: Record<string, string> | undefined) {
  for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
  return response;
}
