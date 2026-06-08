import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create AI Bot
  const aiBot = await prisma.user.upsert({
    where: { username: 'Authoritative_AI_Bot' },
    update: {},
    create: {
      id: 'ai-bot',
      username: 'Authoritative_AI_Bot',
      email: 'ai@pool-game.local',
      password: await bcrypt.hash('ai-password-never-used', 10),
      balance: 99999.0,
      walletAddress: 'TAI_BOT_WALLET_ADDRESS_TRON_NETWORK',
    },
  });

  console.log('✅ AI Bot created:', aiBot.username);

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });