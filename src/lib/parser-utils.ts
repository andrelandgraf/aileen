import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

type ParsedResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

interface ParseOptions {
  status?: number;
  errorMessage?: string;
}

interface ParseRequestOptions extends ParseOptions {
  invalidJsonMessage?: string;
}

export function parseWithSchema<T>(
  body: unknown,
  schema: ZodSchema<T>,
  options: ParseOptions = {},
): ParsedResult<T> {
  const { status = 400, errorMessage = "Invalid request body" } = options;
  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      data: null,
      error: NextResponse.json(
        {
          error: errorMessage,
          details: result.error.flatten().fieldErrors,
        },
        { status },
      ),
    };
  }

  return { data: result.data, error: null };
}

export async function parseRequestJson<T>(
  request: Request,
  schema: ZodSchema<T>,
  options: ParseRequestOptions = {},
): Promise<ParsedResult<T>> {
  try {
    const body = await request.json();
    return parseWithSchema(body, schema, options);
  } catch {
    const { status = 400, invalidJsonMessage = "Invalid JSON body" } = options;
    return {
      data: null,
      error: NextResponse.json({ error: invalidJsonMessage }, { status }),
    };
  }
}
