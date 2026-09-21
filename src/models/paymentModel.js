import prisma from "../config/prisma.js";

export const createPayment = async (booking, metode) => {
  return prisma.payment.create({
    data: {
      id_booking: booking.id_booking,
      metode,
      jumlah_bayar: booking.total_harga,
      status: "pending",
      reference_id: "PAY-" + Date.now(),
    },
  });
};

export const updatePaymentStatus = async (reference_id, status) => {
  const payment = await prisma.payment.update({
    where: { reference_id },
    data: {
      status,
      payment_time: new Date(),
    },
    include: { booking: true },
  });

  let bookingStatus;
  if (status === "settlement") {
    bookingStatus = "paid";
  } else if (["expire", "cancel", "deny"].includes(status)) {
    bookingStatus = "canceled";
  }

  if (bookingStatus) {
    await prisma.booking.update({
      where: { id_booking: payment.id_booking },
      data: { status: bookingStatus },
    });
  }

  return payment;
};