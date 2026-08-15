export const runtime = "nodejs";
// Tiled inference on a large scene can take well over the default limit.
export const maxDuration = 300;

import { NextResponse } from "next/server";

/**
 * Proxy to the Python segmentation service, so the browser talks only to the
 * Next.js origin and the model service can stay bound to localhost.
 *
 * Start the service with:
 *   .venv\Scripts\python.exe -m uvicorn serve:app --app-dir src --port 8000
 */
const SERVICE_URL = process.env.GLOF_SERVICE_URL ?? "http://localhost:8000";

function unreachable(detail: string) {
  return NextResponse.json(
    {
      error: "Segmentation service unavailable.",
      details: detail,
      hint:
        "Start it with: .venv\\Scripts\\python.exe -m uvicorn serve:app --app-dir src --port 8000",
    },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const response = await fetch(`${SERVICE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return unreachable(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    return NextResponse.json(
      { error: "Expected a multipart form upload.", details: String(error) },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file supplied under the 'file' field." }, { status: 400 });
  }

  try {
    const response = await fetch(`${SERVICE_URL}/predict`, {
      method: "POST",
      body: form,
      // Inference is slow on CPU; allow well beyond a normal request timeout.
      signal: AbortSignal.timeout(280_000),
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Segmentation service returned a non-JSON response.", details: text.slice(0, 500) },
        { status: 502 },
      );
    }
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    if (detail.includes("timed out") || detail.includes("TimeoutError")) {
      return NextResponse.json(
        { error: "Segmentation timed out.", details: "Try a smaller scene or fewer MC passes." },
        { status: 504 },
      );
    }
    return unreachable(detail);
  }
}
