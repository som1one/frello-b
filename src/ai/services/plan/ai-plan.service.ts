import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Message, RequestType } from "@prisma/client";
import { AiPrepareService } from "../prepare/ai-prepare.service";
import { AiHttpClientService } from "../ai-http-client/ai-http-client.service";
import { AiParsePlanService } from "./ai-parse-plan.service";
import { ChatService } from "src/chat/chat.service";

@Injectable()
export class AiPlanService {
  private readonly logger = new Logger(AiPlanService.name);

  private readonly motivationalPhrases = [
    "Ты на верном пути, продолжай двигаться к своей цели!",
    "Каждый шаг приближает тебя к лучшей версии себя!",
    "Ты справляешься, держи фокус и не сдавайся!",
    "Твоя дисциплина — ключ к успеху, так держать!",
    "Маленькие усилия каждый день приведут к большим результатам!",
  ];

  constructor(
    private readonly aiPrepareService: AiPrepareService,
    private readonly aiHttpClientService: AiHttpClientService,
    private readonly aiParsePlanService: AiParsePlanService,
    private readonly chatService: ChatService,
  ) {}

  // Метод для получения случайной мотивирующей фразы с вероятностью 30%
  private getRandomMotivationalPhrase(): string | null {
    const shouldAddMotivation = Math.random() < 0.3;
    if (!shouldAddMotivation) return null;
    const randomIndex = Math.floor(
      Math.random() * this.motivationalPhrases.length,
    );
    return this.motivationalPhrases[randomIndex];
  }

  async createPlan({
    chatId,
    content,
    messages,
    userId,
    mealFrequency,
    userMessage,
  }: {
    chatId: number;
    content: string;
    messages: Message[];
    userId: string;
    mealFrequency: number;
    userMessage: Message;
  }) {
    const preparedMessageForAI = await this.aiPrepareService.preparePlanMessage(
      {
        content,
        userId,
        mealFrequency,
        messages,
      },
    );

    this.logger.log("preparedMessageForAI", preparedMessageForAI);

    const output = await this.aiHttpClientService.fetchApiResponse(
      preparedMessageForAI,
      { temperature: 0.5 },
    );
    this.logger.log("output", output);

    if (!output?.trim()) {
      throw new HttpException(
        "Failed to generate valid response",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const plan = this.aiParsePlanService.formatPlanOutput(
      output,
      mealFrequency,
    );
    this.logger.log("plan", plan);

    // Получаем мотивирующую фразу
    const motivation = this.getRandomMotivationalPhrase();

    let result = plan;
    if (motivation) {
      result += `\n\n${motivation}`;
    }
    this.logger.log("result", result);

    const assistantMessage = await this.chatService.addMessage({
      chatId,
      userId,
      content: result,
      rawContent: output,
      isUser: false,
      aiResponseType: RequestType.MEAL_PLAN,
    });

    return { userMessage, assistantMessage, type: RequestType.MEAL_PLAN };
  }
}
