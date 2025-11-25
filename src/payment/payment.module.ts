import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PaymentController } from './payment.controller'
import { PaymentService } from './payment.service'
import { PrismaService } from '@/prisma.service'
import { SubscriptionsService } from '@/subscriptions/subscriptions.service'

@Module({
	imports: [HttpModule],
	controllers: [PaymentController],
	providers: [PaymentService, PrismaService, SubscriptionsService],
})
export class PaymentModule {}

