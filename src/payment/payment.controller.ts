import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { PaymentService } from './payment.service'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { GetUserId } from '@/auth/decorators/auth.decorator'
import { IsEmailConfirmedGuard } from '@/auth/guards/is-email-confirm.guard'

@Controller('payments')
export class PaymentController {
	constructor(private readonly paymentService: PaymentService) {}

	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
	@Post('create')
	async createPayment(
		@GetUserId('id') userId: string,
		@Body() body: { planId: number }
	) {
		return this.paymentService.createPayment(userId, body.planId)
	}

	@Post('webhook')
	@HttpCode(HttpStatus.OK)
	async handleWebhook(@Body() body: any) {
		// Webhook от ЮKassa (HTTP Basic Auth режим без секрета)
		// Безопасность обеспечивается через проверку статуса платежа
		// через GET запрос к ЮKassa API
		return this.paymentService.handleWebhook(body)
	}
}

