import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { addDays } from 'date-fns'
import { PrismaService } from '@/prisma.service'
import { SubscriptionsService } from '@/subscriptions/subscriptions.service'
import { v4 as uuidv4 } from 'uuid'

interface YooKassaPaymentResponse {
	confirmation: {
		confirmation_url: string
		type: string
		return_url: string
	}
}

interface YooKassaWebhookEvent {
	event: string
	type: string
	object: {
		id: string
		status: string
		amount: {
			value: string
			currency: string
		}
		metadata?: {
			userId?: string
			planId?: string
		}
		paid: boolean
		captured_at?: string
	}
}

interface YooKassaPaymentInfo {
	id: string
	status: string
	paid: boolean
	amount: {
		value: string
		currency: string
	}
	metadata?: {
		userId?: string
		planId?: string
	}
	captured_at?: string
}

@Injectable()
export class PaymentService {
	private readonly logger = new Logger(PaymentService.name)
	private readonly yookassaShopId: string
	private readonly yookassaSecretKey: string
	private readonly yookassaApiUrl = 'https://api.yookassa.ru/v3/payments'

	constructor(
		private prisma: PrismaService,
		private subscriptionsService: SubscriptionsService,
		private configService: ConfigService,
		private httpService: HttpService
	) {
		this.yookassaShopId = this.configService.get<string>('YOOKASSA_SHOP_ID') || ''
		this.yookassaSecretKey =
			this.configService.get<string>('YOOKASSA_SECRET_KEY') || ''

		// Проверяем наличие обязательных переменных окружения
		if (!this.yookassaShopId || !this.yookassaSecretKey) {
			this.logger.warn(
				'YooKassa credentials not configured. YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY must be set.'
			)
		}
	}

