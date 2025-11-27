import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function setupProjectContext() {
  const projectSlug = process.argv[2];
  const contextInput = process.argv[3]; // 파일 경로 또는 직접 텍스트

  if (!projectSlug || !contextInput) {
    console.error("사용법:");
    console.error("  방법 1: 파일에서 읽기");
    console.error("    npx tsx scripts/setup-project-context.ts <projectSlug> <file-path>");
    console.error("    예시: npx tsx scripts/setup-project-context.ts flock scripts/project-contexts/flock.md");
    console.error("");
    console.error("  방법 2: 직접 텍스트 입력");
    console.error("    npx tsx scripts/setup-project-context.ts <projectSlug> \"<contextSummary>\"");
    process.exit(1);
  }

  let contextSummary: string;

  // 파일 경로인지 확인 (파일이 존재하면 파일에서 읽기)
  const filePath = path.isAbsolute(contextInput)
    ? contextInput
    : path.join(process.cwd(), contextInput);

  if (fs.existsSync(filePath)) {
    console.log(`파일에서 컨텍스트 읽기: ${filePath}`);
    contextSummary = fs.readFileSync(filePath, "utf-8");
    // 마크다운 헤더 제거 (선택사항)
    contextSummary = contextSummary.replace(/^#+\s+.*$/gm, "").trim();
  } else {
    contextSummary = contextInput;
  }

  console.log(`프로젝트 컨텍스트 설정: ${projectSlug}`);
  console.log(`컨텍스트 길이: ${contextSummary.length}자`);

  const project = await prisma.project.upsert({
    where: { slug: projectSlug },
    update: {
      contextSummary: contextSummary,
    },
    create: {
      slug: projectSlug,
      name: projectSlug.charAt(0).toUpperCase() + projectSlug.slice(1),
      description: `Project ${projectSlug}`,
      contextSummary: contextSummary,
    },
  });

  console.log(`✅ 완료!`);
  console.log(`프로젝트: ${project.name}`);
  console.log(`컨텍스트 길이: ${project.contextSummary?.length || 0}자`);
}

setupProjectContext()
  .catch((e) => {
    console.error("에러 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

