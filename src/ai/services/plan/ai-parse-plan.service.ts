import { Injectable, Logger } from "@nestjs/common";
import { MealType } from "@prisma/client";
import { isJsonOutput, parseJsonOutput } from "src/ai/model/json-checks";
import { getMealLabels } from "src/ai/model/meal-labels";
import { stripHtml } from "src/ai/model/stripHtml";
import { PlanDay, PlanMeal } from "src/plan/dto/create-plan.dto";

@Injectable()
export class AiParsePlanService {
  private readonly logger = new Logger(AiParsePlanService.name);
  constructor() {}

  parseTextToPlan(
    content: string,
    mealFrequency: number,
  ): { dishDetails: PlanMeal; planDetails: PlanDay[] } {
    const lines = content
      .split("\n")
      .filter((line) => line.trim() && line.includes(": "));
    const mealTypeMap: { [key: string]: MealType } = {
      завтрак: "breakfast",
      обед: "lunch",
      ужин: "dinner",
      перекус: "snack",
    };
    const meals: PlanMeal[] = lines.map((line) => {
      const [type, rest] = line.split(": ");
      const [recipeName, calories] = rest.split(" (");
      return {
        type: mealTypeMap[type.toLowerCase()] || ("snack" as MealType),
        recipeName: recipeName.trim(),
        name: recipeName.trim(),
        calories: parseInt(calories.replace(" ккал)", "")) || 0,
        proteins: 0,
        fats: 0,
        carbs: 0,
        ingredients: "",
        instruction: "",
        cookingTime: 0,
        dishId: 0,
        portionSize: 200,
      };
    });

    return {
      dishDetails: meals[0] || ({} as PlanMeal),
      planDetails: [{ meals: meals.slice(0, mealFrequency) }],
    };
  }

  formatPlanOutput(output: string, mealFrequency: number): string {
    this.logger.log("output in plan parse service", output);
    if (!isJsonOutput(output)) {
      this.logger.log("output !isJsonOutput(output)", output);
      this.logger.log("output return stripHtml(output)", stripHtml(output));
      return stripHtml(output); // Если не JSON, просто очищаем HTML
    }

    try {
      const parsed = parseJsonOutput(output);
      this.logger.log("output parsed", parsed);
      this.logger.log("parsed in plan parse service", output);
      const plan = Array.isArray(parsed)
        ? parsed
        : parsed?.meals
          ? [parsed]
          : [];
      this.logger.log("plan in plan parse service", output);
      return this.constructPlanMessage(plan, mealFrequency);
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
        portionSize: rawParsed.portionSize || 200,
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
          portionSize: meal.portionSize || 200,
        }));
      while (meals.length < mealFrequency) {
        const missingType =
          mealTypes[meals.length] || `snack${meals.length - 2}`;
        meals.push({
          type: missingType as MealType,
          recipeName: `Дополнительный перекус ${meals.length - 2}`,
          name: `Дополнительный перекус ${meals.length - 2}`,
          calories: 200,
          proteins: 0,
          fats: 0,
          carbs: 0,
          ingredients: "",
          instruction: "",
          cookingTime: 0,
          dishId: 0,
          portionSize: 200,
        });
      }
      return { meals };
    });

    const dishDetails = planDetails[0]?.meals?.[0] || ({} as PlanMeal);
    return { dishDetails, planDetails };
  }

  private constructPlanMessage(plan: PlanDay[], mealFrequency: number): string {
    const mealLabels = getMealLabels(mealFrequency);
    const WEEK_LABEL = [
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
      "Воскресенье",
    ];
    this.logger.log("plan constructPlanMessage", plan);
    let prefix = "";
    if (plan[0]?.warning) {
      prefix = plan[0].warning + "\n\n";
      plan[0] = { meals: plan[0].meals }; // Удаляем warning из первого дня
    }
    const result = plan
      .map((day, i) => {
        const dayLabel =
          plan.length === 7
            ? WEEK_LABEL[i]
            : plan.length === 1
              ? null
              : `День ${i + 1}`;
        const meals = day.meals.map(
          (meal) =>
            `${mealLabels[meal.type] || "Приём пищи"}: ${meal.recipeName} (${meal.calories} ккал, ${meal.portionSize} г)`,
        );
        return dayLabel ? `${dayLabel}\n${meals.join("\n")}` : meals.join("\n");
      })
      .join("\n\n");
    return prefix + result;
  }
}
