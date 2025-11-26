import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get("timeRange") ?? "all";

    let since: Date | undefined;

    if (timeRange === "24h") {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (timeRange === "7d") {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // 프로젝트별 netScore 집계
    const posts = await prisma.post.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      include: {
        project: true,
        evaluation: true,
      },
    });

    const agg = new Map<
      string,
      {
        projectId: string;
        projectSlug: string;
        projectName: string;
        netScore: number;
        postCount: number;
        goodCount: number;
        shitCount: number;
      }
    >();

    for (const p of posts) {
      if (!p.evaluation) continue;

      const key = p.projectId;

      if (!agg.has(key)) {
        agg.set(key, {
          projectId: p.projectId,
          projectSlug: p.project.slug,
          projectName: p.project.name,
          netScore: 0,
          postCount: 0,
          goodCount: 0,
          shitCount: 0,
        });
      }

      const entry = agg.get(key)!;
      const delta = p.evaluation.rewardPoints - p.evaluation.slashPoints;
      entry.netScore += delta;
      entry.postCount += 1;

      if (p.evaluation.finalLabel === "GOOD") entry.goodCount++;
      if (p.evaluation.finalLabel === "SHITPOSTING") entry.shitCount++;
    }

    const list = Array.from(agg.values());
    const totalScore = list.reduce(
      (sum, p) => sum + (p.netScore > 0 ? p.netScore : 0),
      0
    );

    const enriched = list
      .map((p) => ({
        ...p,
        currentShare: totalScore > 0 ? p.netScore / totalScore : 0,
        deltaAbs: 0, // TODO: 이전 기간과 비교 계산 필요
        deltaRel: 0, // TODO: 이전 기간과 비교 계산 필요
      }))
      .sort((a, b) => b.currentShare - a.currentShare);

    return NextResponse.json(enriched);
  } catch (e) {
    console.error("Error in GET /api/leaderboard:", e);
    return NextResponse.json(
      { error: "Internal error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

