import Redis from "ioredis";
import dotenv from "dotenv";
import logger from "./utils/logger";
dotenv.config();

export const redisConfig = {
  host: process.env.REDISHOST ?? "localhost",
  port: Number.parseInt(process.env.REDISPORT ?? "6379"),
  password: process.env.REDISPASSWORD,
};

// getting redis connection
logger.info("Redis Config", redisConfig.host, redisConfig.port);

const clientConnection = new Redis({
  ...redisConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

clientConnection.on("connect", () => {
  logger.info("Connected to redis");
});

clientConnection.on("error", (err) => {
  logger.info(`Error in Redis connection ${err}`);
});

clientConnection.on("end", () => {
  logger.info("Client disconnected from redis");
});

export default clientConnection;
