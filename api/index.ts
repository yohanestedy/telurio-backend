import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import express, { Request, Response } from 'express';
import { AppModule } from '../src/app.module';

const server = express();
let app: any;
let bootstrapError: unknown = null;

async function bootstrap() {
  if (app || bootstrapError) return;

  try {
    const nestApp = await NestFactory.create(
      AppModule,
      new ExpressAdapter(server),
      { logger: ['error', 'warn'] },
    );

    // Required for Vercel's proxy
    server.set('trust proxy', 1);

    nestApp.setGlobalPrefix('api');

    nestApp.use(helmet());

    nestApp.enableCors({
      origin: process.env.ALLOWED_ORIGIN || '*',
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });

    nestApp.useGlobalPipes(
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
    const document = SwaggerModule.createDocument(nestApp, swaggerConfig);
    SwaggerModule.setup('api/docs', nestApp, document);

    await nestApp.init();
    app = nestApp;
  } catch (error) {
    bootstrapError = error;
    console.error('Server bootstrap failed', error);
  }
}

export default async (req: Request, res: Response) => {
  await bootstrap();
  if (bootstrapError) {
    return res.status(500).json({
      success: false,
      message: 'Server bootstrap failed. Check Vercel Function logs.',
      error:
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'Unknown bootstrap error',
    });
  }
  server(req, res);
};
