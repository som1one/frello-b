import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Message } from "@prisma/client";
import { CreateRecipeDto } from "src/dish/dto/create-recipe.dto";
import { UserSettingsType } from "src/user/types/user";
import { UserService } from "src/user/user.service";
import { AiDishService } from "../dish/ai-dish.service";
import { BASE_SYSTEM_MESSAGE, PLAN_CONFIG } from "src/ai/model/ai-plan.config";
import { stripHtml } from "src/ai/model/stripHtml";
import { getMealLabels } from "src/ai/model/meal-labels";

export enum MessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
}

export interface PrepareMessage {
  role: MessageRole;
  content: string;
}

@Injectable()
export class AiPrepareService {
  private readonly logger = new Logger(AiPrepareService.name);

  private readonly motivationalPhrases = [
    "Ты на верном пути, продолжай двигаться к своей цели!",
    "Каждый шаг приближает тебя к лучшей версии себя!",
    "Ты справляешься, держи фокус и не сдавайся!",
    "Твоя дисциплина — ключ к успеху, так держать!",
    "Маленькие усилия каждый день приведут к большим результатам!",
  ];

  constructor(
    private readonly userService: UserService,
    private readonly aiDishService: AiDishService,
  ) { }

  private getRandomMotivationalPhrase(): string | null {
    const shouldAddMotivation = Math.random() < 0.3;
    if (!shouldAddMotivation) return null;
    const randomIndex = Math.floor(
      Math.random() * this.motivationalPhrases.length,
    );
    return this.motivationalPhrases[randomIndex];
  }

  async prepareSimpleMessage({
    userId,
    content,
    messages,
    maxContextMessages,
    skipContext = false,
  }: {
    userId: string;
    content: string;
    messages: Message[];
    maxContextMessages?: number;
    skipContext?: boolean;
  }): Promise<PrepareMessage[]> {
    const { baseMessage, settingsBlock } = await this.basePrepareMessage({
      userId: userId,
    });
    const motivation = this.getRandomMotivationalPhrase();
    const motivationInstruction = motivation
      ? `\nДобавь в ответ мотивирующую фразу: "${motivation}"`
      : "";
    const textInstruction = `\n
			Отвечай в текстовом формате, без JSON, кратко
			и по делу, учитывая настройки пользователя.${motivationInstruction}`;

    // Ограничиваем контекст до последних 25 сообщений по умолчанию для ускорения работы
    // Это достаточно для понимания контекста, но не перегружает запрос
    const defaultContextLimit = 25;
    const filteredMessages = skipContext
      ? []
      : messages
        .filter(
          (msg) =>
            msg.content &&
            msg.content.trim() !== "" &&
            !(msg.isUser && msg.content === content),
        )
        .slice(maxContextMessages ? -maxContextMessages : -defaultContextLimit);

    const systemMessage = `${baseMessage}${settingsBlock}${textInstruction}`;
    return [
      { role: MessageRole.SYSTEM, content: systemMessage },
      ...filteredMessages.map((msg) => ({
        role: msg.isUser ? MessageRole.USER : MessageRole.ASSISTANT,
        content: stripHtml(msg.content),
      })),
      { role: MessageRole.USER, content },
    ];
  }

