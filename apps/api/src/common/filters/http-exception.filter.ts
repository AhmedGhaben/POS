import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { isLanguage } from "../i18n/languages";
import { translateMessage } from "../i18n/messages";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("HttpExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    // An unexpected error answers 500 without detail: keep the detail in the server's log.
    if (!isHttpException) this.logger.error(`${request?.method} ${request?.url}: ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`);
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException
      ? exception.getResponse()
      : { message: "Internal server error" };

    const json: Record<string, unknown> =
      typeof body === "string"
        ? { statusCode: status, message: body }
        : { statusCode: status, ...(body as Record<string, unknown>) };

    // The app sends the language on screen; messages come back in it.
    const lang = request?.headers?.["x-language"];
    if (isLanguage(lang) && lang !== "en") {
      if (typeof json.message === "string") json.message = translateMessage(json.message, lang);
      else if (Array.isArray(json.message)) {
        json.message = json.message.map((m) => (typeof m === "string" ? translateMessage(m, lang) : m));
      }
    }

    response.status(status).json(json);
  }
}
