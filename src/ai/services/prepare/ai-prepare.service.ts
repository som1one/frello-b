
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Message, RequestType } from "@prisma/client";
import { CreateRecipeDto } from "src/dish/dto/create-recipe.dto";
import { UserSettingsType } from "src/user/types/user";
import { UserService } from "src/user/user.service";
import { AiDishService } from "../dish/ai-dish.service";
import {
  BASE_SYSTEM_MESSAGE,
  BASE_SYSTEM_MESSAGE_V2,
  FRELLO_INSTRUCTION,
  PLAN_CONFIG,
} from "src/ai/model/ai-plan.config";
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

    // ВАЖНО: для обычных текстовых вопросов НЕ используем "плановый" системный промпт,
    // чтобы модель не начинала генерировать планы/JSON без явного запроса.
    const systemMessageContent = `${baseMessage} Ты - Frello, эксперт по питанию и диетологии. НЕ используй **, ***, ---, ###, #, _ и другие символы форматирования. Пиши обычным текстом.`;

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

    const messagesToSend = [
      { role: MessageRole.SYSTEM, content: systemMessageContent },
      ...filteredMessages.map((msg) => ({
        role: msg.isUser ? MessageRole.USER : MessageRole.ASSISTANT,
        content: stripHtml(msg.content),
      })),
      { role: MessageRole.USER, content: `${settingsBlock} Мой запрос: ${content}` },
    ];
    return messagesToSend;
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
      ? `\nИЗБЕГАЙ повторения предыдущих планов.Запрещенные рецепты и структуры: ${previousPlans}. Генерируй полностью новые блюда.`
      : "";

    const systemMessage = `${baseMessage}${settingsBlock}${mealFrequencyInstruction}${avoidInstruction}${planJsonInstruction} `;

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
    // Минимум 4 приёма пищи, но если пользователь выбрал 4+ - используем его выбор
    const actualMealFrequency = mealFrequency >= 4 ? mealFrequency : 4;
    
    const { baseMessage, settingsBlock, settingsStr, userSettings } =
      await this.basePrepareMessage({ userId: userId, mealFrequency: actualMealFrequency });

    const calculatedCalories = this.calculateTargetCalories(userSettings);
    this.logger.log(`[preparePlanMessage] Calculated calories for user: ${calculatedCalories}`);
    
    // Если расчет дал результат, логируем для отладки
    if (calculatedCalories) {
      this.logger.log(`[preparePlanMessage] Using calculated target calories: ${calculatedCalories} ккал`);
    } else {
      this.logger.warn(`[preparePlanMessage] Could not calculate target calories, AI will calculate itself`);
    }
    
    const { mealFrequencyInstruction, planJsonInstruction, mealLabels } =
      this.preparePlan({
        mealFrequency: actualMealFrequency,
        userSettings,
        settingsStr,
        targetCalories: calculatedCalories,
      });

    // НОВОЕ: Извлекаем ограничения из последних сообщений пользователя
    const recentUserMessages = messages
      .filter(msg => msg.isUser && msg.content)
      .slice(-10)
      .map(msg => msg.content.toLowerCase());

    const forbiddenKeywords = [
      'не люблю', 'убери', 'без ', 'удали', 'замени',
      'не хочу', 'исключи', 'избегай', 'нельзя'
    ];

    const extractedRestrictions: string[] = [];
    recentUserMessages.forEach(msg => {
      forbiddenKeywords.forEach(keyword => {
        if (msg.includes(keyword)) {
          extractedRestrictions.push(msg);
        }
      });
    });

    const restrictionsWarning = extractedRestrictions.length > 0
      ? `\n\nКРИТИЧЕСКИ ВАЖНО - ОГРАНИЧЕНИЯ ИЗ ЧАТА: \nПользователь недавно писал: \n${extractedRestrictions.map(r => `- "${r}"`).join('\n')} \n\nЭТО ОЗНАЧАЕТ, ЧТО ТЫ ДОЛЖЕН ПОЛНОСТЬЮ ИСКЛЮЧИТЬ ЭТИ ПРОДУКТЫ / БЛЮДА ИЗ ПЛАНА!\nНЕ используй их НИ В КАКОМ ВИДЕ! НЕ пиши "замена" в скобках - просто НЕ ВКЛЮЧАЙ их!`
      : '';

    const hasHistory = messages.some(m => !m.isUser);
    
    // Если в чате уже был план питания - требуем новый уникальный план
    const previousPlans = messages
      .filter(m => !m.isUser && m.aiResponseType === RequestType.MEAL_PLAN)
      .slice(-2)
      .map(m => stripHtml(m.content))
      .join('\n\n')
      .slice(0, 2000); // Ограничиваем длину
    
    const varietyInstruction = previousPlans
      ? `\n\nКРИТИЧЕСКИ ВАЖНО - РАЗНООБРАЗИЕ: В этом чате уже был план питания. Создай ПОЛНОСТЬЮ НОВЫЙ план с ДРУГИМИ блюдами. НЕ повторяй блюда из предыдущего плана. Используй другие рецепты и комбинации.`
      : '';

    // НОВОЕ: Обработка гибких дней
    const flexibleDays = Array.isArray(userSettings.flexibleDays) ? userSettings.flexibleDays : [];
    const actualPlanDays = 7 - flexibleDays.length;
    const flexibleDaysInstruction = flexibleDays.length > 0
      ? `\n\nКРИТИЧЕСКИ ВАЖНО - ГИБКИЕ ДНИ: \nПользователь указал ${flexibleDays.length} гибких дня: ${flexibleDays.join(', ')}.\nГенерируй план ТОЛЬКО на ${actualPlanDays} дней(исключая гибкие дни)!\nНЕ создавай меню для гибких дней!\nПример: если гибкие дни - пятница и суббота, создай план только на понедельник, вторник, среду, четверг, воскресенье(5 дней).`
      : '';

    // Inject current date into prompt
    // Inject current date into prompt
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const currentDate = `${day}.${month}.${year}`;
    let instructionWithDate = FRELLO_INSTRUCTION.replace('{{CURRENT_DATE}}', currentDate);
    // Add reinforcement to generate full plan
    instructionWithDate += " ПОСЛЕ ВСЕХ РАСЧЕТОВ ОБЯЗАТЕЛЬНО ВЫВЕДИ ПОЛНЫЙ ПЛАН ПИТАНИЯ.";

    const fullUserInstruction = `${instructionWithDate} ${settingsBlock}${mealFrequencyInstruction}${restrictionsWarning}${varietyInstruction}${flexibleDaysInstruction}${planJsonInstruction} `;
    const systemMessage = baseMessage;

    this.logger.log('=== FULL USER INSTRUCTION ===');
    this.logger.log(fullUserInstruction);
    this.logger.log('=== END USER INSTRUCTION ===');

    const filteredMessages = messages.filter(
      (msg) => msg.content && msg.content.trim() !== "",
    );

    const uniqueMessages = filteredMessages
      .filter(
        (msg) => !(msg.isUser && msg.content === content),
      )
      .slice(-15); // Ограничиваем до последних 15 сообщений для планов питания

    const messagesToSend = [
      ...(systemMessage ? [{ role: MessageRole.SYSTEM, content: systemMessage }] : []),
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
        content: `${fullUserInstruction} Мой запрос: ${content}. [Запрос ID: ${Date.now()}-${Math.random().toString(36).substring(7)}]`,
      },
    ];
    return messagesToSend;
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
Верни ТОЛЬКО валидный JSON (без текста вокруг) по схеме ниже.

