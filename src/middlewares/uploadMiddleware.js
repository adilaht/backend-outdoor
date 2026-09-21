import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto"; // 🔐 Pustaka bawaan untuk hash acak

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const sessionId = req.session_id || "guest";
        const uploadPath = `./storage/private/bookings/${sessionId}`;

        // 1. Jika folder ada, bersihkan filenya terlebih dahulu
        if (fs.existsSync(uploadPath)) {
            try {
                const files = fs.readdirSync(uploadPath);
                for (const existingFile of files) {
                    if (existingFile.startsWith("identitas_")) {
                        const filePathToDelete = path.join(uploadPath, existingFile);
                        fs.unlinkSync(filePathToDelete);
                        console.log(`🗑️ Berhasil menghapus foto identitas usang: ${existingFile}`);
                    }
                }
            } catch (err) {
                console.error("Gagal membersihkan file identitas lama:", err);
            }
        }

        // 🌟 KUNCI AMAN: Keluarkan dari blok else! 
        // Pastikan baris ini selalu dieksekusi di akhir untuk menjamin folder 100% siap ditulisi oleh Multer
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const fileExt = path.extname(file.originalname).toLowerCase();

        // 🎲 Generate hash acak sepanjang 16 karakter hex
        const randomHash = crypto.randomBytes(8).toString("hex");

        // Format penamaan: identitas_[hash_acak].jpg
        const secureFilename = `identitas_${randomHash}${fileExt}`;

        cb(null, secureFilename);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype);

    if (extName && mimeType) {
        return cb(null, true);
    } else {
        cb(new Error("Format berkas wajib JPG, JPEG, atau PNG!"));
    }
};

export const uploadIdentitas = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // Batasi ketat maksimal 2MB
});