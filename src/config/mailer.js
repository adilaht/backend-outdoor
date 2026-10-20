import nodemailer from "nodemailer";
import dns from "dns";

// 🔥 paksa IPv4 biar ga kena ENETUNREACH lagi
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // penting
  family: 4, // 🔥 paksa IPv4
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 8000, // 8 detik batas koneksi ke SMTP Google (mencegah gantung 2 menit)
  greetingTimeout: 5000,
  socketTimeout: 10000,
});

export default transporter;