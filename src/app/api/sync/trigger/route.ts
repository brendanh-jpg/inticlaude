import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/sync";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const summary = await runSync({ dryRun });

    return NextResponse.json(summary, {
      status: summary.counts.failed > 0 ? 207 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Sync failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
