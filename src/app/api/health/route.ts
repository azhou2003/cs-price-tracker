export async function GET() {
  return Response.json({
    status: "ok",
    service: "cs-price-tracker-proxy",
    timestamp: new Date().toISOString(),
  });
}
