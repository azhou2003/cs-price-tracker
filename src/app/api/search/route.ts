import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return Response.json(
      {
        error: "Missing required query parameter: q",
      },
      { status: 400 },
    );
  }

  return Response.json(
    {
      message: "Search proxy scaffold ready",
      query,
      results: [],
    },
    { status: 200 },
  );
}
