import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Mulai proses seeding data admin...');

  const email = 'admin@twentyone.com';
  const passwordPlain = 'twentyone123';

  // --- Cek Admin ---
  const existingAdmin = await prisma.admin.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log('✅ Admin dengan email tersebut sudah ada di database.');
    return;
  }

  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  // --- Create Admin ---
  await prisma.admin.create({
    data: {
      email,
      password: hashedPassword,
      nama: 'Super Admin',
    },
  });

  console.log('🎉 Akun Admin berhasil dibuat!');
  console.log('---------------------------------');
  console.log(`Email    : ${email}`);
  console.log(`Password : ${passwordPlain}`);
  console.log('---------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Gagal melakukan seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });