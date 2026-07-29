import { NextRequest, NextResponse } from "next/server";

// Style product icon proxy — returns 404 (components handle onError to hide missing icons)
export async function GET(_request: NextRequest) {
  return new NextResponse(null, { status: 404 });
}
