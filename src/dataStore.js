import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";

const dataDir = path.resolve("data");
const s3Client = new S3Client({});

const toJson = (value) => JSON.stringify(value, null, 2);

const getStorageKey = (name) => `${config.s3Prefix.replace(/\/+$/, "")}/${name}.json`;

const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const ensureLocalDataDir = async () => {
  await fs.mkdir(dataDir, { recursive: true });
};

const readLocal = async (name, fallback) => {
  try {
    const fullPath = path.join(dataDir, `${name}.json`);
    const raw = await fs.readFile(fullPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeLocal = async (name, value) => {
  await ensureLocalDataDir();
  const fullPath = path.join(dataDir, `${name}.json`);
  await fs.writeFile(fullPath, toJson(value), "utf8");
};

const readS3 = async (name, fallback) => {
  if (!config.s3Bucket) {
    throw new Error("S3_BUCKET is required when STORAGE_BACKEND=s3");
  }
  try {
    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: getStorageKey(name),
    });
    const output = await s3Client.send(command);
    const raw = await streamToString(output.Body);
    return JSON.parse(raw);
  } catch (error) {
    if (error?.name === "NoSuchKey") return fallback;
    if (error?.$metadata?.httpStatusCode === 404) return fallback;
    throw error;
  }
};

const writeS3 = async (name, value) => {
  if (!config.s3Bucket) {
    throw new Error("S3_BUCKET is required when STORAGE_BACKEND=s3");
  }
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: getStorageKey(name),
    ContentType: "application/json",
    Body: toJson(value),
  });
  await s3Client.send(command);
};

export const readStore = async (name, fallback) => {
  if (config.storageBackend === "s3") {
    return readS3(name, fallback);
  }
  return readLocal(name, fallback);
};

export const writeStore = async (name, value) => {
  if (config.storageBackend === "s3") {
    return writeS3(name, value);
  }
  return writeLocal(name, value);
};
