import { z } from 'zod';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  googleClientId: string;
  media: { bucket: string; endpoint: string; accessKeyId: string; secretAccessKey: string; region: string };
}

export const CONFIG = Symbol('CONFIG');

const Env = z.object({
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL (Neon connection string) is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GOOGLE_WEB_CLIENT_ID: z.string().min(1, 'GOOGLE_WEB_CLIENT_ID is required (same Web client ID the app uses)'),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_REGION: z.string().default('auto'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${lines}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    googleClientId: e.GOOGLE_WEB_CLIENT_ID,
    media: { bucket: e.R2_BUCKET, endpoint: e.R2_ENDPOINT, accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY, region: e.R2_REGION },
  };
}
