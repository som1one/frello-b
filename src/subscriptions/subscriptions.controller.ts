import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import { SubscriptionsService } from './subscriptions.service'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { GetUserId } from '@/auth/decorators/auth.decorator'
import { IsEmailConfirmedGuard } from '@/auth/guards/is-email-confirm.guard'

@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
@Controller('subscriptions')
export class SubscriptionsController {
	constructor(private readonly subscriptionsService: SubscriptionsService) {}

	@Get('plans')
	getPlans() {
		return this.subscriptionsService.getPlans()
	}

	@UseGuards(JwtAuthGuard)
	@Get('user')
	getUserSubscription(@GetUserId('id') userId: string) {
		return this.subscriptionsService.getUserSubscription(userId)
	}

	@UseGuards(JwtAuthGuard)
	@Post('purchase')
	createSubscription(
		@GetUserId('id') userId: string,
		@Body() body: { titleSlug: string }
	) {
		return this.subscriptionsService.createSubscription(userId, body.titleSlug)
	}

	@UseGuards(JwtAuthGuard)
	@Post('discount')
	createDiscount(
		@GetUserId('id') userId: string,
		@Body() body: { percentage: number; validUntil?: string }
	) {
		return this.subscriptionsService.createDiscount(
			userId,
			body.percentage,
			body.validUntil ? new Date(body.validUntil) : undefined
		)
	}
}
