import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { ChatModule } from './chat/chat.module'
import { SchedulerModule } from './scheduler/scheduler.module'
import { UserModule } from './user/user.module'
import { DishModule } from './dish/dish.module'
import { PlanModule } from './plan/plan.module'
import { PrismaService } from './prisma.service'
import { MiddlewareConsumer } from '@nestjs/common'
import { LoggerMiddleware } from './middleware/logger.middleware'
import { SubscriptionsModule } from '@/subscriptions/subscriptions.module'
import { MailerModule } from '@nestjs-modules/mailer'
import { ScheduleModule } from '@nestjs/schedule'
import { WeightHistoryModule } from './weight-history/weight-history.module'
import { AiModule } from './ai/ai.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		ScheduleModule.forRoot(),
		MailerModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: (configService: ConfigService) => ({
				transport: {
					host: configService.get('MAIL_HOST'),
					port: configService.get('MAIL_PORT'),
					secure: false,
					auth: {
						user: configService.get('MAIL_USER'),
						pass: configService.get('MAIL_PASS'),
					},
					tls: {
						rejectUnauthorized: true, // Для локальной разработки
					},
				},
				defaults: {
					from: 'Frello AI',
				},
			}),
			inject: [ConfigService],
		}),
		AuthModule,
		UserModule,
		ChatModule,
		SchedulerModule,
		DishModule,
		PlanModule,
		SubscriptionsModule,
		WeightHistoryModule,
		AiModule,
	],
	providers: [PrismaService],
})
export class AppModule {
	private readonly logger = new Logger(AppModule.name)
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(LoggerMiddleware).forRoutes('*')
	}

	constructor() {
		// Логирование сообщений для отладки
		this.logger.debug('AppModule initialized')
		this.logger.log('AppModule started')
		this.logger.warn('Check warnings if necessary')
		this.logger.error('If something goes wrong, check the error logs')
	}
}
