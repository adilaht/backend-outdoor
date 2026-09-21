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
});

export default transporter;