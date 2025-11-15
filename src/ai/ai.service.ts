import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { RequestType } from "@prisma/client";
import { getRequestType } from "./model/request-types";
import { AiChatService } from "./services/ai-chat/ai-chat.service";
import { AiPlanGeneratorService } from "./services/ai-plan-generator/ai-plan-generator.service";
import { AiProcessService } from "./services/ai-process.service";
import { AiUserService } from "./services/ai-user/ai-user.service";
import { AiParsePlanService } from "./services/plan/ai-parse-plan.service";
import { AiServiceResponse } from "./types";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  constructor(
    private readonly aiProcessService: AiProcessService,
    private readonly aiUserService: AiUserService,
    private readonly aiChatService: AiChatService,
    private readonly aiParsePlanService: AiParsePlanService,
    private readonly aiPlanGeneratorService: AiPlanGeneratorService,
  ) {}

  async fetchAssistantResponse(
    chatId: number,
    content: string,
    userId: string,
  ): Promise<AiServiceResponse> {
    try {
      await this.aiUserService.validateRequestLimit(userId);
      const userMessage = await this.aiChatService.addUserMessage(
        chatId,
        userId,
        content,
      );
      const requestType = getRequestType({ content, isRegeneration: false });
      this.logger.log("requestType", requestType);
      const messages = await this.aiChatService.getChatMessages(chatId);

      return this.aiProcessService.processChatResponse({
        chatId,
        content,
        messages,
        userId,
        requestType,
        userMessage,
      });
    } catch (error) {
      this.logger.error("Error in fetchChatGPTResponse", error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        "Ошибка обработки запроса к AI",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async toggleFavoriteMessage({
    userId,
    chatId,
    messageId,
  }: {
    userId: string;
    chatId: number;
    messageId: number;
  }) {
    await this.aiUserService.validateRequestLimit(userId);
    const message = await this.aiChatService.getMessageById(messageId);
    this.logger.log("message to like", message);
    if (message.isLiked) {
      throw new HttpException("Message already liked", HttpStatus.BAD_REQUEST);
    }
    if (
      !message ||
      message.isUser ||
      (message.aiResponseType !== RequestType.MEAL_PLAN &&
        message.aiResponseType !== RequestType.RECIPE)
    ) {
      throw new HttpException(
        "Invalid message for favorite",
        HttpStatus.BAD_REQUEST,
      );
    }

    const mealFrequency = await this.aiUserService.getMealFrequency(userId);
    const { dishDetails, planDetails } = this.aiParsePlanService.parseAiOutput(
      message.rawContent,
      mealFrequency,
    );
    this.logger.log("dishDetails after parse AI output", dishDetails);
    if (dishDetails) {
      const { dishId, planId } =
        await this.aiPlanGeneratorService.saveDishAndPlan({
          dishDetails,
          planDetails,
          userId,
          mealFrequency,
          messageId,
          requestType: message.aiResponseType,
        });

      await this.aiChatService.updateMessage({
        chatId,
        messageId,
        userId,
        newContent: message.content,
        dishId,
        planId,
        isLiked: true,
      });

      return { dishId, planId };
    } else {
      throw new HttpException(
        "Error save plan",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async regenerateMessage({
    userId,
    chatId,
  }: {
    userId: string;
    chatId: number;
  }) {
    try {
      await this.aiUserService.validateRequestLimit(userId);
      const lastAssistantMessage =
        await this.aiChatService.getLastAssistantMessage({
          chatId,
        });
      const lastUserMessage = await this.aiChatService.getLastUserMessage({
        chatId,
        userId,
      });
      this.logger.log("lastUserMessage", lastUserMessage);
      const messages = await this.aiChatService.getChatMessages(chatId);

      return this.aiProcessService.processChatResponse({
        chatId,
        content: lastUserMessage.content,
        messages,
        userId,
        requestType: lastAssistantMessage.aiResponseType,
        userMessage: lastUserMessage,
      });
    } catch (error) {
      this.logger.error("Error in fetchChatGPTResponse", error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        "Ошибка обработки запроса к AI",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
