import log from "electron-log/main";
import { scrub } from "./scrub";

/**
 * Rotating log in the app's data folder (logs/main.log, 5 MB, previous file
 * kept as main.old.log). Every line passes through `scrub` first.
 */
export function initLogging() {
  log.initialize();
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.hooks.push((message) => {
    message.data = message.data.map((part) => (typeof part === "string" ? scrub(part) : part));
    return message;
  });
}

export function logFilePath(): string {
  return log.transports.file.getFile().path;
}

export { log };
