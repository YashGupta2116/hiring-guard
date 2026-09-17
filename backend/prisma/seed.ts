import { config as loadDotenv } from "dotenv";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

loadDotenv({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
  quiet: true,
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run the seed script.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

async function main(): Promise<void> {
  const passwordHash = await argon2.hash("demo-password-1234");

  const org = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: { name: "Demo Org", slug: "demo-org" },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.veritrust.local" },
    update: {},
    create: {
      name: "Demo Owner",
      email: "owner@demo.veritrust.local",
      passwordHash,
    },
  });
  const interviewer = await prisma.user.upsert({
    where: { email: "interviewer@demo.veritrust.local" },
    update: {},
    create: {
      name: "Demo Interviewer",
      email: "interviewer@demo.veritrust.local",
      passwordHash,
    },
  });

  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: owner.id } },
    update: {},
    create: { orgId: org.id, userId: owner.id, role: "OWNER" },
  });
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: interviewer.id } },
    update: {},
    create: { orgId: org.id, userId: interviewer.id, role: "INTERVIEWER" },
  });

  const tasks: {
    title: string;
    statement: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
  }[] = [
    {
      title: "Two Sum",
      statement:
        "Given an array of integers and a target, return indices of the two numbers that add up to target.",
      difficulty: "EASY",
    },
    {
      title: "LRU Cache",
      statement:
        "Design and implement a Least Recently Used (LRU) cache with O(1) get and put.",
      difficulty: "MEDIUM",
    },
    {
      title: "Merge K Sorted Lists",
      statement: "Merge k sorted linked lists into one sorted linked list.",
      difficulty: "HARD",
    },
  ];

  for (const task of tasks) {
    const existing = await prisma.codingTask.findFirst({
      where: { orgId: org.id, title: task.title },
    });
    if (existing) continue;
    await prisma.codingTask.create({
      data: {
        orgId: org.id,
        title: task.title,
        statement: task.statement,
        difficulty: task.difficulty,
        languages: ["javascript", "python"],
        starterCode: {
          javascript: "// your solution here",
          python: "# your solution here",
        },
        visibleTests: [
          { input: "example input", expectedOutput: "example output" },
        ],
        hiddenTests: [
          { input: "hidden input 1", expectedOutput: "hidden output 1" },
        ],
        timeLimitMs: 5000,
      },
    });
  }

  const topics = [
    "Algorithms",
    "System design",
    "Databases",
    "Backend development",
  ] as const;
  const difficulties = ["EASY", "MEDIUM", "HARD"] as const;

  const existingCount = await prisma.questionBankItem.count({
    where: { orgId: org.id },
  });
  const toCreate = Math.max(0, 20 - existingCount);
  for (let i = 0; i < toCreate; i++) {
    const topic = topics[i % topics.length]!;
    const difficulty = difficulties[i % difficulties.length]!;
    await prisma.questionBankItem.create({
      data: {
        orgId: org.id,
        text: `[${topic}] Demo question #${existingCount + i + 1} (${difficulty.toLowerCase()})`,
        topic,
        skills: [topic],
        difficulty,
      },
    });
  }

  console.log(
    `Seeded org "${org.name}" (${org.id}) with users, ${tasks.length} coding tasks and ${existingCount + toCreate} question bank items.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
