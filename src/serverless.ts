import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import express from 'express';

let cachedApp: any;

async function createApp() {
  if (!cachedApp) {
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);

    const app = await NestFactory.create(AppModule, adapter);

    // Required for Vercel's proxy
    expressApp.set('trust proxy', 1);

    app.setGlobalPrefix('api');

    app.use(helmet());

    app.enableCors({
      origin: process.env.ALLOWED_ORIGIN || '*',
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Telurio API')
      .setDescription('Egg Farm Management System')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);

    await app.init();
    cachedApp = expressApp;
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = await createApp();
  return app(req, res);
}
