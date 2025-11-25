import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn", "debug", "verbose"],
  });
  // logger: ['error', 'warn', 'log']
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({
    origin: [
      "http://31.207.74.107:3000",
      "http://frello.ru",
      "https://frello.ru",
      "http://www.frello.ru",
      "https://www.frello.ru",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    exposedHeaders: ["set-cookie"],
  });
  

  Logger.log("Application started", "Bootstrap");

  await app.listen(3001);
}
bootstrap();