	async createPayment(userId: string, planId: number) {
		try {
			this.logger.log(`Creating payment for userId: ${userId}, planId: ${planId}`)

			// Проверяем наличие учетных данных
			if (!this.yookassaShopId || !this.yookassaSecretKey) {
				this.logger.error('YooKassa credentials not configured')
				throw new HttpException(
					'Payment service not configured',
					HttpStatus.INTERNAL_SERVER_ERROR
				)
			}

			await this.subscriptionsService.seedPlans()

			// Маппинг planId на name для поиска в базе
			const planIdToName: Record<number, string> = {
				1: '1 month',
				2: '6 month',
				4: '12 month',
			}

			const planName = planIdToName[planId]
			if (!planName) {
				this.logger.error(`Invalid plan ID: ${planId}`)
				throw new HttpException('Invalid plan ID', HttpStatus.BAD_REQUEST)
			}

			// Получаем план по name (так как в базе планы хранятся по name)
			const plan = await this.prisma.subscriptionPlan.findFirst({
				where: { name: planName },
			})

			if (!plan) {
				this.logger.error(`Plan not found: ${planName}`)
				throw new HttpException('Plan not found', HttpStatus.NOT_FOUND)
			}

			this.logger.log(`Found plan: ${plan.name}, price in DB: ${plan.price}`)

			// Получаем данные пользователя для чека
			const user = await this.prisma.user.findUnique({
				where: { id: userId },
				select: { email: true },
			})

			if (!user || !user.email) {
				this.logger.error(`User not found or email missing: ${userId}`)
				throw new HttpException(
					'User email not found',
					HttpStatus.BAD_REQUEST
				)
			}

			// Используем финальные цены с карточки (уже включают скидку)
			// Эти цены соответствуют тому, что видит пользователь на фронтенде
			const finalPrices: Record<number, number> = {
				1: 999,  // 1 месяц (временно изменено для тестирования)
				2: 3999, // 6 месяцев
				4: 6999, // 12 месяцев
			}

			const price = finalPrices[planId]
			if (!price) {
				this.logger.error(`Final price not found for planId: ${planId}`)
				throw new HttpException(
					'Price not configured for this plan',
					HttpStatus.INTERNAL_SERVER_ERROR
				)
			}

			this.logger.log(`Using final price: ${price} RUB for planId: ${planId}`)

			// Формируем описание подписки для ЮKassa
			const planDisplayNames: Record<number, string> = {
				1: '1 месяц',
				2: '6 месяцев',
				4: '12 месяцев',
			}
			const planDisplayName = planDisplayNames[planId] || `${plan.duration} дней`

			// Формируем запрос к ЮKassa с чеком (receipt обязателен для РФ)
			const paymentData = {
				amount: {
					value: price.toFixed(2),
					currency: 'RUB',
				},
				capture: true,
				confirmation: {
					type: 'redirect',
					return_url: 'https://frello.ru/payment/success',
				},
				description: `Оплата подписки: ${planDisplayName}`,
				receipt: {
					customer: {
						email: user.email,
					},
					items: [
						{
							description: `Подписка: ${planDisplayName}`,
							quantity: '1',
							amount: {
								value: price.toFixed(2),
								currency: 'RUB',
							},
							vat_code: 1, // НДС не облагается (для УСН)
						},
					],
				},
				metadata: {
					userId: userId,
					planId: planId.toString(),
				},
			}

			// Создаем уникальный ключ идемпотентности
			const idempotenceKey = uuidv4()

			this.logger.log(`Sending request to YooKassa API. Idempotence-Key: ${idempotenceKey}`)
			this.logger.log(`Amount to YooKassa: ${paymentData.amount.value} ${paymentData.amount.currency}`)
			this.logger.debug(`Full payment data: ${JSON.stringify(paymentData, null, 2)}`)

			// Формируем Basic Auth заголовок
			const authString = Buffer.from(
				`${this.yookassaShopId}:${this.yookassaSecretKey}`
			).toString('base64')

			// Отправляем запрос в ЮKassa через HttpService
			const response = await firstValueFrom(
				this.httpService.post<YooKassaPaymentResponse>(
					this.yookassaApiUrl,
					paymentData,
					{
						headers: {
							'Idempotence-Key': idempotenceKey,
							'Content-Type': 'application/json',
							Authorization: `Basic ${authString}`,
						},
					}
				)
			)

			this.logger.log(`YooKassa API response status: ${response.status}`)
			this.logger.debug(
				`YooKassa API response: ${JSON.stringify(response.data, null, 2)}`
			)

			const payment = response.data

			if (!payment?.confirmation?.confirmation_url) {
				this.logger.error('Invalid response from YooKassa API: missing confirmation_url')
				throw new HttpException(
					'Invalid response from payment provider',
					HttpStatus.INTERNAL_SERVER_ERROR
				)
			}

			// Возвращаем URL для редиректа
			return {
				redirectUrl: payment.confirmation.confirmation_url,
			}
		} catch (error) {
			if (error instanceof HttpException) {
				throw error
			}

			// Обработка ошибок от axios
			if (error.response) {
				const status = error.response.status
				const errorData = error.response.data
				this.logger.error(
					`YooKassa API error: ${status} - ${JSON.stringify(errorData)}`
				)

				if (status === 401) {
					throw new HttpException(
						'Invalid YooKassa credentials',
						HttpStatus.UNAUTHORIZED
					)
				}

				if (status === 400) {
					throw new HttpException(
						errorData?.description || 'Invalid payment request',
						HttpStatus.BAD_REQUEST
					)
				}

				throw new HttpException(
					`Payment service error: ${errorData?.description || error.message}`,
					HttpStatus.INTERNAL_SERVER_ERROR
				)
			}

			this.logger.error(
				`Error creating payment: ${error.message}`,
				error.stack
			)
			throw new HttpException(
				`Failed to create payment: ${error.message}`,
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}

	/**
	 * Проверяет статус платежа через GET запрос к ЮKassa API
	 * Это дополнительная проверка безопасности для подтверждения статуса платежа
	 */
	private async verifyPaymentStatus(paymentId: string): Promise<YooKassaPaymentInfo | null> {
		try {
			const authString = Buffer.from(
				`${this.yookassaShopId}:${this.yookassaSecretKey}`
			).toString('base64')

			const response = await firstValueFrom(
				this.httpService.get<YooKassaPaymentInfo>(
					`${this.yookassaApiUrl}/${paymentId}`,
					{
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Basic ${authString}`,
						},
					}
				)
			)

			this.logger.log(`Payment verification: ${paymentId}, status: ${response.data.status}`)
			return response.data
		} catch (error) {
			this.logger.error(`Failed to verify payment ${paymentId}: ${error.message}`)
			return null
		}
	}

	async handleWebhook(webhookData: YooKassaWebhookEvent) {
		try {
			this.logger.log(`Received webhook event: ${webhookData.event}`)
			this.logger.debug(`Webhook data: ${JSON.stringify(webhookData, null, 2)}`)

			// Обрабатываем только события payment.succeeded и payment.waiting_for_capture
			const allowedEvents = ['payment.succeeded', 'payment.waiting_for_capture']
			if (!allowedEvents.includes(webhookData.event)) {
				this.logger.log(`Ignoring event: ${webhookData.event}`)
				return { received: true, message: 'Event ignored' }
			}

			const payment = webhookData.object
			const paymentId = payment.id

			// ВАЖНО: Проверяем статус платежа через GET запрос к ЮKassa API
			// Это защита от поддельных webhook запросов
			const verifiedPayment = await this.verifyPaymentStatus(paymentId)

			if (!verifiedPayment) {
				this.logger.error(`Failed to verify payment ${paymentId}`)
				throw new HttpException(
					'Failed to verify payment status',
					HttpStatus.BAD_REQUEST
				)
			}

			// Проверяем, что статус платежа действительно succeeded
			if (verifiedPayment.status !== 'succeeded' || !verifiedPayment.paid) {
				this.logger.warn(
					`Payment ${paymentId} not succeeded. Status: ${verifiedPayment.status}, Paid: ${verifiedPayment.paid}`
				)
				return { received: true, message: 'Payment not succeeded' }
			}

			// Используем данные из проверенного платежа
			const userId = verifiedPayment.metadata?.userId
			const planId = verifiedPayment.metadata?.planId

			if (!userId || !planId) {
				this.logger.error(
					`Missing metadata in payment ${paymentId}. userId: ${userId}, planId: ${planId}`
				)
				throw new HttpException(
					'Missing payment metadata',
					HttpStatus.BAD_REQUEST
				)
			}

			this.logger.log(`Processing successful payment for userId: ${userId}, planId: ${planId}`)

			// Маппинг planId на titleSlug для создания подписки
			const planIdToSlug: Record<number, string> = {
				1: '1 month',
				2: '6 month',
				4: '12 month',
			}

			const titleSlug = planIdToSlug[parseInt(planId)]
			if (!titleSlug) {
				this.logger.error(`Invalid planId in metadata: ${planId}`)
				throw new HttpException(
					'Invalid plan ID',
					HttpStatus.BAD_REQUEST
				)
			}

			// Получаем план для проверки
			await this.subscriptionsService.seedPlans()
			const plan = await this.prisma.subscriptionPlan.findFirst({
				where: { name: titleSlug },
			})

			if (!plan) {
				this.logger.error(`Plan not found: ${titleSlug}`)
				throw new HttpException('Plan not found', HttpStatus.NOT_FOUND)
			}

			// Проверяем, не создана ли уже подписка для этого платежа
			// (защита от дублирования при повторных webhook)
			const existingSubscription = await this.subscriptionsService.getUserSubscription(userId)

			if (existingSubscription && existingSubscription.planId === plan.id) {
				this.logger.log(
					`Subscription already exists for userId: ${userId}, planId: ${plan.id}`
				)
				return { received: true, subscription: 'already_exists' }
			}

			// Получаем оплаченную цену из проверенного платежа
			const paidAmount = parseFloat(verifiedPayment.amount.value)

			// Создаем подписку с оплаченной ценой и правильным планом (какой оплатил - такой и выдается)
			this.logger.log(
				`Creating subscription for userId: ${userId}, planId: ${plan.id}, planName: ${plan.name}, paidAmount: ${paidAmount}`
			)

			const existingSub = await this.subscriptionsService.getUserSubscription(userId)
			let endDate: Date

			if (existingSub) {
				// Если есть активная подписка, суммируем длительность
				endDate = addDays(existingSub.endDate, plan.duration)
				const subscription = await this.prisma.subscription.update({
					where: { id: existingSub.id },
					data: {
						endDate,
						price: paidAmount, // Используем оплаченную цену
						plan: { connect: { id: plan.id } },
					},
				})

				this.logger.log(
					`Subscription updated successfully. Subscription ID: ${subscription.id}`
				)

				return {
					received: true,
					subscription: {
						id: subscription.id,
						planId: subscription.planId,
						endDate: subscription.endDate,
						price: subscription.price,
					},
				}
			} else {
				// Создаём новую подписку с оплаченной ценой
				endDate = addDays(new Date(), plan.duration)
				const subscription = await this.prisma.subscription.create({
					data: {
						user: { connect: { id: userId } },
						plan: { connect: { id: plan.id } },
						startDate: new Date(),
						endDate,
						price: paidAmount, // Используем оплаченную цену
						status: 'active',
					},
				})

				this.logger.log(
					`Subscription created successfully. Subscription ID: ${subscription.id}`
				)

				return {
					received: true,
					subscription: {
						id: subscription.id,
						planId: subscription.planId,
						endDate: subscription.endDate,
						price: subscription.price,
					},
				}
			}
		} catch (error) {
			this.logger.error(
				`Error processing webhook: ${error.message}`,
				error.stack
			)

			if (error instanceof HttpException) {
				throw error
			}

			throw new HttpException(
				`Failed to process webhook: ${error.message}`,
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}
}