  async prepareRegeneratePlan({
    userId,
    content,
    messages,
    mealFrequency,
  }: {
    userId: string;
    content: string;
    messages: Message[];
    mealFrequency: number;
  }): Promise<PrepareMessage[]> {
    const { baseMessage, settingsBlock, settingsStr, userSettings } =
      await this.basePrepareMessage({ userId: userId });

    const { mealFrequencyInstruction, planJsonInstruction } = this.preparePlan({
      mealFrequency,
      userSettings,
      settingsStr,
      isRegenerate: true,
    });

    const filteredMessages = messages.filter(
      (msg) => msg.content && msg.content.trim() !== "",
    );

    const previousPlans = filteredMessages
      .filter((msg) => !msg.isUser)
      .slice(-3)
      .map((msg) => stripHtml(msg.content))
      .join("\n\n")
      .slice(0, 5000); // Ограничение длины увеличина до 5000 для лучшего контекста

    const avoidInstruction = previousPlans
      ? `\nИЗБЕГАЙ повторения предыдущих планов. Запрещенные рецепты и структуры: ${previousPlans}. Генерируй полностью новые блюда.`
      : "";

    const systemMessage = `${baseMessage}${settingsBlock}${mealFrequencyInstruction}${avoidInstruction}${planJsonInstruction}`;

    const uniqueMessages = filteredMessages.filter(
      (msg) => !(msg.isUser && msg.content === content),
    );

    // Ограничиваем контекст до последних 6, убираем дубли assistant/user
    let recentContext = uniqueMessages.slice(-6).map((msg) => ({
      role: msg.isUser ? MessageRole.USER : MessageRole.ASSISTANT,
      content: msg.dishId
        ? JSON.stringify(
          this.aiDishService.parseDishFromText(msg.content, msg.dishId) ?? {
            content: stripHtml(msg.content),
          },
        )
        : stripHtml(msg.content),
    }));

    // Фильтр на последовательные роли
    recentContext = recentContext.filter(
      (msg, i) => i === 0 || msg.role !== recentContext[i - 1].role,
    );

    return [
      { role: MessageRole.SYSTEM, content: systemMessage },
      ...recentContext,
      { role: MessageRole.USER, content },
    ];
  }

  async preparePlanMessage({
    userId,
    content,
    messages,
    mealFrequency,
  }: {
    userId: string;
    content: string;
    messages: Message[];
    mealFrequency: number;
  }): Promise<PrepareMessage[]> {
    const { baseMessage, settingsBlock, settingsStr, userSettings } =
      await this.basePrepareMessage({ userId: userId });

    const { mealFrequencyInstruction, planJsonInstruction, mealLabels } =
      this.preparePlan({
        mealFrequency,
        userSettings,
        settingsStr,
      });

    const systemMessage = `${baseMessage}${settingsBlock}${mealFrequencyInstruction}${planJsonInstruction}`;

    const filteredMessages = messages.filter(
      (msg) => msg.content && msg.content.trim() !== "",
    );

    const uniqueMessages = filteredMessages
      .filter(
        (msg) => !(msg.isUser && msg.content === content),
      )
      .slice(-15); // Ограничиваем до последних 15 сообщений для планов питания

    return [
      { role: MessageRole.SYSTEM, content: systemMessage },
      ...uniqueMessages.map((msg) => ({
        role: msg.isUser ? MessageRole.USER : MessageRole.ASSISTANT,
        content: msg.dishId
          ? JSON.stringify(
            this.aiDishService.parseDishFromText(msg.content, msg.dishId) ?? {
              content: stripHtml(msg.content),
            },
          )
          : stripHtml(msg.content),
      })),
      {
        role: MessageRole.USER,
        content: `${content}. КРИТИЧЕСКИ ВАЖНО: План должен содержать РОВНО ${mealFrequency} приёмов пищи в каждом дне: ${Object.values(mealLabels).join(", ")}. Пропуск или добавление лишних приёмов СТРОГО ЗАПРЕЩЕНО. В ответе используйте формат "День 1", "День 2" и т.д. для обозначения дней.`,
      },
    ];
  }

