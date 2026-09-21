import prisma from "../config/prisma.js";

export const createOTP = async (kontak, kode) => {
  return prisma.otpVerification.create({
    data: {
      kontak,
      kode_otp: kode,
      expired_at: new Date(Date.now() + 5 * 60 * 1000), // 5 menit
    },
  });
};

export const verifyOTP = async (kontak, kode) => {
  const otp = await prisma.otpVerification.findFirst({
    where: {
      kontak,
      kode_otp: kode,
      is_verified: false,
    },
    orderBy: { created_at: "desc" },
  });

  if (!otp) return false;

  if (new Date() > otp.expired_at) return false;

  await prisma.otpVerification.update({
    where: { id_otp: otp.id_otp },
    data: { is_verified: true },
  });

  return true;
};