
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Message } from "@prisma/client";
import { CreateRecipeDto } from "src/dish/dto/create-recipe.dto";
import { UserSettingsType } from "src/user/types/user";
import { UserService } from "src/user/user.service";
import { AiDishService } from "../dish/ai-dish.service";
import {
  BASE_SYSTEM_MESSAGE,
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
      { role: MessageRole.USER, content: `ОБЯЗАТЕЛЬНО УЧТИ МОИ ДАННЫЕ: ${settingsBlock} Мой запрос: ${content}` },
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
    const { baseMessage, settingsBlock, settingsStr, userSettings } =
      await this.basePrepareMessage({ userId: userId, mealFrequency });

    const calculatedCalories = this.calculateTargetCalories(userSettings);
    this.logger.log(`[preparePlanMessage] Calculated calories for user: ${calculatedCalories}`);
    const { mealFrequencyInstruction, planJsonInstruction, mealLabels } =
      this.preparePlan({
        mealFrequency,
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
    const varietyInstruction = '';

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
- "name" — название блюда на русском, строго соответствует "${dto?.recipeName || "запросу пользователя"}".
- "ingredients" — МАССИВ, а не строка. Для каждого ингредиента укажи grams и его БЖУ/калории НА ЭТУ ПОРЦИЮ.
- Итоговые "proteins/fats/carbs/calories" — это СУММА по всем ингредиентам (по этой порции).
- Всегда соблюдай формулу энергетики (проверка):
  calories = proteins×4 + fats×9 + carbs×4 (допуск ±5 ккал из‑за округлений).
- "portionSize" — итоговый вес порции (в граммах). Должен быть реалистичным и соответствовать ингредиентам (примерно сумма граммов с учетом термообработки).
- Если задана целевая калорийность: calories ДОЛЖНО быть близко к ${dto?.calories ?? "целевой калорийности из запроса"} (допуск ±30 ккал). Если не сходится — подгони grams ингредиентов, а не просто перепиши число.
- НЕЛЬЗЯ: написать ингредиенты так, чтобы по ним выходило 700+ ккал, а в calories указать 300–400. Всегда проверяй сумму.

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
              'flexibleDays': 'Конкретные гибкие дни',
              'hasOven': 'Есть ли у вас доступ к духовке?',
              'currentProducts': 'Продукты, которые у пользователя есть'
            };

            const fieldLabel = fieldLabels[key] || key;
            return `${fieldLabel}: ${valuesToUse.join(", ")} `;
          })
          .filter(Boolean);

        // Добавляем поле currentProducts после favoriteFoods
        const currentProductsField = userSettings.currentProducts
          ? `Продукты, которые у пользователя есть: ${userSettings.currentProducts}`
          : null;

        const allFields = [...coreFields, ...arrayFields];
        // Вставляем currentProducts после favoriteFoods
        const favoriteFoodsIndex = allFields.findIndex(field => field && field.includes('Любимые продукты, блюда и напитки'));
        if (favoriteFoodsIndex !== -1 && currentProductsField) {
          allFields.splice(favoriteFoodsIndex + 1, 0, currentProductsField);
        } else if (currentProductsField) {
          allFields.push(currentProductsField);
        }

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
      ? `ОБЯЗАТЕЛЬНО УЧТИ МОИ ДАННЫЕ: ${settingsStr}`
      : "";

    return {
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



    const mealFrequencyInstruction = ``;

    const exampleMeals = [
      { type: "breakfast", recipeName: "Овсяная каша с ягодами", calories: 350 },
      { type: "lunch", recipeName: "Куриный суп с лапшой", calories: 450 },
      { type: "dinner", recipeName: "Запеченная рыба с овощами", calories: 400 }
    ];

    const calorieTarget = targetCalories ? ` ЦЕЛЕВАЯ КАЛОРИЙНОСТЬ: ${targetCalories} ккал в день. Сумма всех \"calories\" за день ДОЛЖНА быть ${targetCalories} (±50 ккал).` : '';

    const planJsonInstruction = `\n\nВерни ТОЛЬКО фразу «Ваша суточная норма калорий для достижения вашей цели: ${targetCalories || '[итоговое выбранное число калорий в день]'} ккал. План на [количество] дней:» и JSON-массив дней, где каждый день - объект с полем "meals". Каждый "meals" - массив объектов с полями: type, recipeName, calories, portionSize.

СХЕМА: 
Ваша суточная норма калорий для достижения вашей цели: ${targetCalories || '[число]'} ккал.
План на [количество] дней:
[{ 
  "meals": [
    {"type":"breakfast","recipeName":"Завтрак","calories":0,"portionSize":0},
    {"type":"lunch","recipeName":"Обед","calories":0,"portionSize":0},
    {"type":"dinner","recipeName":"Ужин","calories":0,"portionSize":0}
  ] 
}]

ПРАВИЛА:
- РАСПРЕДЕЛЯЙ КАЛОРИИ ПО ПРИЁМАМ ПИЩИ (проценты от суточной нормы):
  - Завтрак: 20–30%
  - Обед: 30–35%
  - Ужин: 15–20%
  - Перекусы: 10–15% каждый (если приёмов пищи 6: два перекуса 10–15%, третий 5–10%)
  - Если приёмов пищи 3 (без перекусов): завтрак 30–35%, обед 40–45%, ужин 20–25%
- ВСЕГДА возвращай массив, даже если это один день.
- Поле "type" ДОЛЖНО быть одним из: breakfast, lunch, dinner, snack.
- Поле "recipeName" - ТОЛЬКО на русском языке, конкретное название блюда.
- Поле "calories" - ОБЯЗАТЕЛЬНОЕ целое число, рассчитанное индивидуально для каждого блюда.${calorieTarget}
- Поле "portionSize" - ОБЯЗАТЕЛЬНОЕ целое число в граммах.
- ЕСЛИ план генерируется только на 1 день, НЕ ПИШИ заголовок "**День 1**" или "День 1".
- Самое важное: сумма калорий всех приемов пищи в каждом дне ДОЛЖНА быть равна суточной норме калорий (±50 ккал).
- ТОЛЬКО текст с фразой о суточной норме и количестве дней, затем JSON, без дополнительного текста, приветствий, markdown или пояснений.`;

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
