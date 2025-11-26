import type { EvalResult } from "./evaluatePost";

export type ActionResult = {
  rewardPoints: number; // +면 리워드
  slashPoints: number;  // +면 벌점
};

export function calculateAction(evalResult: EvalResult): ActionResult {
  const {
    information_score,
    relevance_score,
    insight_score,
    spam_likelihood,
    final_label,
  } = evalResult;

  // 1) 극단적 쉿포스트/스팸 → 강한 슬래싱
  if (final_label === "shitposting") {
    const severity = Math.min(1, spam_likelihood + (10 - information_score) / 10);
    const slash = Math.round(10 * severity); // 0~10
    return { rewardPoints: 0, slashPoints: slash };
  }

  // 2) borderline → 약한 리워드 or 경고 수준
  if (final_label === "borderline") {
    const base = (information_score + relevance_score + insight_score) / 3;
    const reward = Math.max(0, Math.round(base / 2)); // 0~5 정도
    const slash = spam_likelihood > 0.5 ? 1 : 0;
    return { rewardPoints: reward, slashPoints: slash };
  }

  // 3) good → 리워드
  const avgScore = (information_score + relevance_score + insight_score) / 3; // 1~10
  const multiplier = 1 + (avgScore - 5) / 5; // 대략 0~2 배 사이
  const reward = Math.max(1, Math.round(5 * multiplier)); // 기본 5점 기준

  return { rewardPoints: reward, slashPoints: 0 };
}

