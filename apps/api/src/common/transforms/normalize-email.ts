import { Transform } from "class-transformer";

/** Emails are unique per account, so "Owner@x.com" and "owner@x.com" must map to the same row. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** DTO property decorator: trims and lowercases the email before validation. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === "string" ? normalizeEmail(value) : value));
}
