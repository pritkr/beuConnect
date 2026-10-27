import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pyqs = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/pyqs" }),
  schema: z.object({
    metadata: z.object({
      university: z.string(),
      exam_title: z.string(),
      subject: z.string(),
      subject_slug: z.string(),
      subject_code: z.string(),
      year: z.number(),
      semester: z.number().optional(),
      time: z.string().optional(),
      full_marks: z.number().optional()
    }),
    instructions: z.array(z.string()).optional(),
    sections: z.array(z.object({
      section_title: z.string(),
      questions: z.array(z.object({
        id: z.string(),
        type: z.enum(["theory", "mcq", "numerical"]).optional(),
        text: z.string(),
        marks: z.number().nullable().optional(),
        options: z.array(z.string()).optional(),
        sub_questions: z.array(z.object({
          id: z.string(),
          text: z.string(),
          marks: z.number().nullable().optional(),
          options: z.array(z.string()).optional()
        })).optional()
      }))
    }))
  })
});

export const collections = { pyqs };
