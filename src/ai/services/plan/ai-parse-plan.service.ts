import { Injectable, Logger } from "@nestjs/common";
import { MealType } from "@prisma/client";
import { isJsonOutput, parseJsonOutput } from "src/ai/model/json-checks";
import { getMealLabels } from "src/ai/model/meal-labels";
import { stripHtml } from "src/ai/model/stripHtml";
import { PlanDay, PlanMeal } from "src/plan/dto/create-plan.dto";

@Injectable()
export class AiParsePlanService {
  private readonly logger = new Logger(AiParsePlanService.name);
  constructor() { }

  parseTextToPlan(
    content: string,
    mealFrequency: number,
  ): { dishDetails: PlanMeal; planDetails: PlanDay[] } {
    const lines = content
      .split("\n")
      .filter((line) => line.trim() && line.includes(": "));
    const mealTypeMap: { [key: string]: MealType } = {
      завтрак: "breakfast",
      "второй завтрак": "snack",
      обед: "lunch",
      полдник: "snack",
      ужин: "dinner",
      перекус: "snack",
    };
    const meals: PlanMeal[] = lines.map((line) => {
      const [type, rest] = line.split(": ");
      // Extract recipe name, calories, and portion size
      // Format: "Название блюда (300 ккал, 250 г)" or "Название блюда (300 ккал)"
      const match = rest.match(/^(.+?)\s*\((\d+)\s*ккал(?:,\s*(\d+)\s*г)?\)/);

      let recipeName = rest;
      let calories = 0;
      let portionSize = 0; // default fallback

      if (match) {
        recipeName = match[1].trim();
        calories = parseInt(match[2]) || 0;
        portionSize = match[3] ? parseInt(match[3]) : 0;
      } else {
        // Fallback to old parsing if new format doesn't match
        const [name, cal] = rest.split(" (");
        recipeName = name.trim();
        calories = parseInt(cal?.replace(" ккал)", "")) || 0;
      }

      return {
        type: mealTypeMap[type.toLowerCase()] || ("snack" as MealType),
        recipeName: recipeName,
        name: recipeName,
        calories: calories,
        proteins: 0,
        fats: 0,
        carbs: 0,
        ingredients: "",
        instruction: "",
        cookingTime: 0,
        dishId: 0,
        portionSize: portionSize,
      };
    });

    return {
      dishDetails: meals[0] || ({} as PlanMeal),
      planDetails: [{ meals: meals.slice(0, mealFrequency) }],
    };
  }

  formatPlanOutput(output: string, mealFrequency: number): string {
    this.logger.log("output in plan parse service", output);

    // Санитизация: отрезаем всё до ключевых фраз, чтобы убрать лишние вступления
    const sanitizeOutput = (text: string): string => {
      const normIdx = text.toLowerCase().indexOf("ваша суточная норма калорий");
      if (normIdx !== -1) {
        text = text.slice(normIdx);
      } else {
        const dayIdx = text.toLowerCase().indexOf("день ");
        if (dayIdx !== -1) text = text.slice(dayIdx);
      }
      return text.trim();
    };

    output = sanitizeOutput(output);
    if (!isJsonOutput(output)) {
      // Если не JSON, попробуем распарсить текстовую структуру плана и сформировать
      // единый формат вывода, чтобы в интерфейсе всегда были строки вида:
      // "Завтрак: Блюдо (XXX ккал, YYY г)"
      const clean = stripHtml(output);
      try {
        const { planDetails } = this.parseTextToPlan(clean, mealFrequency);
        return this.constructPlanMessage(planDetails, mealFrequency, clean);
      } catch {
        // В крайнем случае вернём очищенный текст
        return clean;
      }
    }

    try {
      const parsed = parseJsonOutput(output);
      this.logger.log("output parsed", parsed);
      this.logger.log("parsed in plan parse service", output);

      if (parsed.error) {
        return parsed.error;
      }

      const plan = Array.isArray(parsed)
        ? parsed
        : parsed?.meals
          ? [parsed]
          : [];
      this.logger.log("plan in plan parse service", output);
      return this.constructPlanMessage(plan, mealFrequency, output);
    } catch {
      return stripHtml(output); // Если JSON невалидный, возвращаем очищенный текст
    }
  }

  parseAiOutput(
    output: string,
    mealFrequency: number,
  ): { dishDetails: PlanMeal; planDetails: PlanDay[] } {
    this.logger.log("Raw output received", output);
    if (isJsonOutput(output)) {
      const parsed = parseJsonOutput(output);

      if (parsed.error) {
        // Если вернулась ошибка, возвращаем пустой план, но ошибку можно было бы обработать иначе
        // В данном контексте (parseAiOutput) мы возвращаем структуру dishDetails/planDetails
        // Если ошибка, то плана нет.
        return { dishDetails: {} as PlanMeal, planDetails: [] };
      }

      const plan = Array.isArray(parsed)
        ? parsed
        : parsed?.meals
          ? [parsed]
          : [];
      this.logger.log("parse output", output);
      return this.processParsedOutput(plan, mealFrequency, parsed);
    }
    return this.parseTextToPlan(output, mealFrequency);
  }

