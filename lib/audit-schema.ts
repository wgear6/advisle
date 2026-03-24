import { z } from "zod";

const REQUIREMENT_CATEGORIES = [
  "Major Core",
  "Major Elective",
  "General Education",
  "Free Elective",
  "Other",
] as const;

export const RemainingCourseSchema = z.object({
  subject: z.string().min(1),
  number: z.string().min(1),
  title: z.string(),
  credits: z.number().int().min(1).max(6),
  requirement_category: z.enum(REQUIREMENT_CATEGORIES),
});

export const InProgressCourseSchema = z.object({
  subject: z.string().min(1),
  number: z.string().min(1),
  title: z.string(),
  credits: z.number(),
});

export const CompletedCourseSchema = z.object({
  subject: z.string().min(1),
  number: z.string().min(1),
  title: z.string(),
  credits: z.number().optional(),
});

export const ParsedAuditSchema = z.object({
  remaining_courses: z.array(RemainingCourseSchema),
  in_progress_courses: z.array(InProgressCourseSchema),
  completed_courses: z.array(CompletedCourseSchema),
  student_name: z.string().nullable(),
  major: z.string().nullable(),
  credits_completed: z.number().nullable(),
  credits_remaining: z.number().nullable(),
});

export type ParsedAudit = z.infer<typeof ParsedAuditSchema>;
