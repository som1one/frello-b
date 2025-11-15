import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { Response } from "express";

interface NestErrorObject {
  message?: string | string[];
  [key: string]: any;
}

@Catch(HttpException)
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception.getStatus();
    const rawResponse = exception.getResponse();

    let message: string;
    let type: "daily" | "trial" | undefined;

    if (typeof rawResponse === "string") {
      message = rawResponse;
    } else {
      const res = rawResponse as NestErrorObject;
      if (Array.isArray(res.message)) {
        message = res.message.join(", ");
      } else {
        message = res.message ?? "Unexpected error";
      }
      type = res.type;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
			type
    });
  }
}