СХЕМА (ОДНА ПОРЦИЯ):
{
  "name": "string",
  "ingredients": [
    { "name": "string", "grams": number, "proteins": number, "fats": number, "carbs": number, "calories": number }
  ],
  "instruction": "string",
  "cookingTime": number,
  "portionSize": number,
  "proteins": number,
  "fats": number,
  "carbs": number,
  "calories": number
}

ПРАВИЛА (КРИТИЧЕСКИ ВАЖНО):
- "name" — название блюда на русском, строго соответствует "${dto?.recipeName || "запросу пользователя"}". Используй РЕАЛЬНЫЕ существующие рецепты, не придумывай несуществующие блюда.
- "ingredients" — МАССИВ, а не строка. Для каждого ингредиента укажи grams и его БЖУ/калории НА ЭТУ ПОРЦИЮ.
- Итоговые "proteins/fats/carbs/calories" — это СУММА по всем ингредиентам (по этой порции).
- Всегда соблюдай формулу энергетики (проверка):
  calories = proteins×4 + fats×9 + carbs×4 (допуск ±5 ккал из‑за округлений).
- "portionSize" — итоговый вес порции (в граммах). Должен быть РЕАЛИСТИЧНЫМ: обычно 200-400г для основных блюд, 100-200г для легких блюд/салатов. Должен соответствовать ингредиентам (примерно сумма граммов с учетом термообработки).
- РЕАЛИСТИЧНОСТЬ ингредиентов:
  * Используй РЕАЛЬНЫЕ продукты (курица, рис, овощи, яйца, творог и т.д.), не придумывай несуществующие.
  * Количество ингредиентов должно быть реалистичным (например, 150г куриной грудки, 100г риса, 50г овощей, а не 5г курицы или 1000г риса).
  * БЖУ ингредиентов должны соответствовать реальным значениям продуктов (курица ~23г белка/100г, рис ~7г белка/100г, и т.д.).
