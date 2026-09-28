import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Docs live at src/content/docs/<locale>/<slug>.mdx → id "<locale>/<slug>".
const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Sidebar ordering within the guide. */
    order: z.number().default(999),
    /** Roadmap phase this topic belongs to (drives the phase-runnable script mapping). */
    phase: z.number().optional(),
  }),
});

export const collections = { docs };
