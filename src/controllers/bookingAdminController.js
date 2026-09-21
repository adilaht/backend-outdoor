import prisma from "../config/prisma.js";

// GET ALL BOOKINGS
export const getBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, q, sortBy = "created_at", order = "desc" } = req.query;

    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = {};

    // Filter status jika ada
    if (status) {
      where.status = status;
    }

    // Pencarian nama, email, atau kode booking
    if (q) {
      where.OR = [
        { kode_booking: { contains: q } },
        { nama_customer: { contains: q } },
        { email: { contains: q } },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: order },
        include: {
          _count: {
            select: { details: true }
          }
        }
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
      data: bookings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET SINGLE BOOKING DETAIL
export const getBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id_booking: Number(id) },
      include: {
        details: {
          include: {
            product: {
              include: {
                images: true
              }
            }
          }
        },
        payments: true
      }
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking tidak ditemukan" });
    }

    res.json({ data: booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE BOOKING STATUS
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, nominal_denda, catatan_denda } = req.body;

    const validStatuses = ["pending_payment", "paid", "ongoing", "completed", "expired", "canceled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Status sewa tidak valid" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id_booking: Number(id) },
      include: { details: true }
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking tidak ditemukan" });
    }

    const oldStatus = booking.status;

    // Jika status tidak berubah, langsung return
    if (oldStatus === status) {
      return res.json({ message: "Status booking diperbarui (no change)", data: booking });
    }

    const updatedBooking = await prisma.$transaction(async (tx) => {
      // Siapkan data update
      const updateData = { status };

      // Jika status completed → isi tanggal_kembali + data denda
      if (status === "completed") {
        updateData.tanggal_kembali = new Date();
        updateData.nominal_denda = nominal_denda ? Number(nominal_denda) : 0;
        updateData.catatan_denda = catatan_denda || null;
      }

      // Update status booking
      const updated = await tx.booking.update({
        where: { id_booking: Number(id) },
        data: updateData
      });

      // LOGIKA PENGEMBALIAN STOK
      const wasActive = ["pending_payment", "paid", "ongoing"].includes(oldStatus);
      const isInactiveNow = ["canceled", "expired"].includes(status);

      // Catat log stok IN untuk pembatalan/expired (pelepasan stok langsung)
      if (wasActive && isInactiveNow) {
        const logKeterangan = `Pembatalan/expired untuk Booking ${booking.kode_booking}`;

        for (const item of booking.details) {
          await tx.stockLog.create({
            data: {
              id_product: item.id_product,
              perubahan: "IN",
              jumlah: item.jumlah,
              keterangan: logKeterangan
            }
          });
        }
      }

      // Catat log stok IN untuk completed (pelepasan stok H+1 via tanggal_kembali)
      if (wasActive && status === "completed") {
        for (const item of booking.details) {
          await tx.stockLog.create({
            data: {
              id_product: item.id_product,
              perubahan: "IN",
              jumlah: item.jumlah,
              keterangan: `Pengembalian barang untuk Booking ${booking.kode_booking} (stok tersedia H+1)`
            }
          });
        }
      }

      // LOGIKA KELUAR STOK LAGI (Jika booking yang tadinya dibatalkan/selesai diaktifkan kembali)
      const wasInactive = ["completed", "canceled", "expired"].includes(oldStatus);
      const isActiveNow = ["pending_payment", "paid", "ongoing"].includes(status);

      if (wasInactive && isActiveNow) {
        for (const item of booking.details) {
          await tx.stockLog.create({
            data: {
              id_product: item.id_product,
              perubahan: "OUT",
              jumlah: item.jumlah,
              keterangan: `Re-aktivasi booking ke status ${status} untuk ${booking.kode_booking}`
            }
          });
        }
      }

      return updated;
    });

    res.json({
      message: `Status booking berhasil diubah dari ${oldStatus} menjadi ${status}`,
      data: updatedBooking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
