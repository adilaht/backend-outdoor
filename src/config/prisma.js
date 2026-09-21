import { PrismaClient } from "@prisma/client";

const logConfig = [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" }
];

if (process.env.NODE_ENV !== "production" && process.env.PERF_TEST !== "true") {
    logConfig.push({ emit: "event", level: "query" });
    logConfig.push({ emit: "event", level: "info" });
}

const prisma = new PrismaClient({
    log: logConfig,
});

prisma.$on("query", (e) => {
    // Hanya log jika query lambat (> 50ms) atau bukan saat performance test
    // Console log adalah operasi sinkronus/blocking yang menurunkan throughput secara drastis saat load test
    if (e.duration > 50) {
        console.log("\n📌 SLOW QUERY:");
        console.log(e.query);
        console.log("PARAMS:", e.params);
        console.log("DURATION:", e.duration, "ms");
    }
});

prisma.$on("error", (e) => {
    console.error("❌ PRISMA ERROR:", e);
});

prisma.$on("warn", (e) => {
    console.warn("⚠️ PRISMA WARN:", e);
});

prisma.$on("info", (e) => {
    if (process.env.PERF_TEST !== "true") {
        console.info("ℹ️ PRISMA INFO:", e);
    }
});

export default prisma;