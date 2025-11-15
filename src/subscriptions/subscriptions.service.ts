import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { addDays } from 'date-fns'
import { PrismaService } from '@/prisma.service'

@Injectable()
export class SubscriptionsService {
	constructor(private prisma: PrismaService) {}

	async getPlans() {
		return this.prisma.subscriptionPlan.findMany()
	}

	async getUserSubscription(userId: string) {
		return this.prisma.subscription.findFirst({
			where: { userId, status: 'active' },
			include: { plan: true },
		})
	}

	async getUserDiscount(userId: string) {
		return this.prisma.discount.findFirst({
			where: { userId, validUntil: { gte: new Date() } },
		})
	}

	async createSubscription(userId: string, titleSlug: string) {
		await this.seedPlans()
		const plan = await this.prisma.subscriptionPlan.findFirst({
			where: { name: titleSlug },
		})
		if (!plan) throw new HttpException('Plan not found', HttpStatus.NOT_FOUND)

		// Проверяем, есть ли предыдущие подписки
		const hasPreviousSubscriptions = await this.prisma.subscription.count({
			where: { userId },
		})

		// Применяем скидку только для первой подписки
		const price = hasPreviousSubscriptions
			? plan.price // Полная цена для последующих подписок
			: plan.price * (1 - (plan.discountPercentage || 0) / 100) // Скидка для первой подписки

		const existingSubscription = await this.getUserSubscription(userId)
		let endDate: Date

		if (existingSubscription) {
			// Если есть активная подписка, суммируем длительность
			endDate = addDays(existingSubscription.endDate, plan.duration)
			return this.prisma.subscription.update({
				where: { id: existingSubscription.id },
				data: {
					endDate,
					price,
					plan: { connect: { id: plan.id } },
				},
			})
		} else {
			// Создаём новую подписку
			endDate = addDays(new Date(), plan.duration)
			return this.prisma.subscription.create({
				data: {
					user: { connect: { id: userId } },
					plan: { connect: { id: plan.id } },
					startDate: new Date(),
					endDate,
					price,
					status: 'active',
				},
			})
		}
	}

	async createDiscount(userId: string, percentage: number, validUntil?: Date) {
		return this.prisma.discount.create({
			data: { userId, percentage, validUntil },
		})
	}

	async seedPlans() {
		return this.prisma.subscriptionPlan.createMany({
			data: [
				{ name: '1 month', duration: 30, price: 1000, discountPercentage: 50 },
				{
					name: '3 month',
					duration: 90,
					price: 1800,
					discountPercentage: 22,
				},
				{
					name: '6 month',
					duration: 180,
					price: 3500,
					discountPercentage: 29,
				},
				{
					name: '12 month',
					duration: 360,
					price: 6500,
					discountPercentage: 31,
				},
			],
			skipDuplicates: true, // Пропускает дубликаты, если записи уже есть
		})
	}
}
