import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { UserService } from 'src/user/user.service'

@Injectable()
export class AiUserService {
	private readonly logger = new Logger(AiUserService.name)
	constructor(private readonly userService: UserService) {}

	async validateRequestLimit(userId: string): Promise<void> {
		try {
			await this.userService.checkFreeRequestLimit(userId)
		} catch (error) {
			this.logger.error('Failed to validate request limit', error)
			throw error
		}
	}

	async getMealFrequency(userId: string): Promise<number> {
		try {
			const settings = await this.userService.getSettings(userId)
			return Math.max(1, Number(settings?.mealFrequency) || 3)
		} catch (error) {
			this.logger.error('Failed to fetch user settings', error)
			throw new HttpException(
				'Failed to fetch user settings',
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}
	}
}
