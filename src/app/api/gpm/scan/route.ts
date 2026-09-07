import { NextResponse } from "next/server";
import { gpmClient } from "@/lib/gpm-api";

export async function GET() {
  try {
    const status = await gpmClient.checkConnection();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        isOnline: false,
        message: err?.message || "Không thể kết nối GPMLogin",
        baseUrl: gpmClient.getBaseUrl(),
      },
      { status: 200 }
    );
  }
}
