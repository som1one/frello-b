import { AuthService } from '@/auth/auth.service'
import { Auth, GetUserId } from '@/auth/decorators/auth.decorator'
import { CurrentUser } from '@/auth/decorators/user.decorator'
import { IsEmailConfirmedGuard } from '@/auth/guards/is-email-confirm.guard'; // Импортируем Response из express
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import {
	Body,
	ConflictException,
	Controller,
	Get,
	HttpCode,
	NotFoundException,
	Param,
	Post,
	Put,
	Req,
	Res,
	UnauthorizedException,
	UseGuards,
	UsePipes,
	ValidationPipe,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { verify } from 'argon2'
import { Response } from 'express'
import { UpdateSettingsDto, UserDto } from './user.dto'
import { UserService } from './user.service'
import { RoleGuard } from 'src/auth/guards/role.guard'

@Controller('user')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly authService: AuthService
	) { }

	// Получение профиля текущего пользователя
	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard) // Secures these routes
	@Get('profile')
	@Auth() // Проверка авторизации через кастомный декоратор
	async profile(@CurrentUser('id') id: string) {
		const user = await this.userService.getProfile(id)
		if (!user) {
			throw new NotFoundException('Профиль пользователя не найден')
		}
		return user
	}

	// Обновление профиля текущего пользователя
	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@Put('profile')
	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard) // Secures these routes
	@Auth()
	async updateProfile(@CurrentUser('id') id: string, @Body() dto: UserDto) {
		return this.userService.update(id, dto)
	}

	// Изменение пароля текущего пользователя
	@UsePipes(new ValidationPipe())
	@HttpCode(200)
	@UseGuards(AuthGuard('jwt'))
	@Put('change-password')
	async changePassword(
		@Req() req: any,
		@Res({ passthrough: true }) res: Response, // Указываем passthrough: true
		@Body()
		{
			currentPassword,
			newPassword,
		}: { currentPassword: string; newPassword: string }
	) {
		const userId = req.user?.id

		// Получаем пользователя
		const user = await this.userService.getById(userId)
		if (!user) {
			throw new UnauthorizedException('Пользователь не найден')
		}

		// Проверяем текущий пароль с захэшированным паролем
		const isValidPassword = await verify(user.password, currentPassword) // Сравниваем хэшированный пароль
		if (!isValidPassword) {
			throw new UnauthorizedException('Неверный текущий пароль')
		}

		// Проверка нового пароля на совпадение с текущим
		if (currentPassword === newPassword) {
			throw new ConflictException(
				'Новый пароль не может быть таким же, как текущий'
			)
		}

		// Обновляем пароль
		await this.userService.update(userId, { password: newPassword })

		// Генерация новых токенов
		const tokens = this.authService.issueTokens(userId) // Используем метод issueTokens

		// Добавляем refreshToken в response
		this.authService.addRefreshTokenToResponse(res, tokens.refreshToken) // Передаем res

		// Отправляем новый токен обратно клиенту

		return {
			message: 'Пароль успешно изменен',
			accessToken: tokens.accessToken, // Новый accessToken
			refreshToken: tokens.refreshToken, // Новый refreshToken
		}
	}

	// Получение пользовательских настроек
	@Get('settings')
	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
	@Auth()
	async getSettings(@CurrentUser('id') id: string) {
		return this.userService.getSettings(id)
	}

	// Обновление пользовательских настроек
	@Put('settings')
	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
	@Auth()
	@UsePipes(new ValidationPipe())
	async updateSettings(
		@CurrentUser('id') id: string,
		@Body() dto: UpdateSettingsDto
	) {
		return this.userService.updateSettings(id, dto.settings)
	}

	@UseGuards(JwtAuthGuard)
	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
	@Get('profile-filled')
	getProfileStatus(@GetUserId('id') userId: string) {
		return this.userService.getUserProfileStatus(userId)
	}

	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
	@Post('profile-filled')
	updateProfileFilled(
		@GetUserId('id') userId: string,
		@Body() data: { profileFilled: boolean }
	) {
		return this.userService.updateProfile(userId, data)
	}

	@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
	@Get('chat-limit')
	checkChatLimit(@GetUserId('id') userId: string) {
		return this.userService.checkFreeRequestLimit(userId)
	}

	@Post('promo-code')
	// @Roles('ADMIN')
	@UseGuards(JwtAuthGuard)
	async createPromo(
		@CurrentUser('id') uid: string,
		@Body()
		dto: {
			code: string
			percentage?: number
			validFrom?: string
			validUntil?: string
			maxUses?: number
			isUnlimited?: boolean
		}
	) {
		return this.userService.createPromoCode(uid, dto)
	}

	@Get('promo/stats/:code')
	// @Roles('ADMIN')
	@UseGuards(JwtAuthGuard)
	getStats(@Param('code') c: string) {
		return this.userService.getPromoStats(c)
	}

	@Get('promo/analytics/:code')
	@UseGuards(JwtAuthGuard)
	getAnalytics(@Param('code') c: string) {
		return this.userService.getPromoAnalytics(c)
	}

	@Get('promo/list')
	// @Roles('ADMIN')
	@UseGuards(JwtAuthGuard)
	list() {
		return this.userService.listPromos()
	}

	@Get('promo/my')
	// @Roles('ADMIN')
	@UseGuards(JwtAuthGuard)
	my(@CurrentUser('id') uid: string) {
		return this.userService.getUserPromos(uid)
	}

	@Put('promo/deactivate/:code')
	@UseGuards(JwtAuthGuard, RoleGuard)
	// @Roles('ADMIN')
	deactivate(@Param('code') code: string) {
		return this.userService.deactivatePromo(code)
	}
}
