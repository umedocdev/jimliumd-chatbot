import OpenAI from "openai";
import { config, requireOpenAI } from "./config.js";

let client;

export const getOpenAI = () => {
  if (!client) {
    requireOpenAI();
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
};
