import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateTweet } from "@/lib/flock-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { searchQuery } = await req.json();

    if (!searchQuery) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    console.log(`Searching for NEW tweets matching: ${searchQuery}`);

    // 1. DB에서 조건에 맞는 *미평가* 트윗 조회
    // 이미 평가된(evaluations가 존재하는) 트윗은 제외함
    const tweets = await prisma.tweet.findMany({
        where: {
            AND: [
                {
                    OR: [
                        { searchQuery: { contains: searchQuery, mode: 'insensitive' } },
                        { content: { contains: searchQuery, mode: 'insensitive' } },
                        { tags: { has: searchQuery } }
                    ]
                },
                {
                    evaluations: {
                        none: {} // 평가 데이터가 없는 것만 조회 (중복 분석 방지)
                    }
                }
            ]
        },
        orderBy: { createdAt: 'desc' },
        take: 10 // 한 번에 10개만 분석
    });

    if (tweets.length === 0) {
        return NextResponse.json({ 
            message: "모든 관련 트윗이 이미 분석되었습니다.",
            results: []
        }, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    const finalResults = [];

    // 2. 조회된 미평가 트윗들에 대해 평가 수행
    for (const tweet of tweets) {
        console.log(`Evaluating new tweet: ${tweet.id}`);
        
        // LLM 호출
        const evalResult = await evaluateTweet(tweet.content, searchQuery);
        
        // 결과 저장 (검색어(searchQuery)를 projectName으로 저장)
        const evaluation = await prisma.tweetEvaluation.create({
            data: {
                tweetId: tweet.id,
                projectName: searchQuery, // 검색어별 분류 저장
                finalLabel: evalResult.finalLabel,
                informationScore: evalResult.informationScore,
                relevanceScore: evalResult.relevanceScore,
                insightScore: evalResult.insightScore,
                reasons: evalResult.reasons,
                rewardPoints: evalResult.rewardPoints,
                slashPoints: evalResult.slashPoints,
                llmModel: process.env.FLOCK_MODEL,
            }
        });
        
        // 결과 포맷팅
        finalResults.push({
            ...evaluation,
            tweetContent: tweet.content,
            tweetAuthor: tweet.username,
            tweetTags: tweet.tags
        });

        // Rate Limit 방지 (0.5초 대기)
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return NextResponse.json({ 
        count: finalResults.length,
        results: finalResults 
    }, { headers: { "Access-Control-Allow-Origin": "*" } });

  } catch (error: any) {
    console.error("Batch Evaluation Error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
