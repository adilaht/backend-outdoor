import transporter from "../config/mailer.js";

// Format tanggal ke bahasa Indonesia
const formatDate = (dateStr) => {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full'
  }).format(new Date(dateStr));
};

// Format mata uang rupiah
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

/**
 * Kirim email pemberitahuan Menunggu Pembayaran (15 menit)
 */
export const sendPendingPaymentEmail = async (bookingData) => {
  try {
    const { email, nama_customer, kode_booking, total_harga, tanggal_mulai, tanggal_selesai } = bookingData;
    
    // Kita buat daftar item jika details tersedia
    let itemsHtml = '';
    if (bookingData.details && bookingData.details.length > 0) {
      itemsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr style="background-color: #f3f4f6; text-align: left;">
            <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Item</th>
            <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Qty</th>
            <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Harga</th>
          </tr>
          ${bookingData.details.map(item => `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.product?.nama || 'Produk Sewa'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.jumlah}x</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${formatCurrency(item.harga_sewa || item.harga_saat_booking || 0)}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    const mailOptions = {
      from: `"TwentyOne Outdoor" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Segera Lakukan Pembayaran - Pesanan ${kode_booking}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #f97316; padding: 20px; text-align: center; color: white;">
            <h2 style="margin: 0;">MENUNGGU PEMBAYARAN</h2>
          </div>
          <div style="padding: 20px;">
            <p>Halo <strong>${nama_customer}</strong>,</p>
            <p>Terima kasih telah melakukan pemesanan di TwentyOne Outdoor. Pesanan Anda berhasil dibuat dan sedang menunggu pembayaran.</p>
            
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
              <h4 style="margin: 0 0 10px 0; color: #b91c1c;">⚠️ PERHATIAN PENTING</h4>
              <p style="margin: 0; color: #991b1b; font-size: 14px;">Batas waktu pembayaran Anda adalah <strong>15 MENIT</strong> dari sekarang. Jika melewati batas waktu tersebut, pesanan Anda akan dibatalkan otomatis oleh sistem.</p>
            </div>

            <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px;">
              <h3 style="margin-top: 0;">Detail Pesanan:</h3>
              <p style="margin: 5px 0;"><strong>Kode Booking:</strong> <span style="color: #f97316; font-weight: bold;">${kode_booking}</span></p>
              <p style="margin: 5px 0;"><strong>Periode Sewa:</strong> ${formatDate(tanggal_mulai)} - ${formatDate(tanggal_selesai)}</p>
              <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> <strong style="font-size: 16px;">${formatCurrency(total_harga)}</strong></p>
              ${itemsHtml}
            </div>
            
            <p style="margin-top: 20px;">Silakan selesaikan pembayaran pada halaman pembayaran yang telah disediakan.</p>
          </div>
          <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
            <p>Email ini dikirim secara otomatis. Mohon tidak membalas email ini.</p>
            <p>&copy; ${new Date().getFullYear()} TwentyOne Outdoor Rent. All rights reserved.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email Service] Berhasil mengirim email Pending Payment ke ${email}`);
  } catch (error) {
    console.error(`[Email Service] Gagal mengirim email Pending Payment: ${error.message}`);
    // Sengaja tidak throw error agar tidak mengganggu flow utama checkout
  }
};

/**
 * Kirim email pemberitahuan Pembayaran Berhasil (Status Paid)
 */
export const sendPaymentSuccessEmail = async (bookingData) => {
  try {
    const { email, nama_customer, kode_booking, total_harga, tanggal_mulai, tanggal_selesai } = bookingData;
    
    // Kita buat daftar item jika details tersedia
    let itemsHtml = '';
    if (bookingData.details && bookingData.details.length > 0) {
      itemsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr style="background-color: #f3f4f6; text-align: left;">
            <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Item</th>
            <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Qty</th>
            <th style="padding: 10px; border-bottom: 2px solid #e5e7eb;">Harga</th>
          </tr>
          ${bookingData.details.map(item => `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.product?.nama || 'Produk Sewa'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${item.jumlah}x</td>
              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${formatCurrency(item.harga_sewa || item.harga_saat_booking || 0)}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    const mailOptions = {
      from: `"TwentyOne Outdoor" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Pembayaran Berhasil - Bukti Transaksi ${kode_booking}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #10b981; padding: 20px; text-align: center; color: white;">
            <h2 style="margin: 0;">PEMBAYARAN BERHASIL LUNAS</h2>
          </div>
          <div style="padding: 20px;">
            <p>Halo <strong>${nama_customer}</strong>,</p>
            <p>Pembayaran Anda untuk pesanan <strong>${kode_booking}</strong> telah berhasil kami terima. Transaksi Anda kini berstatus <strong>LUNAS</strong> dan stok alat telah dipastikan aman untuk Anda.</p>
            
            <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
              <h4 style="margin: 0 0 10px 0; color: #047857;">Tunjukkan Kode Booking Ini Saat Pengambilan</h4>
              <div style="background-color: white; padding: 15px; text-align: center; border: 2px dashed #10b981; border-radius: 8px;">
                <span style="font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #047857;">${kode_booking}</span>
              </div>
              <p style="margin: 10px 0 0 0; color: #065f46; font-size: 13px;">Tunjukkan kode atau email ini kepada staf kami di toko saat hari H keberangkatan Anda.</p>
            </div>

            <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px;">
              <h3 style="margin-top: 0;">Bukti Transaksi Resmi:</h3>
              <p style="margin: 5px 0;"><strong>Periode Sewa:</strong> ${formatDate(tanggal_mulai)} - ${formatDate(tanggal_selesai)}</p>
              <p style="margin: 5px 0;"><strong>Status Pembayaran:</strong> <span style="color: #10b981; font-weight: bold;">LUNAS (PAID)</span></p>
              <p style="margin: 5px 0;"><strong>Total Pembayaran:</strong> <strong style="font-size: 16px;">${formatCurrency(total_harga)}</strong></p>
              ${itemsHtml}
            </div>
            
            <p style="margin-top: 20px;">Terima kasih telah mempercayakan kebutuhan camping Anda kepada TwentyOne Outdoor. Selamat berpetualang!</p>
          </div>
          <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
            <p>Email ini dikirim secara otomatis. Mohon tidak membalas email ini.</p>
            <p>&copy; ${new Date().getFullYear()} TwentyOne Outdoor Rent. All rights reserved.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email Service] Berhasil mengirim email Payment Success ke ${email}`);
  } catch (error) {
    console.error(`[Email Service] Gagal mengirim email Payment Success: ${error.message}`);
    // Sengaja tidak throw error agar tidak mengganggu flow utama webhook
  }
};