- Если задана целевая калорийность: calories ДОЛЖНО быть близко к ${dto?.calories ?? "целевой калорийности из запроса"} (допуск ±30 ккал). Если не сходится — подгони grams ингредиентов, а не просто перепиши число.
- НЕЛЬЗЯ: написать ингредиенты так, чтобы по ним выходило 700+ ккал, а в calories указать 300–400. Всегда проверяй сумму.
- ЕСЛИ нет чисел (calories/portionSize или у ингредиентов) — ответ считается НЕДЕЙСТВИТЕЛЬНЫМ, пересчитай и выдай корректные числа.

${settingsStr}.
ТОЛЬКО JSON, без markdown/пояснений/приветствий.`;

    const userContent =
      content ||
      `Рецепт ${dto?.recipeName}. Выдай один JSON объект, в котором будет один рецепт с ${dto?.calories} ккал`;

    return [
      {
        role: MessageRole.SYSTEM,
        content: `${baseMessage}${settingsBlock}${recipeInstruction} `,
      },
      { role: MessageRole.USER, content: userContent },
    ];
  }

  private async basePrepareMessage({ userId, mealFrequency }: { userId: string; mealFrequency?: number }) {
    const userSettings = await this.getUserSettings(userId);
    const settingsStr = userSettings
      ? (() => {
        // Calculate age
        const birthDateStr = userSettings.birthDate || (userSettings as any).birthdate || (userSettings as any).dateOfBirth;
        let age = 'не указано';
        if (birthDateStr) {
          const birthDate = new Date(birthDateStr);
          if (!isNaN(birthDate.getTime())) {
            const today = new Date();
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
              calculatedAge--;
            }
            age = calculatedAge.toString();
          }
        }

        // 1. Основные параметры (скалярные значения)
        const coreFields = [
          `mealFrequency: ${mealFrequency ?? userSettings.mealFrequency ?? 'не указано'} `,
          `gender: ${userSettings.gender ?? 'не указано'} `,
          `height: ${userSettings.height ? userSettings.height + 'cm' : 'не указано'} `,
          `weight: ${userSettings.weight ? userSettings.weight + 'kg' : 'не указано'} `,
          `age: ${age} `,
          `birthdate: ${birthDateStr || 'не указано'} `,
          `nutritionGoal: ${userSettings.nutritionGoal ?? 'не указано'} `,
        ];

        // 2. Обработка массивов и сложных полей (аллергии, предпочтения и т.д.)
        const arrayFields = Object.entries(userSettings)
          .filter(([key]) =>
            !['email', 'password', 'id', 'userId', 'createdAt', 'updatedAt', 'mealFrequency', 'gender', 'height', 'weight', 'birthDate', 'birthdate', 'dateOfBirth', 'nutritionGoal', 'currentProducts'].includes(key) &&
            !key.endsWith("CustomInputs")
          )
          .map(([key, value]) => {
            if (value == null || (Array.isArray(value) && value.length === 0))
              return null;

            // Поля, для которых мы отправляем ТОЛЬКО уточнения (customInputs), игнорируя сами категории
            const fieldsOnlyCustomInput = ['favoriteFoods', 'mealTimePreferences'];

            // Получаем customInputs для текущего поля
            const customInputsKey = `${key}CustomInputs` as keyof typeof userSettings;
            const customInputs = (userSettings[customInputsKey] as Record<string, string> | undefined) || {};

            const valuesToUse: string[] = [];

            if (Array.isArray(value)) {
              value.forEach((item: string) => {
                const cleanItem = item.trim();
                const customInputVal = customInputs[item];

                // Check if this is a placeholder item (contains 'указать' or 'введите')
                const isPlaceholderItem = item.toLowerCase().includes('(указать)') || item.toLowerCase().includes('(введите)');

                if (customInputVal && customInputVal.trim()) {
                  // If user provided custom input
                  if (fieldsOnlyCustomInput.includes(key) || isPlaceholderItem) {
                    // For specific fields or placeholders, use ONLY the custom input
                    if (key === 'mealTimePreferences') {
                      valuesToUse.push(`${cleanItem}: ${customInputVal.trim()}`);
                    } else {
                      valuesToUse.push(customInputVal.trim());
                    }
                  } else {
                    // For other fields, include BOTH the category/item AND the custom input explanation
                    // Example: "Морепродукты (уточнение: креветки)"
                    if (cleanItem.toLowerCase() !== 'другое' && cleanItem.toLowerCase() !== 'нет') {
                      valuesToUse.push(`${cleanItem} (${customInputVal.trim()})`);
                    } else {
                      // If item is 'Other', just use the custom input
                      valuesToUse.push(customInputVal.trim());
                    }
                  }
                } else if (!isPlaceholderItem && !fieldsOnlyCustomInput.includes(key)) {
                  // If NO custom input, and NOT a placeholder/special field, use the category
                  if (cleanItem.toLowerCase() !== 'другое' && cleanItem.toLowerCase() !== 'нет') {
                    valuesToUse.push(cleanItem);
                  }
                }
                // If it's a placeholder item/special field but no custom input was provided, skip it entirely
              });
            } else {
              const strVal = String(value);
              const cleanVal = strVal.trim();
              if (cleanVal.toLowerCase() !== 'другое' && cleanVal.toLowerCase() !== 'нет') {
                valuesToUse.push(cleanVal);
              }
            }

            if (valuesToUse.length === 0) return null;

            // Маппинг ключей полей на русские названия
            const fieldLabels: Record<string, string> = {
              'favoriteFoods': 'Любимые продукты, блюда и напитки',
              'cookingPreferences': 'Предпочтения по приготовлению',
              'cookingTimeConstraints': 'Временные ограничения на готовку.',
              'allergies': 'Аллергии и непереносимости',
              'dietType': 'Тип диеты',
              'personalRestrictions': 'Личные ограничения',
              'mealTimePreferences': 'Предпочтения по времени приема пищи',
              'nutritionPreferences': 'Предпочтения по калорийности и макронутриентам',
              // 'seasonalPreferences': 'Сезонные и экологические предпочтения',
              'budgetPreferences': 'Бюджетные предпочтения',
              'cookingExperience': 'Опыт в кулинарии',
              'activityLevel': 'Уровень активности',
              'flexibleDayFrequency': 'Частота гибких дней',
              // 'flexibleDayType': 'Тип гибкого дня',
              'flexibleDays': 'Конкретные гибкие дни'
              // 'hasOven': 'Есть ли у вас доступ к духовке?' - убрано, не используется
              // 'currentProducts': 'Продукты, которые у пользователя есть' - убрано, не используется
            };

            const fieldLabel = fieldLabels[key] || key;
            return `${fieldLabel}: ${valuesToUse.join(", ")} `;
          })
          .filter(Boolean);

        // Поле currentProducts убрано - не используется в промпте
        // const currentProductsField = userSettings.currentProducts
        //   ? `Продукты, которые у пользователя есть: ${userSettings.currentProducts}`
        //   : null;

        const allFields = [...coreFields, ...arrayFields];
        // Вставка currentProducts убрана

        return allFields.join("; ");
      })()
      : "";

    this.logger.log(`Settings string for user ${userId}: ${settingsStr} `);

    // Добавляем информацию о текущем дне недели
    const now = new Date();
    const daysOfWeek = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const currentDayOfWeek = daysOfWeek[now.getDay()];
    const currentDate = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    const dateInfo = `\nТекущая дата: ${currentDate}, день недели: ${currentDayOfWeek} `;

    const settingsBlock = settingsStr
      ? `[ДАННЫЕ ДЛЯ РАСЧЁТОВ - НЕ ВЫВОДИТЬ В ОТВЕТЕ]: ${settingsStr}`
      : "";

    return {
      // Используем новый промпт с алгоритмом расчета калорий
      baseMessage: BASE_SYSTEM_MESSAGE,
      settingsStr,
      settingsBlock,
      userSettings,
    };
  }

  private calculateTargetCalories(userSettings: any): number | null {
    try {
      const weight = parseFloat(userSettings.weight);
      const height = parseFloat(userSettings.height);
      const birthDateStr = userSettings.birthDate || userSettings.birthdate || userSettings.dateOfBirth || (userSettings as any).birth_date;
      const gender = userSettings.gender;

      // Handle activityLevel - it might be array or object
      let activityStr = '';
      const activityRaw = userSettings.activityLevel || userSettings.activity || (userSettings as any).activity_level;
      if (Array.isArray(activityRaw)) {
        activityStr = activityRaw[0] || '';
      } else if (typeof activityRaw === 'object' && activityRaw !== null) {
        activityStr = activityRaw.toString();
      } else {
        activityStr = String(activityRaw || '');
      }

      // Handle nutritionGoal - it might be array or object
      let goal = '';
      const goalRaw = userSettings.nutritionGoal || '';
      if (Array.isArray(goalRaw)) {
        goal = goalRaw[0] || '';
      } else if (typeof goalRaw === 'object' && goalRaw !== null) {
        goal = goalRaw.toString();
      } else {
        goal = String(goalRaw || '');
      }

      // Calculate Age
      let age = 30; // Default fallback

      if (birthDateStr) {
        const birthDate = new Date(birthDateStr);
        if (!isNaN(birthDate.getTime())) {
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
        }
      } else if (userSettings.age) {
        age = parseInt(String(userSettings.age), 10);
      } else if (userSettings.ageRange) {
        // Handle Age Range Enum or string
        const range = String(userSettings.ageRange);
        if (range.includes('3-17')) age = 15;
        else if (range.includes('18-29')) age = 24;
        else if (range.includes('30-39')) age = 35;
        else if (range.includes('40-49')) age = 45;
        else if (range.includes('50')) age = 55;
      }

      console.log(`[CalculateTargetCalories] Using age: ${age}`);

      console.log(`[CalculateTargetCalories] Input: weight=${weight}, height=${height}, age=${age}, gender=${gender}, activity=${activityStr}, goal=${goal}`);

      if (!weight || !height || !birthDateStr || !gender) {
        console.log('[CalculateTargetCalories] Missing required data');
        return null;
      }

      // Calculate BMR (Mifflin-St Jeor)
      let bmr = (10 * weight) + (6.25 * height) - (5 * age);
      if (gender.toLowerCase().includes('жен') || gender.toLowerCase() === 'female') {
        bmr -= 161;
      } else {
        bmr += 5;
      }

      // Activity Multiplier
      let activityMultiplier = 1.2; // Default to minimal
      const act = activityStr.toLowerCase();
      if (act.includes('минимальн') || act.includes('сидячий')) activityMultiplier = 1.2;
      else if (act.includes('слаб') || act.includes('легк')) activityMultiplier = 1.375;
      else if (act.includes('средн') || act.includes('умерен')) activityMultiplier = 1.55;
      else if (act.includes('высок') || act.includes('тяжел')) activityMultiplier = 1.725;
      else if (act.includes('экстра') || act.includes('экстрем')) activityMultiplier = 1.9;

      const tdee = bmr * activityMultiplier;

      // Calculate BMI
      const heightInMeters = height / 100;
      const bmi = weight / (heightInMeters * heightInMeters);

      // Determine Minimum Calories based on BMI
      let minCalories = 0;
      const isFemale = gender.toLowerCase().includes('жен') || gender.toLowerCase() === 'female';

      if (bmi < 30) {
        minCalories = isFemale ? 1400 : 1800;
      } else if (bmi >= 30 && bmi < 40) {
        minCalories = isFemale ? 1600 : 2000;
      } else if (bmi >= 40) {
        minCalories = isFemale ? 1800 : 2200;
      }

      // Calculate Target based on Goal
      let target = tdee;
      const g = goal.toLowerCase();

      if (g.includes('похуден') || g.includes('сброс') || g.includes('weight loss')) {
        let deficit = 500;
        if (bmi >= 30 && bmi < 40) deficit = 750; // Average of 700-800
        if (bmi >= 40) deficit = 900; // Average of 800-1000
        target = tdee - deficit;
      } else if (g.includes('набор') || g.includes('мышц') || g.includes('muscle')) {
        target = tdee + 400; // Average of 300-500
      } else if (g.includes('спорт')) {
        target = tdee + 400;
      }

      // Apply Minimum Rule
      if (target < minCalories) {
        console.log(`[CalculateTargetCalories] Target ${target} is below minimum ${minCalories}, using minimum`);
        target = minCalories;
      }

      const result = Math.round(target);
      console.log(`[CalculateTargetCalories] Final result: ${result} kcal (BMR: ${bmr.toFixed(0)}, TDEE: ${tdee.toFixed(0)}, BMI: ${bmi.toFixed(1)}, Min: ${minCalories})`);
      return result;
    } catch (e) {
      console.error('Error calculating calories:', e);
      return null;
    }
  }

  preparePlan({
    mealFrequency,
    userSettings,
    settingsStr,
    targetCalories,
    isRegenerate = false,
  }: {
    mealFrequency: number;
    userSettings: Partial<UserSettingsType>;
    settingsStr: string;
    targetCalories?: number | null;
    isRegenerate?: boolean;
  }): { mealFrequencyInstruction: string; planJsonInstruction: string; mealLabels: any } {
    const mealLabels = getMealLabels(
      mealFrequency,
      userSettings?.customMealLabels,
    );
    const mealTypes = Object.keys(mealLabels).slice(0, mealFrequency);
    const mealNames = Object.values(mealLabels).slice(0, mealFrequency);



    const mealFrequencyInstruction = `Количество приёмов пищи: ${mealFrequency}`;

    // Если норма рассчитана — передаём ЯВНО, AI не может её менять
    const calorieTarget = targetCalories 
      ? `КРИТИЧЕСКИ ВАЖНО - СУТОЧНАЯ НОРМА КАЛОРИЙ: ${targetCalories} ккал.
      
