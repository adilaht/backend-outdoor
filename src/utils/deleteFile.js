import fs from "fs";
import path from "path";

export const deleteFile = (filePath) => {
  const fullPath = path.join(process.cwd(), filePath);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};