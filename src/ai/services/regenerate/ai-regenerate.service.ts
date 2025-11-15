import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AiPrepareService } from "../prepare/ai-prepare.service";
import { Message, RequestType } from "@prisma/client";
import { AiHttpClientService } from "../ai-http-client/ai-http-client.service";
import { AiParsePlanService } from "../plan/ai-parse-plan.service";
import { ChatService } from "src/chat/chat.service";

@Injectable()
export class AiRegenerateService {
  constructor(
    private readonly aiPrepareService: AiPrepareService,
    private readonly aiHttpClientService: AiHttpClientService,
    private readonly aiParsePlanService: AiParsePlanService,
    private readonly chatService: ChatService,
  ) {}

  async regeneratePlan({
    chatId,
    content,
    messages,
    userId,
    userMessage,
    mealFrequency,
  }: {
    chatId: number;
    content: string;
    messages: Message[];
    userId: string;
    userMessage: Message;
    mealFrequency: number;
  }) {
    const preparedMessages = await this.aiPrepareService.prepareRegeneratePlan({
      content,
      userId,
      mealFrequency,
      messages,
    });

    const output = await this.aiHttpClientService.fetchApiResponse(
      preparedMessages,
      {
        temperature: 0.9,
      },
    );

    if (!output?.trim()) {
      throw new HttpException(
        "Failed to generate valid response",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const result = this.aiParsePlanService.formatPlanOutput(
      output,
      mealFrequency,
    );

    const newUserMessage = await this.chatService.addMessage({
      chatId,
      userId,
      content: userMessage.content,
      isUser: true,
    });

    const assistantMessage = await this.chatService.updateMessage({
      chatId,
      messageId: this.findAssistantMessageId(messages, userMessage),
      userId,
      newContent: result,
      isLiked: false,
    });

    // const assistantMessage = await this.chatService.addMessage({
    //       chatId,
    //       userId,
    //       content: result,
    //       isUser: false,
    //       isLiked: false,  // Добавь другие поля по типу, если нужно
    //     });

    return {
      userMessage: newUserMessage,
      assistantMessage,
      type: RequestType.REGENERATION_MEAL_PLAN,
    };
  }

  private findAssistantMessageId(
    messages: Message[],
    userMessage: Message,
  ): number | undefined {
    return messages.find(
      (msg) => !msg.isUser && msg.createdAt > userMessage.createdAt,
    )?.id;
  }
}
