import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

type ParseSuccess<T> = {
  data: T;
  response: null;
};

type ParseError = {
  data: null;
  response: NextResponse;
};

type ParseResult<T> = ParseSuccess<T> | ParseError;

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
): ParseResult<T> {
  const { status = 400, errorMessage = "Invalid request body" } = options;
  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      data: null,
      response: NextResponse.json(
        {
          error: errorMessage,
          details: result.error.flatten().fieldErrors,
        },
        { status },
      ),
    };
  }

  return {
    data: result.data,
    response: null,
  };
}

export async function parseRequestJson<T>(
  request: Request,
  schema: ZodSchema<T>,
  options: ParseRequestOptions = {},
): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const { status = 400, invalidJsonMessage = "Invalid JSON body" } = options;
    return {
      data: null,
      response: NextResponse.json({ error: invalidJsonMessage }, { status }),
    };
  }

  return parseWithSchema(body, schema, options);
}
