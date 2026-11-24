import { NextRequest, NextResponse } from "next/server";

// Gives every browser an anonymous ID cookie on its first page load. Rate limits
// are counted per browser (see lib/rate-limit.ts), so students sharing one public
// IP on campus Wi-Fi don't block each other. Same cookie save-schedule already uses.
const CLIENT_ID_COOKIE = "advisle_cid";

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get(CLIENT_ID_COOKIE)) {
    res.cookies.set(CLIENT_ID_COOKIE, crypto.randomUUID().replace(/-/g, "").slice(0, 16), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}

export const config = {
  // Pages only — skip API routes, Next internals, and static files
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
