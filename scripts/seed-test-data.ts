import { PrismaClient } from "@prisma/client";
import { calculateAction } from "../lib/scoring";

const prisma = new PrismaClient();

async function main() {
  console.log("테스트 데이터 생성 시작...");

  // 1. 프로젝트 생성 (2개)
  const project1 = await prisma.project.upsert({
    where: { slug: "polymarket" },
    update: {},
    create: {
      slug: "polymarket",
      name: "Polymarket",
      description: "Decentralized prediction market",
      chain: "Ethereum",
      contextSummary: "Polymarket is a decentralized information markets platform built on Ethereum.",
    },
  });

  const project2 = await prisma.project.upsert({
    where: { slug: "kaito" },
    update: {},
    create: {
      slug: "kaito",
      name: "Kaito",
      description: "AI-powered information platform",
      chain: "Base",
      contextSummary: "Kaito is an AI-powered information platform on Base chain.",
    },
  });

  console.log("프로젝트 생성 완료");

  // 2. 사용자 생성 (5명)
  const users = [];
  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.upsert({
      where: { id: `user-${i}` },
      update: {},
      create: {
        id: `user-${i}`,
        handle: `@user${i}`,
        wallet: `0x${"1".repeat(40)}${i}`,
        displayName: `User ${i}`,
      },
    });
    users.push(user);
  }

  console.log("사용자 생성 완료");

  // 3. 포스트 및 평가 데이터 생성 (10개)
  const testPosts = [
    {
      project: project1,
      author: users[0],
      content: "Polymarket is revolutionizing prediction markets with decentralized technology. The platform enables users to bet on real-world events with transparency and security.",
      scores: { info: 9, relevance: 9, insight: 8, spam: 0.1 },
      label: "GOOD" as const,
    },
    {
      project: project1,
      author: users[1],
      content: "Just bought some tokens! 🚀🚀🚀 To the moon!!!",
      scores: { info: 2, relevance: 3, insight: 1, spam: 0.9 },
      label: "SHITPOSTING" as const,
    },
    {
      project: project2,
      author: users[2],
      content: "Kaito's AI technology shows promise, but we need to see more real-world applications before making a final judgment.",
      scores: { info: 6, relevance: 7, insight: 5, spam: 0.3 },
      label: "BORDERLINE" as const,
    },
    {
      project: project1,
      author: users[0],
      content: "Analysis of Polymarket's tokenomics reveals strong fundamentals. The platform's revenue model is sustainable and the team has a clear roadmap.",
      scores: { info: 8, relevance: 9, insight: 9, spam: 0.05 },
      label: "GOOD" as const,
    },
    {
      project: project2,
      author: users[3],
      content: "Kaito is the best project ever! Everyone should invest now!",
      scores: { info: 3, relevance: 4, insight: 2, spam: 0.7 },
      label: "SHITPOSTING" as const,
    },
    {
      project: project1,
      author: users[2],
      content: "Polymarket's integration with various data sources makes it a powerful tool for information markets. The UI could be improved though.",
      scores: { info: 7, relevance: 8, insight: 6, spam: 0.2 },
      label: "GOOD" as const,
    },
    {
      project: project2,
      author: users[4],
      content: "What is Kaito? Can someone explain?",
      scores: { info: 4, relevance: 5, insight: 3, spam: 0.4 },
      label: "BORDERLINE" as const,
    },
    {
      project: project1,
      author: users[1],
      content: "Polymarket's recent partnership announcement shows strong growth potential. The team is executing well on their vision.",
      scores: { info: 8, relevance: 9, insight: 8, spam: 0.1 },
      label: "GOOD" as const,
    },
    {
      project: project2,
      author: users[3],
      content: "Kaito AI features are impressive. The natural language processing capabilities are state-of-the-art.",
      scores: { info: 9, relevance: 9, insight: 8, spam: 0.05 },
      label: "GOOD" as const,
    },
    {
      project: project1,
      author: users[4],
      content: "MOON MOON MOON 🚀🚀🚀 BUY NOW!!!",
      scores: { info: 1, relevance: 2, insight: 1, spam: 0.95 },
      label: "SHITPOSTING" as const,
    },
  ];

  for (let i = 0; i < testPosts.length; i++) {
    const testPost = testPosts[i];
    const { project, author, content, scores, label } = testPost;

    // 포스트 생성
    const post = await prisma.post.create({
      data: {
        projectId: project.id,
        authorId: author.id,
        source: "x",
        sourceId: `test-${i + 1}`,
        url: `https://x.com/user/status/${i + 1}`,
        rawContent: content,
        postedAt: new Date(Date.now() - (testPosts.length - i) * 3600000), // 시간차를 두고 생성
      },
    });

    // 평가 결과 생성
    const evalResult = {
      information_score: scores.info,
      relevance_score: scores.relevance,
      insight_score: scores.insight,
      spam_likelihood: scores.spam,
      final_label: label.toLowerCase(),
    };

    const { rewardPoints, slashPoints } = calculateAction(evalResult);

    // 평가 저장
    await prisma.evaluation.create({
      data: {
        postId: post.id,
        informationScore: scores.info,
        relevanceScore: scores.relevance,
        insightScore: scores.insight,
        spamLikelihood: scores.spam,
        finalLabel: label,
        rewardPoints,
        slashPoints,
        llmModel: "test-model",
        llmRawJson: JSON.stringify(evalResult),
      },
    });

    // UserScore 업데이트
    await prisma.userScore.upsert({
      where: {
        userId_projectId: {
          userId: author.id,
          projectId: project.id,
        },
      },
      update: {
        totalReward: { increment: rewardPoints },
        totalSlash: { increment: slashPoints },
        netScore: { increment: rewardPoints - slashPoints },
      },
      create: {
        userId: author.id,
        projectId: project.id,
        totalReward: rewardPoints,
        totalSlash: slashPoints,
        netScore: rewardPoints - slashPoints,
      },
    });

    console.log(`포스트 ${i + 1}/10 생성 완료`);
  }

  console.log("✅ 테스트 데이터 생성 완료!");
  console.log(`- 프로젝트: 2개 (polymarket, kaito)`);
  console.log(`- 사용자: 5명`);
  console.log(`- 포스트: 10개`);
}

main()
  .catch((e) => {
    console.error("에러 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

