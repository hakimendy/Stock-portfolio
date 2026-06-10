import { NextRequest, NextResponse } from "next/server";

// ── Simple in-memory rate limiter ─────────────────────────────────────
// For production with multiple Vercel instances, swap this for Upstash Redis:
//   npm install @upstash/ratelimit @upstash/redis
//   See: https://github.com/upstash/ratelimit
const rateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 15;         // per window
const WINDOW_MS    = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now    = Date.now();
  const entry  = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}

export async function POST(req: NextRequest) {
  // Rate limiting by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before making more AI requests." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit":     String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "Retry-After":           "3600",
        },
      }
    );
  }

  // Validate API key exists
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI service not configured. Add ANTHROPIC_API_KEY to environment variables." },
      { status: 503 }
    );
  }

  // Parse and validate body
  let body: { messages: unknown[]; max_tokens?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  // Forward to Anthropic — key never leaves the server
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,           // ✅ Server-side only
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: body.max_tokens ?? 1000,
        messages:   body.messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic error:", res.status, err);
      return NextResponse.json(
        { error: `AI service error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "X-RateLimit-Remaining": String(remaining) },
    });

  } catch (err) {
    console.error("AI route error:", err);
    return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
  }
}
