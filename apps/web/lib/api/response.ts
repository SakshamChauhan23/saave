import { NextResponse } from "next/server";
import type { ApiError } from "@saave/shared-types";

export function jsonError(
  message: string,
  status: number,
  extra?: Partial<ApiError>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function unauthorized(): NextResponse {
  return jsonError("Unauthorized", 401);
}