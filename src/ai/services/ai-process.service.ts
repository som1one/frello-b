import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { Message, RequestType } from '@prisma/client'
import { AiServiceResponse } from '../types'
import { AiUserService } from './ai-user/ai-user.service'
import { AiPlanService } from './plan/ai-plan.service'
import { AiRecipeService } from './recipe/ai-recipe.service'
import { AiRegenerateService } from './regenerate/ai-regenerate.service'
import { AiSimpleMessageService } from './simple-message/ai-simple-message.service'

@Injectable()
export class AiProcessService {
	private readonly logger = new Logger(AiProcessService.name)
	constructor(
		private readonly aiUserService: AiUserService,
		private readonly aiSimpleMessageService: AiSimpleMessageService,
		private readonly aiPlanService: AiPlanService,
		private readonly aiRegenerateService: AiRegenerateService,
		private readonly aiRecipeService: AiRecipeService
	) { }

	private readonly apiConfig = {
		apiKey: process.env.GENAPI_API_KEY || '',
	}

	async processChatResponse({
		chatId,
		content,
		messages,
		userId,
		requestType,
		userMessage,
	}: {
		chatId: number
		content: string
		messages: Message[]
		userId: string
		requestType: RequestType
		userMessage: Message
	}): Promise<AiServiceResponse> {
		if (!content.trim()) {
			throw new HttpException('Content not found', HttpStatus.BAD_REQUEST)
		}

		if (!this.apiConfig.apiKey) {
			throw new HttpException(
				'No API Key provided',
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}

		const mealFrequency = await this.aiUserService.getMealFrequency(userId)
		this.logger.log('mealFrequency', mealFrequency)

		switch (requestType) {
			case RequestType.TEXT:
				return this.aiSimpleMessageService.simpleMessage({
					chatId,
					content,
					messages,
					userId,
					userMessage,
				})

			case RequestType.MEAL_PLAN: {
				return this.aiPlanService.createPlan({
					chatId,
					content,
					messages,
					userId,
					mealFrequency,
					userMessage,
				})
			}

			case RequestType.RECIPE: {
				return this.aiRecipeService.createMessageRecipe({
					userId,
					content,
					userMessage,
					chatId,
				})
			}

			default:
				return this.aiRegenerateService.regeneratePlan({
					chatId,
					content,
					messages,
					userId,
					userMessage,
					mealFrequency,
				})
		}
	}
}
