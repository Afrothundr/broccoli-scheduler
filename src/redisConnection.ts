import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

export const redisConfig = {
  host: process.env.REDISHOST ?? "localhost",
  port: parseInt(process.env.REDISPORT ?? "6379"),
  password: process.env.REDISPASSWORD,
};

// getting redis connection
console.log("Redis Config", redisConfig.host, redisConfig.port);

const clientConnection = new Redis({
  ...redisConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

clientConnection.on("connect", () => {
  console.log(`Connected to redis`);
});

clientConnection.on("error", (err) => {
  console.log(`Error in Redis connection ${err}`);
});

clientConnection.on("end", () => {
  console.log("Client disconnected from redis");
});

export default clientConnection;
