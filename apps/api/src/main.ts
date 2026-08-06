import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import * as cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const express = app.getHttpAdapter().getInstance();

  express.disable("etag");

  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    delete request.headers["if-none-match"];
    delete request.headers["if-modified-since"];
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.removeHeader("ETag");
    next();
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: true,
    credentials: true
  });

  await app.listen(config.get<number>("PORT", 3000));
}

bootstrap();
