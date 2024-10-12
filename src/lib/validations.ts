import { z } from "zod";
import { DEFAULT_PET_IMAGE } from "./constants";

export const petFormSchema = z
  .object({
    name: z.string().trim().min(1, { message: "Name is required" }).max(100),
    ownerName: z
      .string()
      .trim()
      .min(1, { message: "Owner name is required" })
      .max(100),
    imageUrl: z.union([
      z.literal(""),
      z.string().trim().url({ message: "Invalid image url" }),
    ]),
    age: z.coerce
      .number()
      .int()
      .positive()
      .max(100, { message: "Invalid age" }),
    notes: z.union([z.literal(""), z.string().trim().max(1000)]),
  })
  .transform(data => ({
    ...data,
    imageUrl: data.imageUrl || DEFAULT_PET_IMAGE,
  }));

export const petIdSchema = z.string().cuid();
