import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Validate untrusted input with zod; failures become a 400 with the issue list. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new BadRequestException({ message: 'Invalid request', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  return r.data;
}

export const uuid = z.uuid();
