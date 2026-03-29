import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { v7 as uuidv7 } from 'uuid';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedAdminAccount() {
  const username = 'admin@mail.com';
  const password = 'admin12345';

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { username },
      data: {
        name: 'Admin',
        role: Role.ADMIN,
        isActive: true,
        passwordHash,
        deletedAt: null,
        deletedById: null,
        deleteReason: null,
        updatedById: existing.id,
        updatedAt: new Date(),
      },
    });

    console.log('Admin account updated:', username);
    return;
  }

  const newId = uuidv7();

  await prisma.user.create({
    data: {
      id: newId,
      name: 'Admin',
      username,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      createdById: newId,
    },
  });

  console.log('Admin account created:', username);
}

async function main() {
  await seedAdminAccount();
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
