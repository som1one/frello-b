import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import * as cookieParser from 'cookie-parser'
import * as dotenv from 'dotenv'

import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap() {
	dotenv.config() // <-- .env faylni yuklaymiz

	const app = await NestFactory.create(AppModule, {
		logger: ['log', 'error', 'warn', 'debug', 'verbose']
	})
	// logger: ['error', 'warn', 'log']
	app.useGlobalFilters(new AllExceptionsFilter())
	app.setGlobalPrefix('api')
	app.use(cookieParser())
	app.enableCors({
		origin: ['http://localhost:3000', 'http://localhost:3001'],
		credentials: true,
		exposedHeaders: 'set-cookie'
	})

	Logger.log('Application started', 'Bootstrap')

	const port = process.env.PORT || 4200 // <-- .env fayldagi PORT ishlaydi, default 4200
	await app.listen(port)
}
bootstrap()
