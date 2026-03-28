import { NextResponse } from "next/server";

/**
 * Server-side token endpoint — keeps the real DEEPGRAM_API_KEY on the server.
 * Issues a short-lived (60s) access token that the browser uses to open its
 * WebSocket connection. The WebSocket stays open after the token expires.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not configured on this server." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Deepgram grant error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to issue Deepgram token." },
        { status: 502 }
      );
    }

    const { access_token } = await res.json();
    return NextResponse.json({ token: access_token });
  } catch (err) {
    console.error("Deepgram token fetch error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
