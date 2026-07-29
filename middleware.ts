import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths don't need auth
  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads/");

  // Check for session cookie
  const sessionCookie = request.cookies.get("fp-user-id");

  if (!sessionCookie && !isPublicPath) {
    // No session, redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (sessionCookie && pathname === "/login") {
    // Already logged in, redirect to orders
    const url = request.nextUrl.clone();
    url.pathname = "/orders";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
