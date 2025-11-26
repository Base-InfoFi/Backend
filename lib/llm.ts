import OpenAI from "openai";

export const flockClient = new OpenAI({
  baseURL: process.env.FLOCK_BASE_URL || "https://api.flock.io/v1",
  apiKey: process.env.FLOCK_API_KEY,
});

