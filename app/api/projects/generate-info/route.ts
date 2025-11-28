import { NextResponse } from "next/server";
import { flockClient } from "@/lib/llm";

export const runtime = "nodejs"; 

export async function POST(req: Request) {
  try {
    const { projectName } = await req.json();

    if (!projectName) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const systemPrompt = `당신은 암호화폐 프로젝트와 블록체인 생태계를 전문적으로 분석하는 Web3 전문가입니다. 반드시 한국어로 답변하세요. 공식 웹사이트, 백서, 검증된 Web3 플랫폼 정보를 기반으로 팩트 위주의 분석을 해야 합니다.`;

    const userPrompt = `
프로젝트 이름: ${projectName}

다음 구조로 심층 분석 보고서를 작성해줘:

1. **프로젝트 개요** (Web3 생태계 내 역할 및 해결하려는 문제)
2. **핵심 기술 및 아키텍처** (Layer 1/2 여부, 합의 알고리즘, 기술 스택 등)
3. **토크노믹스** (토큰 유틸리티, 분배 구조, 인플레이션 모델 등)
4. **현재 상태 및 전망** (로드맵, 파트너십, 시장 경쟁력)

반드시 마크다운(Markdown) 형식으로 작성해줘.
`;

    const completion = await flockClient.chat.completions.create({
      model: process.env.FLOCK_MODEL || "qwen3-30b-a3b-instruct-2507",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      stream: false,
    });

    const content = completion.choices[0].message.content;

    return NextResponse.json({ content }, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (error) {
    console.error("Error generating project info:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
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

