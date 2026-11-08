import "dotenv/config";
import prisma from "../lib/prisma";
import { hashPassword } from "../lib/password";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, password: true } });
  let migrated = 0;
  for (const user of users) {
    if (user.password.startsWith("scrypt$")) continue;
    const result = await prisma.user.updateMany({
      where: { id: user.id, password: user.password },
      data: { password: await hashPassword(user.password) },
    });
    migrated += result.count;
  }
  const remaining = await prisma.user.count({ where: { NOT: { password: { startsWith: "scrypt$" } } } });
  if (remaining !== 0) throw new Error(`${remaining} account(s) still have an unhashed password.`);
  console.log(`Password migration complete: ${migrated} account(s) hashed; 0 unhashed accounts remain.`);
}

main().finally(async () => prisma.$disconnect());
