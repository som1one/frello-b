import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Message, RequestType } from '@prisma/client'
import { AiPrepareService } from '../prepare/ai-prepare.service'
import { AiHttpClientService } from '../ai-http-client/ai-http-client.service'
import { stripHtml } from 'src/ai/model/stripHtml'
import { ChatService } from 'src/chat/chat.service'

@Injectable()
export class AiSimpleMessageService {
	constructor(
		private readonly aiPrepareService: AiPrepareService,
		private readonly aiHttpClientService: AiHttpClientService,
		private readonly chatService: ChatService
	) {}

	async simpleMessage({
		chatId,
		content,
		messages,
		userId,
		userMessage,
	}: {
		chatId: number
		content: string
		messages: Message[]
		userId: string
		userMessage: Message
	}) {
		const preparedMessageForAI =
			await this.aiPrepareService.prepareSimpleMessage({
				userId,
				content,
				messages,
			})

		const output = await this.aiHttpClientService.fetchApiResponse(
			preparedMessageForAI,
			{ temperature: 0.5 }
		)

		if (!output?.trim()) {
			throw new HttpException(
				'Failed to generate valid response',
				HttpStatus.INTERNAL_SERVER_ERROR
			)
		}

		const result = stripHtml(output)
		const assistantMessage = await this.chatService.addMessage({
			chatId,
			userId,
			content: result,
			isUser: false,
			aiResponseType: RequestType.TEXT,
		})

		return { userMessage, assistantMessage, type: RequestType.TEXT }
	}
}
