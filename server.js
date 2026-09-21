import app from "./src/app.js";
import { startCronJobs } from "./src/services/cronService.js";

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  
  // Aktifkan Background Jobs
  startCronJobs();
});