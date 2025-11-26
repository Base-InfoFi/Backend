import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluatePostWithFlock } from "@/lib/evaluatePost";
import { calculateAction } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      projectSlug,
      author,
      source,
      sourceId,
      url,
      content,
      postedAt,
    } = body;

    if (!projectSlug || !content) {
      return NextResponse.json(
        { error: "projectSlug and content are required" },
        { status: 400 }
      );
    }

    // 1. 프로젝트 조회
    const project = await prisma.project.findUnique({
      where: { slug: projectSlug },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 2. 유저 upsert (wallet 또는 handle 기준)
    let user;
    if (author?.wallet) {
      // wallet으로 먼저 찾기
      user = await prisma.user.findFirst({
        where: { wallet: author.wallet },
      });
      if (user) {
        // 업데이트
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            handle: author?.handle ?? undefined,
          },
        });
      } else {
        // 생성
        user = await prisma.user.create({
          data: {
            wallet: author.wallet,
            handle: author?.handle ?? undefined,
            displayName: author?.handle ?? undefined,
          },
        });
      }
    } else if (author?.handle) {
      // handle로 찾거나 생성
      user = await prisma.user.findFirst({
        where: { handle: author.handle },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            handle: author.handle,
            displayName: author.handle,
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: "author.wallet or author.handle is required" },
        { status: 400 }
      );
    }

    // 3. Post 생성
    const post = await prisma.post.create({
      data: {
        projectId: project.id,
        authorId: user.id,
        source: source ?? "x",
        sourceId,
        url,
        rawContent: content,
        postedAt: postedAt ? new Date(postedAt) : undefined,
      },
    });

    // 4. Flock 평가 호출
    const evalResult = await evaluatePostWithFlock({
      projectName: project.name,
      projectContext: project.contextSummary ?? "",
      content,
    });

    // 5. 상벌 계산
    const { rewardPoints, slashPoints } = calculateAction(evalResult);

    // 6. Evaluation 저장
    const evaluation = await prisma.evaluation.create({
      data: {
        postId: post.id,
        informationScore: evalResult.information_score,
        relevanceScore: evalResult.relevance_score,
        insightScore: evalResult.insight_score,
        spamLikelihood: evalResult.spam_likelihood,
        finalLabel: evalResult.final_label.toUpperCase() as "GOOD" | "SHITPOSTING" | "BORDERLINE",
        rewardPoints,
        slashPoints,
        llmModel: process.env.FLOCK_MODEL || "qwen3-30b-a3b-instruct-2507",
        llmRawJson: JSON.stringify(evalResult),
      },
    });

    // 7. UserScore upsert
    const score = await prisma.userScore.upsert({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: project.id,
        },
      },
      update: {
        totalReward: { increment: rewardPoints },
        totalSlash: { increment: slashPoints },
        netScore: { increment: rewardPoints - slashPoints },
      },
      create: {
        userId: user.id,
        projectId: project.id,
        totalReward: rewardPoints,
        totalSlash: slashPoints,
        netScore: rewardPoints - slashPoints,
      },
    });

    return NextResponse.json({
      postId: post.id,
      evaluation,
      score,
    });
  } catch (e) {
    console.error("Error in POST /api/posts:", e);
    return NextResponse.json(
      { error: "Internal error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

