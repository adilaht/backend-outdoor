import transporter from "../config/mailer.js";

export const sendOTPEmail = async (to, kode_otp) => {
  const mailOptions = {
    from: `"Outdoor Rent" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Kode OTP Booking",
    html: `
      <h2>Verifikasi Booking</h2>
      <p>Kode OTP kamu:</p>
      <h1>${kode_otp}</h1>
      <p>Berlaku selama 5 menit</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};