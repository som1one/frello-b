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
  ) { }

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
    // Get user settings to validate BMI
    const userSettings = await this.aiPrepareService.getUserSettings(userId);

    // Calculate BMI if we have weight and height
    if (userSettings.weight && userSettings.height) {
      const heightInMeters = userSettings.height / 100;
      const bmi = userSettings.weight / (heightInMeters * heightInMeters);

      this.logger.log(`BMI Calculation: weight=${userSettings.weight}kg, height=${userSettings.height}cm, heightInMeters=${heightInMeters}m, BMI=${bmi.toFixed(2)}`);

      // Check if BMI < 18.5 AND goal is weight loss
      const isWeightLossGoal = Array.isArray(userSettings.nutritionGoal)
        ? userSettings.nutritionGoal.some(goal => goal.toLowerCase().includes('похудение'))
        : userSettings.nutritionGoal?.toLowerCase().includes('похудение');

      if (bmi < 18.5 && isWeightLossGoal) {
        const bmiWarning = `❌ ВНИМАНИЕ: Ваш ИМТ составляет ${bmi.toFixed(1)}, что значительно ниже нормы (18.5-24.9). Снижение веса при таких показателях приведет к истощению организма, потере мышечной массы и нарушению работы жизненно важных систем. Пожалуйста, измените цель, например, на поддержание веса.`;

        this.logger.log(`BMI validation failed: BMI=${bmi.toFixed(1)}, goal=weight loss. Returning warning.`);

        const assistantMessage = await this.chatService.addMessage({
          chatId,
          userId,
          content: bmiWarning,
          rawContent: bmiWarning,
          isUser: false,
          aiResponseType: RequestType.TEXT,
        });

        return { userMessage, assistantMessage, type: RequestType.TEXT };
      }
    }

    // Парсим запрос пользователя на количество дней
    const requestedDays = this.parseRequestedDays(content);
    this.logger.log(`User requested ${requestedDays} day(s)`);

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
      { temperature: 0.5, maxTokens: 8192 },
    );
    this.logger.log("output", output);

    if (!output?.trim()) {
      throw new HttpException(
        "Failed to generate valid response",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let plan = this.aiParsePlanService.formatPlanOutput(
      output,
      mealFrequency,
    );

    // КРИТИЧЕСКИ ВАЖНО: Обрезаем план до запрошенного количества дней
    if (requestedDays !== null) {
      plan = this.limitPlanToDays(plan, requestedDays);
      this.logger.log(`Plan limited to ${requestedDays} day(s)`);
    }

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

  // Парсит запрос пользователя и определяет количество дней
  private parseRequestedDays(content: string): number | null {
    const lowerContent = content.toLowerCase();

    // Проверяем на "1 день", "один день", "план на день"
    if (lowerContent.match(/\b(1|один)\s*(день|дня)\b/) ||
      lowerContent.match(/\bплан\s+на\s+день\b/)) {
      return 1;
    }

    // Проверяем на "неделю", "7 дней"
    if (lowerContent.match(/\b(неделю|недели|7\s*дней)\b/)) {
      return 7;
    }

    // Проверяем на конкретное число дней (например, "3 дня", "5 дней")
    const match = lowerContent.match(/\b(\d+)\s*(день|дня|дней)\b/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return null; // Если не удалось определить
  }

  // Обрезает план до указанного количества дней
  private limitPlanToDays(plan: string, maxDays: number): string {
    // Ищем все заголовки дней (например, "**День 1:**", "**День 2:**")
    const dayPattern = /\*\*День\s+\d+:?\*\*/gi;
    const matches = [...plan.matchAll(dayPattern)];

    if (matches.length <= maxDays) {
      return plan; // План уже содержит нужное количество дней или меньше
    }

    // Находим позицию, где начинается (maxDays + 1)-й день
    const cutoffIndex = matches[maxDays].index;

    // Обрезаем план
    return plan.substring(0, cutoffIndex).trim();
  }
}
