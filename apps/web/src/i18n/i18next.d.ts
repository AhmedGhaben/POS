import "i18next";
import type { en } from "./en";

// Keys are checked against the English files: a typo or a key missing
// from en fails the type check.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof en;
    returnNull: false;
  }
}