ЗАПРЕЩЕНО:
- Менять это число
- Пересчитывать норму
- Использовать другое значение
- Писать "Ваша суточная норма калорий: X ккал" с другим числом

ОБЯЗАТЕЛЬНО:
- Используй РОВНО ${targetCalories} ккал
- Сумма калорий всех приёмов пищи за день = ${targetCalories} ккал (±30 ккал)
- В заголовке пиши: "Ваша суточная норма калорий: ${targetCalories} ккал."` 
      : 'Рассчитай суточную норму калорий по формуле Миффлина-Сан Жеора.';

    const realismInstruction = `
РЕАЛИСТИЧНОСТЬ (КРИТИЧЕСКИ ВАЖНО):
- Названия блюд: используй РЕАЛЬНЫЕ существующие рецепты (например: "Омлет с овощами", "Куриная грудка с рисом", "Творожная запеканка", "Греческий салат", "Салат Цезарь", "Паста карбонара", "Тушеная говядина с овощами"). НЕ придумывай несуществующие блюда.
- Порции (в граммах): завтрак 200-350г, обед 300-450г, ужин 250-400г, перекусы 100-200г. Порции должны быть реалистичными для типа блюда.
- Калории должны соответствовать типу блюда и порции:
  * Завтрак: 300-600 ккал (обычно 400-500 ккал)
  * Обед: 400-800 ккал (обычно 500-700 ккал)
  * Ужин: 300-600 ккал (обычно 400-500 ккал)
  * Перекусы: 100-300 ккал (обычно 150-250 ккал)

