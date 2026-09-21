import prisma from "../config/prisma.js";
import { updateStock } from "./productModel.js";

export const createBooking = async (data, cart) => {
  const booking = await prisma.booking.create({
    data: {
      kode_booking: "BOOK-" + Date.now(),
      nama_customer: data.nama_customer,
      no_hp: data.no_hp,
      email: data.email,
      tanggal_mulai: new Date(data.tanggal_mulai),
      tanggal_selesai: new Date(data.tanggal_selesai),
      details: {
        create: cart.items.map((item) => ({
          id_product: item.id_product,
          jumlah: item.jumlah,
        })),
      },
    },
    include: { details: true },
  });

  // Kurangi stok
  for (const item of cart.items) {
    await updateStock(item.id_product, item.jumlah, "OUT");
  }

  return booking;
};