import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
// Create ladders only
const ladder1 = await prisma.ladder.upsert({
  where: { number: 1 },
  update: {},
  create: { 
    name: "Ladder 1", 
    number: 1, 
    endDate: new Date("2025-10-01T00:00:00.000Z"),
    isActive: true 
  },
});

const ladder2 = await prisma.ladder.upsert({
  where: { number: 2 },
  update: {},
  create: { 
    name: "Ladder 2", 
    number: 2, 
    endDate: new Date("2025-10-01T00:00:00.000Z"),
    isActive: true 
  },
});

const ladder3 = await prisma.ladder.upsert({
  where: { number: 3 },
  update: {},
  create: { 
    name: "Ladder 3", 
    number: 3, 
    endDate: new Date("2025-10-01T00:00:00.000Z"),
    isActive: true 
  },
});

console.log("Created ladder system with 3 empty ladders ready for users to join!");
}

main().finally(() => prisma.$disconnect());