СООТНОШЕНИЕ КАЛОРИЙ И ГРАММОВ ПО ТИПАМ БЛЮД (КРИТИЧЕСКИ ВАЖНО!):
1. САЛАТЫ: 0.3-0.8 ккал/г
   ✅ 300г салата = 100-240 ккал (обычно 150-200 ккал)
   ❌ 300г салата = 400 ккал ❌ (слишком много!)

2. СУПЫ: 0.4-0.9 ккал/г
   ✅ 350г супа = 140-315 ккал (обычно 200-280 ккал)
   ❌ 350г супа = 500 ккал ❌ (слишком много!)

3. ОБЫЧНЫЕ БЛЮДА (мясо/рыба с гарниром): 1.2-2.0 ккал/г
   ✅ 300г курицы с рисом = 360-600 ккал (обычно 450-550 ккал)
   ✅ 400г блюда = 480-800 ккал (обычно 550-750 ккал)
   ❌ 400г блюда = 900 ккал ❌ (слишком много!)

4. ПАСТА/КАШИ/ГАРНИРЫ: 1.0-1.8 ккал/г
   ✅ 300г пасты = 300-540 ккал (обычно 400-500 ккал)
   ❌ 300г пасты = 700 ккал ❌ (слишком много!)

5. ЗАВТРАКИ (омлеты, каши, творог): 1.0-1.8 ккал/г
   ✅ 250г омлета = 250-450 ккал (обычно 300-400 ккал)
   ❌ 250г омлета = 600 ккал ❌ (слишком много!)

