import { z } from "zod";

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, "validation.required").max(50),
  lastName: z.string().trim().min(1, "validation.required").max(50),
  businessName: z.string().trim().min(1, "validation.required").max(100),
  storeName: z.string().trim().min(1, "validation.required").max(100),
  email: z.string().trim().email("validation.email"),
  password: z.string().min(8, "validation.passwordLength"),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: "auth:reset.mismatch" });


/** Only existing registration fields cross the API boundary. */
export function registrationValues({ confirmPassword: _confirmation, ...payload }: z.output<typeof signupSchema>) {
  return payload;
}
