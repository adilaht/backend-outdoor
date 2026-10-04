import * as otpModel from "../models/otpModel.js";

export const sendOTP = async (req, res) => {
  try {
    const { kontak } = req.body;
    const kode = Math.floor(100000 + Math.random() * 900000).toString();

    await otpModel.createOTP(kontak, kode);

    res.json({ message: "OTP dikirim" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { kontak, kode } = req.body;

    const valid = await otpModel.verifyOTP(kontak, kode);

    if (!valid) {
      return res.status(400).json({ message: "OTP salah / expired" });
    }

    res.json({ message: "OTP valid" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};