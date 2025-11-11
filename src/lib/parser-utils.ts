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
