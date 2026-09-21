import redis from "../config/redis.js";

export const getCache = async (key) => {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
};

export const setCache = async (key, value, ttl = 60) => {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
};

export const invalidateCache = async (pattern) => {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
        await redis.del(keys);
    }
};