6. ПЕРЕКУСЫ: 0.8-2.0 ккал/г (орехи до 6 ккал/г - это нормально)
   ✅ 150г творога = 120-300 ккал (обычно 180-250 ккал)
   ❌ 150г творога = 400 ккал ❌ (слишком много!)

7. ЖИРНЫЕ БЛЮДА: 1.8-2.5 ккал/г (МАКСИМУМ!)
   ✅ 400г жирного блюда = 720-1000 ккал (максимум!)
   ❌ 400г блюда = 1100 ккал ❌ (нереалистично!)

ПРАВИЛО: Определяй тип блюда по названию и используй соответствующий диапазон!
- Блюда должны быть разнообразными и сбалансированными по БЖУ.`;

    const planJsonInstruction = `${calorieTarget}${realismInstruction}`;

    return { mealFrequencyInstruction, planJsonInstruction, mealLabels };
  }

  async getUserSettings(userId: string): Promise<Partial<UserSettingsType>> {
    try {
      const settings = await this.userService.getSettings(userId);
      this.logger.log(`[getUserSettings] Fetched settings for user ${userId}: `, JSON.stringify(settings, null, 2));
      return settings;
    } catch (error) {
      this.logger.error("Failed to fetch user settings", error);
      throw new HttpException(
        "Failed to fetch user settings",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
