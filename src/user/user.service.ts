import { PrismaService } from '@/prisma.service'
import {
	BadRequestException,
	ConflictException,
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common'
import { hash } from 'argon2'
import { AuthDto } from 'src/auth/dto/auth.dto'
import { LimitExceededException } from 'src/common/filters/limit-exceeded.exception'
import { UserSettingsType } from './types/user'
import { UserDto } from './user.dto'

enum MealFrequency {
	ONE = 'ONE',
	TWO = 'TWO',
	THREE = 'THREE',
	FOUR = 'FOUR',
	FIVE_OR_MORE = 'FIVE_OR_MORE',
}

@Injectable()
export class UserService {
	private readonly logger = new Logger(UserService.name)
	constructor(private prisma: PrismaService) { }

	// Получение пользователя по ID
	getById(id: string) {
		return this.prisma.user.findUnique({
			where: {
				id,
			},

			include: {
				dishes: { where: { isFavorite: true } },
				mealPlans: true,
			},
		})
	}

	// Получение пользователя по email
	getByEmail(email: string) {
		return this.prisma.user.findUnique({
			where: {
				email,
			},
		})
	}

	// Получение профиля пользователя без пароля
	async getProfile(id: string) {
		const profile = await this.getById(id)

		// Убираем пароль из профиля
		const { password: _password, ...rest } = profile

		return { user: { ...rest, role: profile.role } }
	}

	// Создание пользователя
	async create(dto: AuthDto) {
		const user = {
			email: dto.email,
			name: dto.email.split('@')[0],
			password: await hash(dto.password),
			updated_at: new Date(),
			created_at: new Date(),
			trial_start_date: new Date(),
		}

		return this.prisma.user.create({
			data: user,
			select: { id: true, email: true, isActivated: true },
		})
	}

	// Обновление пользователя
	async update(id: string, dto: UserDto) {
		let data = dto

		if (dto.password) {
			data = { ...dto, password: await hash(dto.password) }
		}

		return this.prisma.user.update({
			where: {
				id,
			},
			data: { ...data, mealFrequency: MealFrequency.FOUR },
			select: {
				email: true,
				name: true,
				gender: true,
				dishes: {
					// исправили на правильное имя поля
					where: { isFavorite: true },
					select: {
						id: true, // или другие поля из связанной модели
					},
				},
				age_range: true,
				weight: true,
				height: true,
				dietary_preferences: true,
				dietary_restrictions: true,
				goal: true,
				mealFrequency: true,
				cooking_experience: true,
				mealPlans: true,
			},
		})
	}

	// Получение пользовательских настроек
	async getSettings(userId: string): Promise<UserSettingsType> {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) {
			throw new NotFoundException('Пользователь не найден')
		}
		const settings =
			user.settings && typeof user.settings === 'object' ? user.settings : {}
		this.logger.log('Fetched settings', settings)
		return {
			mealFrequency: (settings as any).mealFrequency
				? Number((settings as any).mealFrequency)
				: 4,
			...(typeof settings === 'object' ? settings : {}),
		}
	}

	// Обновление пользовательских настроек
	async updateSettings(userId: string, settings: Record<string, any>) {
		const user = await this.prisma.user.findUnique({ where: { id: userId } })
		if (!user) {
			throw new NotFoundException('Пользователь не найден')
		}

		// Проверяем, что settings и user.settings - объекты
		const currentSettings =
			typeof user.settings === 'object' && user.settings !== null
				? user.settings
				: {}
		const safeSettings =
			typeof settings === 'object' && settings !== null ? settings : {}
		const { avatar: _avatar, ...restSettings } = safeSettings

		// Объединяем настройки
		const updatedSettings = { ...currentSettings, ...restSettings }

		return this.prisma.user.update({
			where: { id: userId },
			data: { settings: updatedSettings },
			select: { settings: true },
		})
	}

	async getUserProfileStatus(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { profileFilled: true },
		})
		return { profileFilled: user?.profileFilled ?? false }
	}

	async updateProfile(userId: string, data: { profileFilled: boolean }) {
		return this.prisma.user.update({
			where: { id: userId },
			data: { profileFilled: data.profileFilled },
		})
	}

	async checkFreeRequestLimit(userId: string) {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				subscription: { where: { status: 'active' } },
				trial_start_date: true,
				trial_day_requests: true,
				last_request_date: true,
			},
		})

		if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND)

		// Если есть подписка — пропускаем
		if (user?.subscription) return

		// Сбрасываем счётчик, если новый день
		const updatedUser = await this.resetDailyRequestsIfNeeded(user)

		const trialStart = updatedUser.trial_start_date
		if (!trialStart) {
			throw new HttpException('Trial not started', HttpStatus.FORBIDDEN)
		}

		const daysSinceStart = Math.floor(
			(Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
		)

		// Триал кончился
		if (daysSinceStart >= 7) {
			throw new LimitExceededException(
				'trial',
				'Пробный период (7 дней) завершён. Оформите подписку.'
			)
		}

		// Лимит на день
		if (updatedUser.trial_day_requests >= 5) {
			throw new LimitExceededException(
				'daily',
				'Лимит 5 запросов на день исчерпан. Доступно завтра.'
			)
		}

		// Увеличиваем счётчик
		await this.prisma.user.update({
			where: { id: userId },
			data: {
				trial_day_requests: { increment: 1 },
				last_request_date: new Date(),
			},
		})
	}

	async createPromoCode(
		userId: string,
		dto: {
			code: string
			percentage?: number
			validFrom?: string
			validUntil?: string
			maxUses?: number
			isUnlimited?: boolean
		}
	) {
		const code = dto.code.toUpperCase().trim()
		const existing = await this.prisma.promoCode.findUnique({ where: { code } })
		if (existing) throw new ConflictException('Промокод уже существует')

		return this.prisma.promoCode.create({
			data: {
				code,
				percentage: dto.percentage ?? null,
				validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
				validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
				maxUses: dto.isUnlimited ? null : (dto.maxUses ?? null),
				isUnlimited: dto.isUnlimited ?? false,
				isActive: true,
			},
		})
	}

	async getPromoStats(code: string) {
		const p = await this.prisma.promoCode.findUnique({
			where: { code: code.toUpperCase() },
			include: {
				usages: {
					include: { user: { select: { id: true, email: true, name: true } } },
				},
			},
		})
		if (!p) throw new NotFoundException()
		return p
	}

	async listPromos() {
		return this.prisma.promoCode.findMany({
			select: {
				id: true,
				code: true,
				percentage: true,
				currentUses: true,
				maxUses: true,
				isUnlimited: true,
				isActive: true,
			},
			orderBy: { createdAt: 'desc' },
		})
	}

	async getUserPromos(userId: string) {
		return this.prisma.promoCodeUsage.findMany({
			where: { userId },
			include: { promoCode: { select: { code: true, percentage: true } } },
		})
	}

	async deactivatePromo(code: string) {
		const promo = await this.prisma.promoCode.findUnique({
			where: { code: code.toUpperCase() },
		})
		if (!promo) throw new NotFoundException('Промокод не найден')
		if (!promo.isActive) throw new BadRequestException('Уже неактивен')

		return this.prisma.promoCode.update({
			where: { id: promo.id },
			data: { isActive: false },
		})
	}

	async getPromoAnalytics(code: string) {
		// Получаем промокод с использованиями
		const promo = await this.prisma.promoCode.findUnique({
			where: { code: code.toUpperCase() },
			include: {
				usages: {
					include: {
						user: {
							include: {
								subscription: {
									where: { status: 'active' },
									include: { plan: true },
								},
							},
						},
					},
				},
			},
		})

		if (!promo) throw new NotFoundException('Промокод не найден')

		// Структура для хранения данных по месяцам
		interface MonthlyData {
			month1: number  // Количество подписок на 1 месяц
			month6: number  // Количество подписок на 6 месяцев
			month12: number // Количество подписок на 12 месяцев
			revenue: number // Общий доход за месяц (20%)
		}
		const monthlyStats: { [key: string]: MonthlyData } = {}

		// Обрабатываем каждое использование промокода
		for (const usage of promo.usages) {
			const subscription = usage.user.subscription

			if (!subscription || subscription.status !== 'active') continue

			const subscriptionPrice = subscription.price
			const monthlyCommission = (subscriptionPrice * 0.2) / 12 // 20% от подписки, разделенный на 12 месяцев

			// Определяем тип подписки по длительности
			const planDuration = subscription.plan.duration // в днях
			let subscriptionType: 'month1' | 'month6' | 'month12' = 'month1'

			if (planDuration >= 350) {
				subscriptionType = 'month12' // 12 месяцев
			} else if (planDuration >= 170) {
				subscriptionType = 'month6'  // 6 месяцев
			} else {
				subscriptionType = 'month1'  // 1 месяц
			}

			// Определяем сколько месяцев активна подписка
			const startDate = new Date(subscription.startDate)
			const endDate = new Date(subscription.endDate)

			// Генерируем записи для каждого месяца подписки
			const current = new Date(startDate)
			while (current < endDate) {
				const periodStart = new Date(current)
				const periodEnd = new Date(current)
				periodEnd.setMonth(periodEnd.getMonth() + 1)

				// Формат: DD.MM.YY-DD.MM.YY
				const key = `${this.formatDate(periodStart)}-${this.formatDate(periodEnd)}`

				if (!monthlyStats[key]) {
					monthlyStats[key] = {
						month1: 0,
						month6: 0,
						month12: 0,
						revenue: 0,
					}
				}

				// Увеличиваем счетчик соответствующего типа подписки только в первый месяц
				if (current.getTime() === startDate.getTime()) {
					monthlyStats[key][subscriptionType] += 1
				}

				monthlyStats[key].revenue += monthlyCommission

				current.setMonth(current.getMonth() + 1)
			}
		}

		// Конвертируем в массив и сортируем по датам
		const periods = Object.entries(monthlyStats)
			.map(([period, stats]) => ({
				period,
				month1Count: stats.month1,
				month6Count: stats.month6,
				month12Count: stats.month12,
				revenue: Math.round(stats.revenue),
			}))
			.sort((a, b) => {
				const dateA = new Date(a.period.split('-')[0].split('.').reverse().join('-'))
				const dateB = new Date(b.period.split('-')[0].split('.').reverse().join('-'))
				return dateA.getTime() - dateB.getTime()
			})

		// Считаем общий доход
		const totalRevenue = periods.reduce((sum, p) => sum + p.revenue, 0)
		const totalMonth1 = periods.reduce((sum, p) => sum + p.month1Count, 0)
		const totalMonth6 = periods.reduce((sum, p) => sum + p.month6Count, 0)
		const totalMonth12 = periods.reduce((sum, p) => sum + p.month12Count, 0)

		return {
			code: promo.code,
			totalUsages: promo.currentUses,
			totalRevenue,
			totalSubscriptions: {
				month1: totalMonth1,
				month6: totalMonth6,
				month12: totalMonth12,
			},
			periods,
		}
	}

	private formatDate(date: Date): string {
		const day = date.getDate().toString().padStart(2, '0')
		const month = (date.getMonth() + 1).toString().padStart(2, '0')
		const year = date.getFullYear().toString().slice(-2)
		return `${day}.${month}.${year}`
	}

	private async resetDailyRequestsIfNeeded(user: {
		id: string
		last_request_date: Date | null
		trial_day_requests: number
		trial_start_date: Date | null
	}) {
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		const todayTimestamp = today.getTime()

		const lastDate = user.last_request_date
			? new Date(user.last_request_date)
			: null
		lastDate?.setHours(0, 0, 0, 0)
		const lastDateTimestamp = lastDate ? lastDate.getTime() : null

		if (lastDateTimestamp !== todayTimestamp) {
			await this.prisma.user.update({
				where: { id: user.id },
				data: {
					trial_day_requests: 0,
					last_request_date: new Date(),
				},
			})
			return {
				...user,
				trial_day_requests: 0,
				last_request_date: new Date(),
				trial_start_date: user.trial_start_date,
			}
		}
		return user
	}
}
