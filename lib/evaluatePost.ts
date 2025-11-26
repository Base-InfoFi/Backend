import { flockClient } from "./llm";

export type EvalResult = {
  information_score: number;
  relevance_score: number;
  insight_score: number;
  spam_likelihood: number;
  final_label: "good" | "shitposting" | "borderline";
  reasons: string[];
};

const SYSTEM_PROMPT = `
You are an AI moderator for a Web3 InfoFi protocol.
Your job is to evaluate user posts about a specific crypto project
and decide whether each post is valuable information or low-quality shitposting.

Follow these rules:

1. A post is likely "shitposting" if:
   - The text is extremely short (e.g. less than 15~20 meaningful words) AND contains no concrete information.
   - It only contains hype words, memes, or emojis without explaining anything.
   - It only tags the project name or ticker without any analysis or context.
   - It excessively uses NSFW or offensive language unrelated to project analysis.
   - It contains many unrelated hashtags or links.
   - The attached image or content is clearly unrelated to the project topic.

2. A post is likely "good" if:
   - It explains something factual or useful about the project
     (tokenomics, roadmap, partnerships, risks, mechanism, user experience, etc.).
   - It provides personal insight, a clear opinion with reasoning, or concrete data.
   - It helps other users understand the project better.

3. Use the provided PROJECT CONTEXT to check whether the post is aligned with
   the project's actual docs/whitepaper.
   - If the post clearly contradicts basic facts from the context, increase spam_likelihood.
   - If you are not sure, DO NOT treat it as definitely false. Just lower information_score.

4. Output STRICT JSON with the following fields:
   - information_score: integer 1~10
   - relevance_score: integer 1~10
   - insight_score: integer 1~10
   - spam_likelihood: float 0~1
   - final_label: "good" | "shitposting" | "borderline"
   - reasons: string[] (short bullet reasons)

Borderline examples:
- Some information but very shallow or partially spammy.
- Mixed content: half meme, half short info.

Do not include any explanation outside JSON.
`;

export async function evaluatePostWithFlock(params: {
  projectName: string;
  projectContext: string;
  content: string;
}): Promise<EvalResult> {
  const { projectName, projectContext, content } = params;

  const userPrompt = `
[PROJECT NAME]
${projectName}

[PROJECT CONTEXT]
${projectContext || "(no extra context provided)"}

[USER POST]
${content}
`;

  const completion = await flockClient.chat.completions.create({
    model: process.env.FLOCK_MODEL || "qwen3-30b-a3b-instruct-2507",
    stream: false,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 512,
  });

  const raw = completion.choices[0].message.content ?? "{}";

  let parsed: EvalResult;

  try {
    parsed = JSON.parse(raw) as EvalResult;
  } catch (e) {
    console.error("Failed to parse LLM JSON:", raw);
    // 실패 시 보수적으로 shitposting으로 처리
    parsed = {
      information_score: 1,
      relevance_score: 1,
      insight_score: 1,
      spam_likelihood: 1,
      final_label: "shitposting",
      reasons: ["LLM output parse error"],
    };
  }

  return parsed;
}

