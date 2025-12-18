import { Injectable, Logger } from "@nestjs/common";
import { MealType } from "@prisma/client";
import { constructDishMessage } from "src/ai/model/construct-dish-message";
import { isJsonOutput, parseJsonOutput } from "src/ai/model/json-checks";
import { stripHtml } from "src/ai/model/stripHtml";
import { PlanDay, PlanMeal } from "src/plan/dto/create-plan.dto";
import { AiDishService } from "../dish/ai-dish.service";

@Injectable()
export class AiParseRecipeService {
  private readonly logger = new Logger(AiParseRecipeService.name);
  constructor(private readonly aiDishService: AiDishService) {}

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = parseFloat(value.replace(",", ".").replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  }

  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private normalizeIngredientsAndTotals(parsed: any): {
    ingredientsText: string;
    totals: { proteins: number; fats: number; carbs: number; calories: number; portionSize?: number };
  } | null {
    const ingRaw = parsed?.ingredients;
    if (!Array.isArray(ingRaw)) return null;

    let p = 0;
    let f = 0;
    let c = 0;
    let cal = 0;
    let gramsSum = 0;

    const lines: string[] = [];

    for (const item of ingRaw) {
      const name = String(item?.name || "").trim();
      if (!name) continue;

      const grams = this.toNumber(item?.grams, 0);
      const ip = this.toNumber(item?.proteins, 0);
      const ifat = this.toNumber(item?.fats, 0);
      const ic = this.toNumber(item?.carbs, 0);

      // calories: предпочитаем расчет из БЖУ, чтобы всегда выполнялась формула
      const caloriesFromMacros = 4 * ip + 9 * ifat + 4 * ic;
      const itemCalories = this.toNumber(item?.calories, caloriesFromMacros);
      const finalItemCalories = Number.isFinite(caloriesFromMacros) && caloriesFromMacros > 0
        ? caloriesFromMacros
        : itemCalories;

      gramsSum += grams;
      p += ip;
      f += ifat;
      c += ic;
      cal += finalItemCalories;

      lines.push(
        `${name} — ${Math.round(grams)} г (ккал ${Math.round(finalItemCalories)}, Б ${this.round1(ip)} г, Ж ${this.round1(ifat)} г, У ${this.round1(ic)} г)`,
      );
    }

    const proteins = this.round1(p);
    const fats = this.round1(f);
    const carbs = this.round1(c);
    const caloriesFromTotalsMacros = 4 * proteins + 9 * fats + 4 * carbs;
    const calories = Math.round(
      Number.isFinite(caloriesFromTotalsMacros) && caloriesFromTotalsMacros > 0
        ? caloriesFromTotalsMacros
        : cal,
    );

    const portionSizeFromParsed = this.toNumber(parsed?.portionSize, 0);
    const portionSize = portionSizeFromParsed > 0 ? Math.round(portionSizeFromParsed) : Math.round(gramsSum || 0);

    return {
      ingredientsText: lines.join("\n"),
      totals: { proteins, fats, carbs, calories, portionSize },
    };
  }

  parseRecipe(output: string) {
    const defaultResponse = {
      result: stripHtml(output),
      dishDetails: {} as PlanMeal,
      planDetails: [],
    };

    if (!isJsonOutput(output)) {
      return defaultResponse;
    }

    try {
      const parsed = parseJsonOutput(output);
      const normalized = this.normalizeIngredientsAndTotals(parsed);
      const dishDetails: PlanMeal = {
        name: parsed.name,
        recipeName: parsed.name,
        ingredients: normalized?.ingredientsText ?? parsed.ingredients,
        instruction: parsed.instruction,
        cookingTime: parsed.cookingTime || 0,
        calories: (normalized?.totals.calories ?? parsed.calories) || 0,
        proteins: (normalized?.totals.proteins ?? parsed.proteins) || 0,
        fats: (normalized?.totals.fats ?? parsed.fats) || 0,
        carbs: (normalized?.totals.carbs ?? parsed.carbs) || 0,
        type: "breakfast" as MealType,
        dishId: 0,
        
        portionSize: (normalized?.totals.portionSize ?? parsed.portionSize) || 200,
      };
      return {
        result: dishDetails,
        dishDetails,
        planDetails: [],
      };
    } catch {
      return this.handleInvalidJson(output, defaultResponse);
    }
  }

  parseMessageRecipe(output: string) {
    const defaultResponse = {
      result: stripHtml(output),
      dishDetails: {} as PlanMeal,
      planDetails: [],
    };

    if (!isJsonOutput(output)) {
      return defaultResponse;
    }

    try {
      const parsed = parseJsonOutput(output);
      const normalized = this.normalizeIngredientsAndTotals(parsed);
      const dishDetails: PlanMeal = {
        name: parsed.name,
        recipeName: parsed.name,
        ingredients: normalized?.ingredientsText ?? parsed.ingredients,
        instruction: parsed.instruction,
        cookingTime: parsed.cookingTime || 0,
        calories: (normalized?.totals.calories ?? parsed.calories) || 0,
        proteins: (normalized?.totals.proteins ?? parsed.proteins) || 0,
        fats: (normalized?.totals.fats ?? parsed.fats) || 0,
        carbs: (normalized?.totals.carbs ?? parsed.carbs) || 0,
        type: "breakfast" as MealType,
        dishId: 0,
        portionSize: (normalized?.totals.portionSize ?? parsed.portionSize) || 200,
      };
      const result = constructDishMessage(dishDetails);

      return {
        result,
        dishDetails,
        planDetails: [],
      };
    } catch {
      return this.handleInvalidJson(output, defaultResponse);
    }
  }

  private handleInvalidJson(
    output: string,
    defaultResponse: {
      result: string;
      dishDetails: PlanMeal;
      planDetails: PlanDay[];
    },
  ): { result: string; dishDetails: PlanMeal; planDetails: PlanDay[] } {
    const reconstructedDish = this.aiDishService.parseDishFromText(
      output,
      defaultResponse.dishDetails.dishId,
    );
    return reconstructedDish
      ? {
          result: constructDishMessage(reconstructedDish),
          dishDetails: reconstructedDish,
          planDetails: [],
        }
      : defaultResponse;
  }
}
