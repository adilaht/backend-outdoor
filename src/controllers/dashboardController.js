import prisma from "../config/prisma.js";

export const getDashboardStats = async (req, res) => {
  try {
    const { period } = req.query; // '1', '7', '30', or undefined (all time)
    
    let dateFilter = {};
    const now = new Date();
    
    if (period && period !== 'all') {
      const days = parseInt(period, 10);
      if (!isNaN(days)) {
        const thresholdDate = new Date(now);
        thresholdDate.setDate(thresholdDate.getDate() - days);
        dateFilter = { created_at: { gte: thresholdDate } };
      }
    }

    // 1. Hitung total pendapatan (status: paid, ongoing, completed)
    const revenueAggregation = await prisma.booking.aggregate({
      where: {
        status: { in: ["paid", "ongoing", "completed"] },
        ...dateFilter
      },
      _sum: {
        total_harga: true
      }
    });

    const totalRevenue = revenueAggregation._sum.total_harga || 0;

    // 2. Hitung jumlah booking aktif (ongoing) (nggak perlu filter created_at krn ini status current)
    const activeRentalsCount = await prisma.booking.count({
      where: { status: "ongoing" }
    });

    // 3. Hitung jumlah booking menunggu pembayaran (pending_payment)
    const pendingPaymentsCount = await prisma.booking.count({
      where: { status: "pending_payment" }
    });

    // 4. Hitung total seluruh booking
    const totalBookingsCount = await prisma.booking.count({
      where: dateFilter
    });

    // 5. Produk stok menipis (stok_total < 3)
    const lowStockProducts = await prisma.product.findMany({
      where: {
        stok_total: { lt: 3 },
        is_active: true
      },
      select: {
        id_product: true,
        nama: true,
        stok_total: true,
        harga_per_hari: true
      }
    });

    // 6. Transaksi terbaru (5 booking terakhir)
    const recentBookings = await prisma.booking.findMany({
      take: 5,
      orderBy: { created_at: "desc" },
      where: dateFilter,
      select: {
        id_booking: true,
        kode_booking: true,
        nama_customer: true,
        tanggal_mulai: true,
        tanggal_selesai: true,
        total_harga: true,
        status: true,
        created_at: true
      }
    });

    // 7. Data Grafik (Chart Data) - Ambil booking sesuai periode dan group per hari
    // Karena SQLite/MySQL function berbeda-beda, kita ambil raw data dan group di JS (aman untuk skala kecil-menengah)
    let chartData = [];
    if (period && period !== 'all') {
      const days = parseInt(period, 10);
      const bookingsForChart = await prisma.booking.findMany({
        where: {
          ...dateFilter,
          status: { in: ["paid", "ongoing", "completed"] }
        },
        select: {
          created_at: true,
          total_harga: true
        }
      });

      // Bikin map kosong per tanggal
      const chartMap = new Map();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        chartMap.set(dateStr, { date: dateStr, revenue: 0, count: 0 });
      }

      bookingsForChart.forEach(b => {
        const dateStr = new Date(b.created_at).toISOString().split('T')[0];
        if (chartMap.has(dateStr)) {
          const existing = chartMap.get(dateStr);
          existing.revenue += b.total_harga;
          existing.count += 1;
        }
      });

      chartData = Array.from(chartMap.values()).map(d => ({
        ...d,
        // format tanggal DD MMM
        dateFormatted: new Date(d.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
      }));
    }

    // 8. Kalender Sewa (Booking aktif & mendatang)
    const calendarBookings = await prisma.booking.findMany({
      where: {
        status: { in: ["paid", "ongoing"] }
      },
      select: {
        id_booking: true,
        kode_booking: true,
        nama_customer: true,
        tanggal_mulai: true,
        tanggal_selesai: true,
        status: true
      }
    });

    res.json({
      data: {
        stats: {
          total_revenue: totalRevenue,
          active_rentals: activeRentalsCount,
          pending_payments: pendingPaymentsCount,
          total_bookings: totalBookingsCount
        },
        low_stock_products: lowStockProducts,
        recent_bookings: recentBookings,
        chart_data: chartData,
        calendar_bookings: calendarBookings
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
