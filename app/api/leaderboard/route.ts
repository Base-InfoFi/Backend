import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeRange = searchParams.get("timeRange") ?? "all";
    const projectSlug = searchParams.get("projectSlug");

    let since: Date | undefined;

    if (timeRange === "24h") {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else if (timeRange === "7d") {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // 프로젝트 필터링
    let projectFilter: { slug?: string } | undefined;
    if (projectSlug) {
      projectFilter = { slug: projectSlug };
    }

    // 유저별 인게이징 집계 (UserScore 기반)
    const whereClause: any = {};
    if (since) {
      whereClause.updatedAt = { gte: since };
    }
    if (projectFilter) {
      whereClause.project = projectFilter;
    }

    const userScores = await prisma.userScore.findMany({
      where: Object.keys(whereClause).length > 0 ? whereClause : {},
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            wallet: true,
            avatarUrl: true,
          },
        },
        project: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    // 유저별 통계 계산
    const userStats = new Map<
      string,
      {
        userId: string;
        userHandle: string | null;
        userDisplayName: string | null;
        userWallet: string | null;
        userAvatarUrl: string | null;
        projectId: string;
        projectSlug: string;
        projectName: string;
        netScore: number;
        postCount: number;
        goodCount: number;
        shitCount: number;
      }
    >();

    // UserScore 기반으로 초기화
    for (const us of userScores) {
      const key = `${us.userId}-${us.projectId}`;
      userStats.set(key, {
        userId: us.userId,
        userHandle: us.user.handle,
        userDisplayName: us.user.displayName,
        userWallet: us.user.wallet,
        userAvatarUrl: us.user.avatarUrl,
        projectId: us.projectId,
        projectSlug: us.project.slug,
        projectName: us.project.name,
        netScore: us.netScore,
        postCount: 0,
        goodCount: 0,
        shitCount: 0,
      });
    }

    // 포스트 기반으로 통계 업데이트
    const postWhereClause: any = {};
    if (since) {
      postWhereClause.createdAt = { gte: since };
    }
    if (projectFilter) {
      postWhereClause.project = projectFilter;
    }

    const posts = await prisma.post.findMany({
      where: Object.keys(postWhereClause).length > 0 ? postWhereClause : {},
      include: {
        author: true,
        project: true,
        evaluation: true,
      },
    });

    for (const p of posts) {
      if (!p.evaluation) continue;

      const key = `${p.authorId}-${p.projectId}`;
      if (!userStats.has(key)) {
        userStats.set(key, {
          userId: p.authorId,
          userHandle: p.author.handle,
          userDisplayName: p.author.displayName,
          userWallet: p.author.wallet,
          userAvatarUrl: p.author.avatarUrl,
          projectId: p.projectId,
          projectSlug: p.project.slug,
          projectName: p.project.name,
          netScore: 0,
          postCount: 0,
          goodCount: 0,
          shitCount: 0,
        });
      }

      const entry = userStats.get(key)!;
      entry.postCount += 1;
      if (p.evaluation.finalLabel === "GOOD") entry.goodCount++;
      if (p.evaluation.finalLabel === "SHITPOSTING") entry.shitCount++;
    }

    const list = Array.from(userStats.values());
    const totalScore = list.reduce(
      (sum, u) => sum + (u.netScore > 0 ? u.netScore : 0),
      0
    );

    const enriched = list
      .map((u) => ({
        userId: u.userId,
        userHandle: u.userHandle,
        userDisplayName: u.userDisplayName || u.userHandle || "Unknown",
        userWallet: u.userWallet,
        userAvatarUrl: u.userAvatarUrl,
        projectId: u.projectId,
        projectSlug: u.projectSlug,
        projectName: u.projectName,
        netScore: u.netScore,
        postCount: u.postCount,
        goodCount: u.goodCount,
        shitCount: u.shitCount,
        currentShare: totalScore > 0 ? u.netScore / totalScore : 0,
        deltaAbs: 0, // TODO: 이전 기간과 비교 계산 필요
        deltaRel: 0, // TODO: 이전 기간과 비교 계산 필요
      }))
      .sort((a, b) => b.netScore - a.netScore);

    return NextResponse.json(enriched, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (e) {
    console.error("Error in GET /api/leaderboard:", e);
    return NextResponse.json(
      { error: "Internal error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

