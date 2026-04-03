import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app: INestApplication = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const apiPrefix = configService.get<string>('API_PREFIX') ?? 'api';
  const port = Number(configService.get<string>('PORT') ?? '3000');
  const allowedOrigin = configService.get<string>('ALLOWED_ORIGIN') ?? '*';

  app.setGlobalPrefix(apiPrefix);

  app.use(helmet());

  app.enableCors({
    origin: allowedOrigin,
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
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(port);
}
void bootstrap();
