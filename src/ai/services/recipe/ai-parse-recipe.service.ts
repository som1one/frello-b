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
      const dishDetails: PlanMeal = {
        name: parsed.name,
        recipeName: parsed.name,
        ingredients: parsed.ingredients,
        instruction: parsed.instruction,
        cookingTime: parsed.cookingTime || 0,
        calories: parsed.calories || 0,
        proteins: parsed.proteins || 0,
        fats: parsed.fats || 0,
        carbs: parsed.carbs || 0,
        type: "breakfast" as MealType,
        dishId: 0,
        portionSize: parsed.portionSize || 200,
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
      const dishDetails: PlanMeal = {
        name: parsed.name,
        recipeName: parsed.name,
        ingredients: parsed.ingredients,
        instruction: parsed.instruction,
        cookingTime: parsed.cookingTime || 0,
        calories: parsed.calories || 0,
        proteins: parsed.proteins || 0,
        fats: parsed.fats || 0,
        carbs: parsed.carbs || 0,
        type: "breakfast" as MealType,
        dishId: 0,
        portionSize: parsed.portionSize || 200,
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
