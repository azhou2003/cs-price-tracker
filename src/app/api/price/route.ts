import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const marketHashName =
    request.nextUrl.searchParams.get("marketHashName")?.trim() ?? "";

  if (!marketHashName) {
    return Response.json(
      {
        error: "Missing required query parameter: marketHashName",
      },
      { status: 400 },
    );
  }

  return Response.json(
    {
      message: "Price proxy scaffold ready",
      marketHashName,
      price: null,
    },
    { status: 200 },
  );
}
