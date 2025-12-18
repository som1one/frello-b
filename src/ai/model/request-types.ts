import { Message, RequestType } from "@prisma/client";

export function getRequestType({
  content,
  isRegeneration,
  originalMessage,
}: {
  content: string;
  isRegeneration: boolean;
  originalMessage?: Message;
}): RequestType {
  const text = (content || "").toLowerCase().trim();
  if (isRegeneration) {
    // Проверяем, был ли исходный запрос планом питания
    // if (
    //   originalMessage &&
    //   planKeywords.some((keyword) =>
    //     originalMessage.content.toLowerCase().includes(keyword),
    //   )
    // ) {
    //   return RequestType.REGENERATION_MEAL_PLAN;
    // }
  }
  if (isMealPlanRequest(text)) return RequestType.MEAL_PLAN;
  if (isRecipeRequest(text)) return RequestType.RECIPE;
  return RequestType.TEXT;
}

function isMealPlanRequest(text: string): boolean {
  // Нужно, чтобы это было именно про питание/рацион, а не "план тренировок/дел" и т.п.
  const nutritionContext = /(питан|рацион|меню|еда|кбжу|калор)/i;
  const hasNutritionContext = nutritionContext.test(text);

  // Явные формы: "план питания", "рацион на неделю", "меню на 5 дней" и т.д.
  const explicitPlan =
    /\bплан питания\b/i.test(text) ||
    /\bрацион\b.*\bна\b.*\b(день|недел|месяц|\d+)\b/i.test(text) ||
    /\bменю\b.*\bна\b.*\b(день|недел|месяц|\d+)\b/i.test(text) ||
    /\bпитани(е|я)\b.*\bна\b.*\b(день|недел|месяц|\d+)\b/i.test(text);

  // "составь/сделай/придумай" + (план/меню/рацион) + контекст питания
  const imperativePlan =
    /\b(составь|сделай|придумай|сгенерируй|подбери)\b/i.test(text) &&
    /\b(план|меню|рацион)\b/i.test(text) &&
    hasNutritionContext;

  // "план на 3 дня/неделю" — но только если есть контекст питания
  const planWithDuration =
    /\bплан\b.*\bна\b.*\b(\d+)\s*(дн(я|ей)?|недел(ю|и)?|месяц(а|ев)?)\b/i.test(text) &&
    hasNutritionContext;

  return explicitPlan || imperativePlan || planWithDuration;
}

function isRecipeRequest(text: string): boolean {
  // Рецепт/приготовление должны быть явными. "ужин/обед/завтрак" сами по себе НЕ считаем рецептом.
  return (
    /\bрецепт\b/i.test(text) ||
    /\bкак (приготовить|сделать|сварить|испечь|пожарить|запечь)\b/i.test(text) ||
    /\b(приготовь|приготовление)\b/i.test(text) ||
    /\bпошагов(ый|ая)\b.*\bрецепт\b/i.test(text) ||
    /\bингредиент(ы|ов)\b/i.test(text) ||
    /\bспособ приготовления\b/i.test(text)
  );
}
