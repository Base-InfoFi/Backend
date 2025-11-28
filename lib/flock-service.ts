import { flockClient } from "@/lib/llm";

interface EvaluationResult {
  finalLabel: 'good' | 'shitposting' | 'borderline';
  informationScore: number;
  relevanceScore: number;
  insightScore: number;
  reasons: string[];
  rewardPoints: number;
  slashPoints: number;
}

export async function evaluateTweet(content: string, projectName: string = "General"): Promise<EvaluationResult> {
  const systemPrompt = `
당신은 암호화폐 트윗을 분석하여 스팸 여부와 정보의 질을 평가하는 전문가입니다.
반드시 다음 JSON 형식으로만 응답하세요:
{
  "finalLabel": "good" | "shitposting" | "borderline",
  "informationScore": 0~5,
  "relevanceScore": 0~5,
  "insightScore": 0~5,
  "reasons": ["이유1", "이유2"]
}

평가 기준:
- good: 유의미한 뉴스, 분석, 기술적 논의, 정성스러운 의견
- shitposting: 단순 밈, 의미 없는 말장난, 사기/광고성 도배, 'GM' 같은 인사
- borderline: 애매하거나 판단하기 어려움
`;

  const userPrompt = `
프로젝트: ${projectName}
트윗 내용:
"${content}"

위 트윗을 분석해주세요.
`;

  try {
    const completion = await flockClient.chat.completions.create({
      model: process.env.FLOCK_MODEL || "qwen3-30b-a3b-instruct-2507",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // 분석이므로 낮은 온도
      max_tokens: 500,
    });

    const rawContent = completion.choices[0].message.content || "{}";
    
    // JSON 추출 (마크다운 코드 블록 제거 등)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : "{}";
    
    const result = JSON.parse(jsonStr);

    // 점수 계산 로직 (간단한 예시)
    let reward = 0;
    let slash = 0;

    if (result.finalLabel === 'good') {
        reward = (result.informationScore + result.insightScore) * 10;
    } else if (result.finalLabel === 'shitposting') {
        slash = 50; // 벌점
    }

    return {
        finalLabel: result.finalLabel || 'borderline',
        informationScore: result.informationScore || 0,
        relevanceScore: result.relevanceScore || 0,
        insightScore: result.insightScore || 0,
        reasons: result.reasons || [],
        rewardPoints: reward,
        slashPoints: slash
    };

  } catch (error) {
    console.error("LLM Evaluation Error:", error);
    // 에러 시 기본값 반환
    return {
        finalLabel: 'borderline',
        informationScore: 0,
        relevanceScore: 0,
        insightScore: 0,
        reasons: ["Evaluation failed"],
        rewardPoints: 0,
        slashPoints: 0
    };
  }
}

