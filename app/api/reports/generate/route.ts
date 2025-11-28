import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { flockClient } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { searchQuery } = await req.json();

    if (!searchQuery) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // 1. 해당 검색어(projectName)로 저장된 모든 평가 결과 불러오기
    const evaluations = await prisma.tweetEvaluation.findMany({
      where: {
        projectName: {
          contains: searchQuery,
          mode: 'insensitive'
        }
      },
      include: {
        tweet: true // 원본 트윗 내용도 필요 시 참조
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // 최근 100개 데이터를 기반으로 보고서 작성
    });

    if (evaluations.length === 0) {
      return NextResponse.json(
        { error: "No analysis data found for this topic. Please run Scoring first." },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // 2. 통계 계산
    const total = evaluations.length;
    const goodCount = evaluations.filter(e => e.finalLabel === 'good').length;
    const spamCount = evaluations.filter(e => e.finalLabel === 'shitposting').length;
    const neutralCount = total - goodCount - spamCount;
    
    const avgInfoScore = (evaluations.reduce((sum, e) => sum + e.informationScore, 0) / total).toFixed(1);
    const avgInsightScore = (evaluations.reduce((sum, e) => sum + e.insightScore, 0) / total).toFixed(1);

    // 주요 이유들 수집 (중복 제거)
    const allReasons = evaluations.flatMap(e => e.reasons);
    const uniqueReasons = Array.from(new Set(allReasons)).slice(0, 20).join(", ");

    // 3. Flock LLM 프롬프트 구성
    const systemPrompt = `당신은 Web3 데이터 분석가입니다. 수집된 트윗 평가 데이터를 바탕으로 종합 보고서를 작성해야 합니다. 한국어로 작성하세요.`;
    
    const userPrompt = `
주제: ${searchQuery}
분석된 트윗 수: ${total}개
통계:
- 긍정적(Good): ${goodCount}개
- 스팸/부정적(Shitposting): ${spamCount}개
- 중립(Borderline): ${neutralCount}개
- 평균 정보 점수: ${avgInfoScore}/5
- 평균 통찰력 점수: ${avgInsightScore}/5

주요 평가 사유들:
"${uniqueReasons}"

위 데이터를 바탕으로 다음 구조의 마크다운(Markdown) 보고서를 작성해줘:

1. **종합 요약**: 현재 이 주제에 대한 커뮤니티의 전반적인 분위기와 정보의 질 요약.
2. **주요 담론**: 사람들이 주로 이야기하는 내용 (평가 사유 기반 추론).
3. **리스크 및 스팸 분석**: 스팸 비율이 높다면 어떤 유형의 스팸인지, 정보의 신뢰도는 어떤지.
4. **결론**: 이 프로젝트/주제에 관심을 가져도 좋은지, 주의가 필요한지.
`;

    // 4. LLM 호출
    const completion = await flockClient.chat.completions.create({
      model: process.env.FLOCK_MODEL || "qwen3-30b-a3b-instruct-2507",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const reportContent = completion.choices[0].message.content;

    return NextResponse.json({ 
        stats: {
            total,
            goodCount,
            spamCount,
            avgInfoScore
        },
        report: reportContent 
    }, { headers: { "Access-Control-Allow-Origin": "*" } });

  } catch (error: any) {
    console.error("Report Generation Error:", error);
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

