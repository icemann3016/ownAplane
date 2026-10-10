import { z } from "zod";

// Building blocks of the OpenAPI description (lib/api/openapi.ts and its parts per area).

export type JsonSchema = Record<string, unknown>;

export const output = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "output" }) as JsonSchema;

/** Query schema → OpenAPI query parameters. */
export function queryParameters(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, s]) => ({
    name,
    in: "query",
    required: json.required?.includes(name) ?? false,
    description: s.description,
    schema: s,
  }));
}

export const pathId = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
});

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
export const ok = (data: JsonSchema, list = false) => ({
  200: {
    description: "OK",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: list
            ? { data: { type: "array", items: data }, nextCursor: { type: ["string", "null"] } }
            : { data },
          required: ["data"],
        },
      },
    },
  },
});
export const errors = (...codes: number[]) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      { description: "Error", content: { "application/json": { schema: ref("Error") } } },
    ]),
  );
export const input = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
export const jsonBody = (schema: z.ZodType) => ({
  required: true,
  content: { "application/json": { schema: input(schema) } },
});
export const connectionKey = [{ connectionKey: [] }];
export const signedIn = [{ bearer: [] }];
export const optionalSignIn = [{}, { bearer: [] }];