  private processParsedOutput(
    parsed: any,
    mealFrequency: number,
    rawParsed: any,
  ): { dishDetails: PlanMeal; planDetails: PlanDay[] } {
    const mealLabels = getMealLabels(mealFrequency);
    const mealTypes = Object.keys(mealLabels);

    if (rawParsed?.name && rawParsed?.ingredients && rawParsed?.instruction) {
      const dishDetails: PlanMeal = {
        type: "lunch" as MealType,
        recipeName: rawParsed.name || "",
        name: rawParsed.name || "",
        calories: rawParsed.calories || 0,
        proteins: rawParsed.proteins || 0,
        fats: rawParsed.fats || 0,
        carbs: rawParsed.carbs || 0,
        ingredients: rawParsed.ingredients || "",
        instruction: rawParsed.instruction || "",
        cookingTime: rawParsed.cookingTime || 0,
        dishId: rawParsed.dishId || 0,
        portionSize: rawParsed.portionSize || 0,
      };
      return { dishDetails, planDetails: [] };
    }
    const plan = Array.isArray(parsed) ? parsed : parsed?.meals ? [parsed] : [];
    if (!plan.length) {
      return { dishDetails: {} as PlanMeal, planDetails: [] };
    }

    const planDetails = plan.map((day) => {
      this.logger.log("process plan day", day);
      const meals = (day.meals || [])
        .filter((meal) => mealTypes.includes(meal.type))
        .slice(0, mealFrequency)
        .map((meal) => ({
          type: meal.type as MealType,
          recipeName: meal.recipeName || meal.name || "",
          name: meal.recipeName || meal.name || "",
          calories: meal.calories || 0,
          proteins: meal.proteins || 0,
          fats: meal.fats || 0,
          carbs: meal.carbs || 0,
          ingredients: meal.ingredients || "",
          instruction: meal.instruction || "",
          cookingTime: meal.cookingTime || 0,
          dishId: meal.dishId || 0,
          portionSize: meal.portionSize || 0,
        }));
      while (meals.length < mealFrequency) {
        const missingType =
          mealTypes[meals.length] || `snack${meals.length - 2}`;
        meals.push({
          type: missingType as MealType,
          recipeName: `Дополнительный перекус ${meals.length - 2}`,
          name: `Дополнительный перекус ${meals.length - 2}`,
          calories: 0,
          proteins: 0,
          fats: 0,
          carbs: 0,
          ingredients: "",
          instruction: "",
          cookingTime: 0,
          dishId: 0,
          portionSize: 0,
        });
      }
      return { meals };
    });

    const dishDetails = planDetails[0]?.meals?.[0] || ({} as PlanMeal);
    return { dishDetails, planDetails };
  }