  async prepareCreateRecipe({
    userId,
    content,
    dto,
  }: {
    userId: string;
    content?: string;
    dto?: CreateRecipeDto;
  }): Promise<PrepareMessage[]> {
    const { baseMessage, settingsBlock, settingsStr } =
      await this.basePrepareMessage({ userId: userId });

    const recipeInstruction = `\n\nСИСТЕМНАЯ ИНСТРУКЦИЯ ДЛЯ ГЕНЕРАЦИИ РЕЦЕПТА:
	Верни ТОЛЬКО валидный JSON-объект с полями: name, ingredients, instruction, proteins, fats, carbs, cookingTime, calories, portionSize.
	СХЕМА:
	{
		"name": "string",
		"ingredients": "string",
		"instruction": "string",
		"proteins": number,
		"fats": number,
		"carbs": number,
		"cookingTime": number,
		"calories": number,
		"portionSize": number
	}
	ПРАВИЛА:
	- "name" — название блюда на русском, строго соответствует "${dto?.recipeName || "запросу пользователя"}".
	- "ingredients" — строка с ингредиентами, разделенными переносами строки (\\n), например: "Картофель - 200 г\\nПаста - 150 г".
	- "instruction" — строка с инструкцией приготовления, разделенная \\n для шагов.
	- "proteins", "fats", "carbs" — числа (г), могут быть 0, если неизвестно.
	- "cookingTime" — целое число (минуты), оцени приблизительно, если неизвестно.
	- "calories" — целое число, строго равно ${dto?.calories || "указанным в запросе"}.
	- Поле "portionSize" — ОБЯЗАТЕЛЬНОЕ целое число в граммах (например, 150, 200, 300), представляющее вес порции блюда. Оцени приблизительно, если точная граммовка неизвестна, но НЕ оставляй поле пустым.
	- Учитывай настройки: ${settingsStr}.
	- ТОЛЬКО JSON, без текста, приветствий, markdown или пояснений.`;

    const userContent =
      content ||
      `Рецепт ${dto?.recipeName}. Выдай один JSON объект, в котором будет один рецепт с ${dto?.calories}ккал`;

    return [
      {
        role: MessageRole.SYSTEM,
        content: `${baseMessage}${settingsBlock}${recipeInstruction}`,
      },
      { role: MessageRole.USER, content: userContent },
    ];
  }

  private async basePrepareMessage({ userId }: { userId: string }) {
    const userSettings = await this.getUserSettings(userId);
    const settingsStr = userSettings
      ? Object.entries(userSettings)
        .filter(([key]) => key !== "email" && key !== "password" && !key.endsWith("CustomInputs"))
        .map(([key, value]) => {
          if (value == null || (Array.isArray(value) && value.length === 0))
            return null;

          // Обрабатываем обычные поля
          let fieldStr = `${key}: ${Array.isArray(value) ? value.join(", ") : value}`;

          // Добавляем customInputs если они есть
          const customInputsKey = `${key}CustomInputs` as keyof typeof userSettings;
          const customInputs = userSettings[customInputsKey] as Record<string, string> | undefined;

          if (customInputs && typeof customInputs === 'object' && Object.keys(customInputs).length > 0) {
            const customInputsStr = Object.entries(customInputs)
              .filter(([_, val]) => val && val.trim())
              .map(([option, val]) => {
                // Убираем "(указать)" и "(введите)" из названия опции
                const cleanOption = option
                  .replace(/\s*\(указать\)\s*/gi, '')
                  .replace(/\s*\(введите\)\s*/gi, '');
                return `${cleanOption}: ${val}`;
              })
              .join(", ");

            if (customInputsStr) {
              fieldStr += ` (уточнения: ${customInputsStr})`;
            }
          }

          return fieldStr;
        })
        .filter(Boolean)
        .join("; ")
      : "";

    // Добавляем информацию о текущем дне недели
    const now = new Date();
    const daysOfWeek = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const currentDayOfWeek = daysOfWeek[now.getDay()];
    const currentDate = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    const dateInfo = `\nТекущая дата: ${currentDate}, день недели: ${currentDayOfWeek}`;

    const settingsBlock = settingsStr
      ? `\nНастройки пользователя: ${settingsStr}${dateInfo}`
      : dateInfo;

    return {
      baseMessage: BASE_SYSTEM_MESSAGE,
      settingsStr,
      settingsBlock,
      userSettings,
    };
  }

