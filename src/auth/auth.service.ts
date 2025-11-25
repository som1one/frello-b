import { EmailService } from '@/email/email.service'
import { PrismaService } from '@/prisma.service'
import { UserService } from '@/user/user.service'
import {
	ConflictException,
	HttpException,
	HttpStatus,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '@prisma/client'
import { hash, verify } from 'argon2'
import { Response } from 'express'
import { AuthDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
	EXPIRE_DAY_REFRESH_TOKEN = 1
	REFRESH_TOKEN_NAME = 'refreshToken'

	constructor(
		private prisma: PrismaService, // Используем PrismaService
		private jwt: JwtService,
		private userService: UserService,
		private readonly emailService: EmailService
	) { }

	// Логин пользователя
	async login(dto: AuthDto): Promise<{
		user: Partial<User>
		accessToken: string
		refreshToken: string
	}> {
		const { password, ...user } = await this.validateUser(dto)
		const tokens = this.issueTokens(user.id)

		return { user, ...tokens }
	}

	// Регистрация пользователя
	async register(dto: AuthDto): Promise<{
		user: Partial<User>
		accessToken: string
		refreshToken: string
	}> {
		const existingUser = await this.getUserByEmail(dto.email)
		if (existingUser) {
			throw new HttpException(
				'Пользователь с таким email уже существует',
				HttpStatus.CONFLICT
			)
		}

		let promoId: number | null = null
		if (dto.promoCode) {
			const promo = await this.prisma.promoCode.findUnique({
				where: { code: dto.promoCode.toUpperCase() },
			})
			if (!promo || !promo.isActive)
				throw new HttpException('Промокод недействителен', 400)
			if (promo.validUntil && promo.validUntil < new Date())
				throw new HttpException('Промокод истёк', 400)
			if (
				!promo.isUnlimited &&
				promo.maxUses &&
				promo.currentUses >= promo.maxUses
			)
				throw new HttpException('Лимит промокода исчерпан', 400)

			promoId = promo.id
		}

		const user = await this.userService.create(dto)

		if (promoId) {
			await this.prisma.$transaction([
				this.prisma.promoCodeUsage.create({
					data: { userId: user.id, promoCodeId: promoId },
				}),
				this.prisma.promoCode.update({
					where: { id: promoId },
					data: { currentUses: { increment: 1 } },
				}),
			])
		}

		const code = Math.floor(100000 + Math.random() * 900000).toString()
		await this.prisma.verificationToken.create({
			data: {
				token: code,
				userId: user.id,
				expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 минут
			},
		})

		await this.emailService.sendVerificationEmail(dto.email, code)

		const tokens = this.issueTokens(user.id)

		return { user, ...tokens }
	}

	async verifyEmail(
		email: string,
		code: string
	): Promise<{ accessToken: string; refreshToken: string }> {
		const token = await this.prisma.verificationToken.findFirst({
			where: {
				token: code,
				user: { email },
				expiresAt: { gt: new Date() },
			},
			include: { user: true },
		})

		if (!token) {
			throw new HttpException(
				'Недействительный или истёкший код',
				HttpStatus.BAD_REQUEST
			)
		}

		await this.prisma.user.update({
			where: { id: token.userId },
			data: { isActivated: true },
		})

		await this.prisma.verificationToken.delete({ where: { id: token.id } })
		return this.issueTokens(token.userId)
	}

	// Метод для поиска пользователя по email
	async getUserByEmail(email: string) {
		const user = await this.prisma.user.findUnique({
			where: { email },
		})

		if (!user) {
			return null
		}

		return user
	}

	// Получение новых токенов
	async getNewTokens(refreshToken: string): Promise<{
		user: Partial<User>
		accessToken: string
		refreshToken: string
	}> {
		try {
			const result = await this.jwt.verifyAsync(refreshToken)
			const user = await this.userService.getById(result.id)

			if (!user) throw new NotFoundException('Аккаунт с таким ID не найден')

			const tokens = this.issueTokens(user.id)
			return { user, ...tokens }
		} catch (error) {
			throw new UnauthorizedException('Неверный или истекший Refresh-Token')
		}
	}

	// Генерация токенов
	issueTokens(userId: string): { accessToken: string; refreshToken: string } {
		const payload = { id: userId }

		const accessToken = this.jwt.sign(payload, { expiresIn: '4h' })
		const refreshToken = this.jwt.sign(payload, { expiresIn: '7d' })

		return { accessToken, refreshToken }
	}

	// Добавление Refresh-токена в cookies
	addRefreshTokenToResponse(res: Response, refreshToken: string): void {
		const expiresIn = new Date()
		expiresIn.setDate(expiresIn.getDate() + this.EXPIRE_DAY_REFRESH_TOKEN)

		res.cookie(this.REFRESH_TOKEN_NAME, refreshToken, {
			httpOnly: true,
			domain: 'localhost',
			expires: expiresIn,
			secure: true,
			sameSite: 'none',
		})
	}

	// Удаление Refresh-токена из cookies
	removeRefreshTokenFromResponse(res: Response): void {
		res.cookie(this.REFRESH_TOKEN_NAME, '', {
			httpOnly: true,
			domain: 'localhost',
			expires: new Date(0),
			secure: true,
			sameSite: 'none',
		})
	}

	// Проверка пользователя
	public async validateUser(dto: AuthDto): Promise<Partial<User>> {
		const user = await this.userService.getByEmail(dto.email)

		if (!user) throw new NotFoundException('Аккаунт с такой почтой не найден')

		const isValid = await verify(user.password, dto.password)

		if (!isValid)
			throw new UnauthorizedException('Неверный пароль. Попробуйте снова')

		if (!user.isActivated) {
			throw new UnauthorizedException('Email не подтверждён')
		}

		const { password, ...userWithoutPassword } = user
		return userWithoutPassword
	}


	async resendVerificationEmail(email: string) {
		const user = await this.prisma.user.findUnique({ where: { email } })
		if (!user) {
			throw new HttpException('Пользователь не найден', HttpStatus.NOT_FOUND)
		}

		if (user.isActivated) {
			throw new HttpException('Email уже подтверждён', HttpStatus.BAD_REQUEST)
		}

		await this.prisma.verificationToken.deleteMany({
			where: { userId: user.id },
		})

		const code = Math.floor(100000 + Math.random() * 900000).toString()
		await this.prisma.verificationToken.create({
			data: {
				token: code,
				userId: user.id,
				expiresAt: new Date(Date.now() + 10 * 60 * 1000),
			},
		})

		await this.emailService.sendVerificationEmail(email, code)
	}

	// Смена пароля
	async changePassword(
		userId: string,
		currentPassword: string,
		newPassword: string
	): Promise<{ message: string; accessToken: string; refreshToken: string }> {
		// Получаем пользователя
		const user = await this.userService.getById(userId)
		if (!user) throw new NotFoundException('Пользователь не найден')

		// Проверяем текущий пароль с захэшированным паролем
		const isValidPassword = await verify(user.password, currentPassword)
		if (!isValidPassword) {
			throw new UnauthorizedException('Неверный текущий пароль')
		}

		// Проверка на совпадение нового пароля с текущим
		if (currentPassword === newPassword) {
			throw new ConflictException(
				'Новый пароль не может быть таким же, как текущий'
			)
		}

		// Хэшируем новый пароль
		const hashedPassword = await hash(newPassword)

		// Обновляем пароль пользователя в базе данных
		await this.userService.update(userId, { password: hashedPassword })

		// Генерация нового токена
		const tokens = this.issueTokens(userId)

		return { message: 'Пароль успешно изменен', ...tokens }
	}

	async sendResetPasswordEmail(email: string) {
		const user = await this.prisma.user.findUnique({ where: { email } })
		if (!user) {
			// Не говорим, существует ли email — безопасность
			return
		}

		const token =
			Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15)
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 минут

		await this.prisma.passwordResetToken.upsert({
			where: { userId: user.id },
			update: { token, expiresAt },
			create: { userId: user.id, token, expiresAt },
		})

		const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'https://frello.ru'
		const resetLink = `${clientUrl}/reset-password?token=${token}`
		await this.emailService.sendPasswordResetEmail(email, resetLink)
	}

	async confirmResetPassword(token: string, password: string) {
		const reset = await this.prisma.passwordResetToken.findFirst({
			where: { token, expiresAt: { gt: new Date() } },
			include: { user: true },
		})

		if (!reset) {
			throw new HttpException(
				'Недействительный или истёкший токен',
				HttpStatus.BAD_REQUEST
			)
		}

		const hashedPassword = await hash(password)
		await this.prisma.user.update({
			where: { id: reset.userId },
			data: { password: hashedPassword },
		})

		await this.prisma.passwordResetToken.delete({ where: { id: reset.id } })

		return this.issueTokens(reset.userId)
	}

	async validatePromoCode(code: string): Promise<boolean> {
		if (!code || code.trim() === '') return false

		const promo = await this.prisma.promoCode.findUnique({
			where: { code: code.toUpperCase() },
		})

		if (!promo || !promo.isActive) return false
		if (promo.validUntil && promo.validUntil < new Date()) return false
		if (
			!promo.isUnlimited &&
			promo.maxUses &&
			promo.currentUses >= promo.maxUses
		)
			return false

		return true
	}
}
