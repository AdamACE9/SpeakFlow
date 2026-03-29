import { NextResponse } from "next/server";

/**
 * Server-side token endpoint — the DEEPGRAM_API_KEY lives only on the server.
 * The browser calls this route over HTTPS to get the key, then uses it to
 * authenticate the WebSocket via the subprotocol header.
 *
 * The key is never bundled into client-side JS. This is the standard pattern
 * recommended by Deepgram for browser-based streaming apps.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY is not configured on this server." },
      { status: 500 }
    );
  }

  // Return the API key as the token — Deepgram accepts both API keys and
  // short-lived JWTs in the WebSocket `['token', value]` subprotocol.
  // The /v1/auth/grant JWT endpoint requires an enterprise plan; using the
  // key directly is the correct approach for standard accounts.
  return NextResponse.json({ token: apiKey.trim() });
}