  preparePlan({
    mealFrequency,
    userSettings,
    settingsStr,
    isRegenerate = false,
  }: {
    mealFrequency: number;
    userSettings: Partial<UserSettingsType>;
    settingsStr: string;
    isRegenerate?: boolean;
  }) {
    const mealLabels = getMealLabels(
      mealFrequency,
      userSettings?.customMealLabels,
    );
    const mealTypes = Object.keys(mealLabels).slice(0, mealFrequency);
    const mealNames = Object.values(mealLabels).slice(0, mealFrequency);

    const daysInstruction = this.getDaysLimitInstruction();

    const mealFrequencyInstruction = `
ВАЖНО: В каждом дне плана питания ДОЛЖНО быть СТРОГО ${mealFrequency} приёма пищи: ${mealNames.join(", ")}.
Не добавляй лишние приёмы и не пропускай ни один из указанных.`;
    const exampleMeals = mealTypes.map((type, index) => ({
      type,
      recipeName:
        index >= 3
          ? `Перекус ${index - 2}`
          : type === "breakfast"
            ? "Завтрак"
            : type === "lunch"
              ? "Обед"
              : "Ужин",
      calories: PLAN_CONFIG.caloriesRange.min,
      portionSize: PLAN_CONFIG.portionSizeRange.min,
    }));
    const planJsonInstruction = `
СИСТЕМНАЯ ИНСТРУКЦИЯ ДЛЯ ПЛАНОВ ПИТАНИЯ:
${isRegenerate ? "СОЗДАЙ СОВЕРШЕННО НОВЫЙ ответ, отличный по содержанию и структуре от предыдущего. Варьируй все рецепты, калории и порции." : ""}
Учитывай предыдущие сообщения и не повторяй их.
Верни ТОЛЬКО валидный JSON-массив дней, где каждый день — объект с полем "meals".
${daysInstruction}
Каждый "meals" — массив из СТРОГО ${mealFrequency} объектов с полями: ${PLAN_CONFIG.mealSchema.join(", ")}.
СХЕМА:
[
  {
    "meals": [
      ${exampleMeals.map((meal) => JSON.stringify(meal)).join(",\n      ")}
    ]
  }
]
ПРАВИЛА:
- ВСЕГДА возвращай массив, даже если это один день.
- Поле "type" ДОЛЖНО быть одним из: ${mealTypes.join(", ")}.
- Поле "recipeName" — ТОЛЬКО на русском языке (например, "Овсянка с ягодами", "Салат с киноа").
- Поле "calories" — ОБЯЗАТЕЛЬНОЕ целое число в диапазоне ${PLAN_CONFIG.caloriesRange.min}–${PLAN_CONFIG.caloriesRange.max}.
- Поле "portionSize" — ОБЯЗАТЕЛЬНОЕ целое число в граммах (${PLAN_CONFIG.portionSizeRange.min}–${PLAN_CONFIG.portionSizeRange.max}), оцени приблизительно, если неизвестно.
- Количество приёмов пищи в каждом дне: СТРОГО ${mealFrequency}.
- Учитывай настройки: ${settingsStr}.
- ТОЛЬКО JSON, без текста, приветствий, markdown или пояснений.`;
    return { mealFrequencyInstruction, planJsonInstruction, mealLabels };
  }

  private getDaysLimitInstruction(): string {
    return `\n!!! КРИТИЧЕСКИ ВАЖНО ПО КОЛИЧЕСТВУ ДНЕЙ !!!
1. Если пользователь пишет "план на день", "один день", "1 день" -> ГЕНЕРИРУЙ РОВНО 1 ДЕНЬ.
2. Если пользователь пишет "план на неделю", "неделя" -> ГЕНЕРИРУЙ РОВНО 7 ДНЕЙ.
3. Игнорируй любые другие настройки длительности, если они противоречат запросу пользователя.
4. НИКОГДА не генерируй 6 дней, если просят неделю.
5. НИКОГДА не генерируй неделю, если просят 1 день.
6. Строго следуй запрошенному количеству.`;
  }

  async getUserSettings(userId: string): Promise<Partial<UserSettingsType>> {
    try {
      return await this.userService.getSettings(userId);
    } catch (error) {
      this.logger.error("Failed to fetch user settings", error);
      throw new HttpException(
        "Failed to fetch user settings",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