  private constructPlanMessage(plan: PlanDay[], mealFrequency: number, output?: string): string {
    const mealLabels = getMealLabels(mealFrequency);
    this.logger.log("plan constructPlanMessage", plan);
    
    // Извлекаем суточную норму калорий из вывода, если она есть
    let calorieNorm = "";
    let calorieNormNumber: number | null = null;
    if (output) {
      // Ищем разные варианты формата нормы калорий
      const calorieMatch = output.match(/Ваша суточная норма калорий[^:]*:\s*(\d+)\s*ккал/i) ||
                           output.match(/суточная норма[^:]*:\s*(\d+)\s*ккал/i) ||
                           output.match(/норма калорий[^:]*:\s*(\d+)\s*ккал/i);
      if (calorieMatch) {
        const extractedCalories = parseInt(calorieMatch[1], 10);
        calorieNormNumber = extractedCalories || null;
        
        // Если в промпте была передана целевая норма, проверяем, что AI её не изменил
        // (это проверяется в preparePlanMessage, где передается targetCalories)
        // Здесь просто используем извлеченное значение
        calorieNorm = `Ваша суточная норма калорий: ${extractedCalories} ккал.\n`;
      }
    }
    
    // Извлекаем количество дней из вывода, если указано
    let daysCount = "";
    if (output) {
      // Пробуем разные варианты: "План на 7 дней:", "План на 7 дн:", "на 7 дней"
      const daysMatch = output.match(/План на\s*(\d+)\s*(?:дн|дня|дней|день)/i) || 
                        output.match(/на\s*(\d+)\s*(?:дн|дня|дней|день)/i);
      if (daysMatch) {
        const daysNum = parseInt(daysMatch[1], 10);
        const daysWord = daysNum === 1 ? 'день' : daysNum < 5 ? 'дня' : 'дней';
        daysCount = `План на ${daysNum} ${daysWord}:\n`;
      } else if (plan.length > 0) {
        daysCount = `План на ${plan.length} ${plan.length === 1 ? 'день' : plan.length < 5 ? 'дня' : 'дней'}:\n`;
      }
    } else if (plan.length > 0) {
      daysCount = `План на ${plan.length} ${plan.length === 1 ? 'день' : plan.length < 5 ? 'дня' : 'дней'}:\n`;
    }
    
    let prefix = "";
    if (plan[0]?.warning) {
      prefix = plan[0].warning + "\n\n";
      plan[0] = { meals: plan[0].meals }; // Удаляем warning из первого дня
    }

    // Если нашли норму калорий — заполним отсутствующие калории у приёмов пищи по типу
    if (calorieNormNumber && plan?.length) {
      const percMap: Record<string, number> = {
        breakfast: 0.25,
        lunch: 0.35,
        dinner: 0.2,
        snack: 0.1,
        snack1: 0.1,
        snack2: 0.1,
        snack3: 0.08,
      };
      plan.forEach((day) => {
        const meals = day.meals || [];
        const percSum = meals.reduce((sum, m) => sum + (percMap[m.type] ?? 0.1), 0) || 1;
        meals.forEach((m) => {
          const perc = percMap[m.type] ?? 0.1;
          if (!m.calories || m.calories <= 0) {
            m.calories = Math.round((calorieNormNumber! * perc) / percSum);
          }
          if (!m.portionSize || m.portionSize <= 0) {
            m.portionSize = 300; // разумный дефолт
          }
          
          // ВАЛИДАЦИЯ: Проверяем и исправляем нереалистичные соотношения калорий и граммов
          if (m.portionSize > 0 && m.calories > 0) {
            const caloriesPerGram = m.calories / m.portionSize;
            
            // Нереалистично высокое соотношение (больше 2.5 ккал/г для обычных блюд)
            if (caloriesPerGram > 2.5) {
              this.logger.warn(`Нереалистичное соотношение: ${m.portionSize}г = ${m.calories} ккал (${caloriesPerGram.toFixed(2)} ккал/г). Исправляю...`);
              
              // Исправляем: для обычных блюд максимум 2 ккал/г, для жирных - 2.5 ккал/г
              const maxCaloriesPerGram = 2.0; // консервативное значение для обычных блюд
              const correctedCalories = Math.round(m.portionSize * maxCaloriesPerGram);
              
              // Если исправление слишком сильно изменило калории, корректируем порцию
              if (Math.abs(correctedCalories - m.calories) > m.calories * 0.3) {
                // Корректируем порцию, чтобы сохранить калории
                m.portionSize = Math.round(m.calories / maxCaloriesPerGram);
                this.logger.log(`Скорректирована порция: ${m.portionSize}г для ${m.calories} ккал`);
              } else {
                m.calories = correctedCalories;
                this.logger.log(`Скорректированы калории: ${m.calories} ккал для ${m.portionSize}г`);
              }
            }
            
            // Нереалистично низкое соотношение (меньше 0.3 ккал/г - слишком легкая еда)
            if (caloriesPerGram < 0.3 && m.calories > 100) {
              this.logger.warn(`Слишком низкое соотношение: ${m.portionSize}г = ${m.calories} ккал (${caloriesPerGram.toFixed(2)} ккал/г). Исправляю...`);
              
              // Для легких блюд минимум 0.5 ккал/г
              const minCaloriesPerGram = 0.5;
              const correctedCalories = Math.round(m.portionSize * minCaloriesPerGram);
              
              if (correctedCalories > m.calories) {
                m.calories = correctedCalories;
                this.logger.log(`Скорректированы калории: ${m.calories} ккал для ${m.portionSize}г`);
              }
            }
          }
        });
      });
    }

    const result = plan
      .map((day, i) => {
        // Всегда используем формат "День 1", "День 2" и т.д.
        const dayLabel = plan.length === 1 ? null : `День ${i + 1}`;
        const meals = day.meals.map(
          (meal) =>
            `${mealLabels[meal.type] || "Приём пищи"}: ${meal.recipeName} (${meal.calories} ккал, ${meal.portionSize} г)`,
        );
        return dayLabel ? `${dayLabel}\n${meals.join("\n")}` : meals.join("\n");
      })
      .join("\n\n");
    return prefix + calorieNorm + daysCount + result;
  }
}
