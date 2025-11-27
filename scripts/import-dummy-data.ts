import { PrismaClient } from "@prisma/client";
import { evaluatePostWithFlock } from "../lib/evaluatePost";
import { calculateAction } from "../lib/scoring";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// JSON 파일의 예상 형식 (친구가 제공하는 형식에 맞게 수정 필요)
type DummyDataItem = {
  projectSlug: string;
  author: {
    wallet?: string;
    handle?: string;
  };
  source?: string;
  sourceId?: string;
  url?: string;
  content: string;
  postedAt?: string;
};

async function importDummyData(jsonFilePath: string) {
  console.log(`JSON 파일 읽기: ${jsonFilePath}`);

  // JSON 파일 읽기
  const fileContent = fs.readFileSync(jsonFilePath, "utf-8");
  const data: DummyDataItem[] = JSON.parse(fileContent);

  console.log(`총 ${data.length}개의 데이터를 처리합니다.`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    try {
      console.log(`\n[${i + 1}/${data.length}] 처리 중...`);

      // 1. 프로젝트 조회 또는 생성
      let project = await prisma.project.findUnique({
        where: { slug: item.projectSlug },
      });

      if (!project) {
        console.error(`  ❌ 프로젝트를 찾을 수 없습니다: ${item.projectSlug}`);
        console.error(`  먼저 프로젝트 컨텍스트를 설정해주세요:`);
        console.error(`  npx tsx scripts/setup-project-context.ts ${item.projectSlug} "<contextSummary>"`);
        errorCount++;
        continue;
      }

      // 2. 유저 upsert
      let user;
      if (item.author?.wallet) {
        user = await prisma.user.findFirst({
          where: { wallet: item.author.wallet },
        });
        if (user) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              handle: item.author?.handle ?? undefined,
            },
          });
        } else {
          user = await prisma.user.create({
            data: {
              wallet: item.author.wallet,
              handle: item.author?.handle ?? undefined,
              displayName: item.author?.handle ?? undefined,
            },
          });
        }
      } else if (item.author?.handle) {
        user = await prisma.user.findFirst({
          where: { handle: item.author.handle },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              handle: item.author.handle,
              displayName: item.author.handle,
            },
          });
        }
      } else {
        console.error(`  ❌ author.wallet 또는 author.handle이 필요합니다`);
        errorCount++;
        continue;
      }

      // 3. Post 생성
      const post = await prisma.post.create({
        data: {
          projectId: project.id,
          authorId: user.id,
          source: item.source ?? "x",
          sourceId: item.sourceId,
          url: item.url,
          rawContent: item.content,
          postedAt: item.postedAt ? new Date(item.postedAt) : undefined,
        },
      });

      console.log(`  ✓ Post 생성: ${post.id}`);

      // 4. Flock API 호출 (검증)
      console.log(`  🔄 Flock API 호출 중...`);
      const evalResult = await evaluatePostWithFlock({
        projectName: project.name,
        projectContext: project.contextSummary ?? "",
        content: item.content,
      });

      console.log(`  ✓ 평가 완료: ${evalResult.final_label} (info: ${evalResult.information_score}, relevance: ${evalResult.relevance_score}, insight: ${evalResult.insight_score})`);

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
      await prisma.userScore.upsert({
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

      successCount++;
      console.log(`  ✅ 완료! (리워드: ${rewardPoints}, 슬래시: ${slashPoints})`);

      // API 호출 제한을 고려한 딜레이 (필요시)
      if (i < data.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
      }
    } catch (error) {
      console.error(`  ❌ 에러 발생:`, error instanceof Error ? error.message : String(error));
      errorCount++;
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`성공: ${successCount}개`);
  console.log(`실패: ${errorCount}개`);
}

// 실행
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error("사용법: npx tsx scripts/import-dummy-data.ts <json-file-path>");
  console.error("예시: npx tsx scripts/import-dummy-data.ts ../dummy-data.json");
  process.exit(1);
}

const fullPath = path.isAbsolute(jsonFilePath)
  ? jsonFilePath
  : path.join(process.cwd(), jsonFilePath);

if (!fs.existsSync(fullPath)) {
  console.error(`파일을 찾을 수 없습니다: ${fullPath}`);
  process.exit(1);
}

importDummyData(fullPath)
  .catch((e) => {
    console.error("에러 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



