import { z } from 'zod';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  googleClientId: string;
  media: { cloudName: string; apiKey: string; apiSecret: string };
}

export const CONFIG = Symbol('CONFIG');

const Env = z.object({
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL (Neon connection string) is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  GOOGLE_WEB_CLIENT_ID: z.string().min(1, 'GOOGLE_WEB_CLIENT_ID is required (same Web client ID the app uses)'),
  CLOUDINARY_URL: z.string().regex(/^cloudinary:\/\/[^:@\/]+:[^:@\/]+@[^:@\/]+$/, 'CLOUDINARY_URL must look like cloudinary://API_KEY:API_SECRET@CLOUD_NAME (copy it from the Cloudinary dashboard)'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${lines}`);
  }
  const e = parsed.data;
  const cloud = new URL(e.CLOUDINARY_URL);
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    googleClientId: e.GOOGLE_WEB_CLIENT_ID,
    media: { cloudName: cloud.hostname, apiKey: decodeURIComponent(cloud.username), apiSecret: decodeURIComponent(cloud.password) },
  };
}
