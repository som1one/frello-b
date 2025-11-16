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
    origin: ["https://frello.ru/", "https://frello.ru/"],
    credentials: true,
    exposedHeaders: "set-cookie",
  });

  Logger.log("Application started", "Bootstrap");

  await app.listen(4200);
}
bootstrap();
