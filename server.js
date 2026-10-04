import app from "./src/app.js";
import { startCronJobs } from "./src/services/cronService.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  
  // Aktifkan Background Jobs
  startCronJobs();
});