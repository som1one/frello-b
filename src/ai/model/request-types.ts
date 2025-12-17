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
  console.log("Input content:", content); // Добавь лог
  console.log("Lowercase content:", content.toLowerCase());
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
  if (planKeywords.some((keyword) => content.toLowerCase().includes(keyword))) {
    return RequestType.MEAL_PLAN;
  }
  if (
    recipeKeywords.some((keyword) => content.toLowerCase().includes(keyword))
  ) {
    return RequestType.RECIPE;
  }
  return RequestType.TEXT;
}

const recipeKeywords = [
  "рецепт",
  "как приготовить",
  "приготовь",
  "приготовление",
  "пошаговый рецепт",
  "ингредиенты",
  "способ приготовления",
  "как сделать",
  "кулинария",
  "готовим",
  "как сварить",
  "как испечь",
  "как пожарить",
  "как запечь",
  "ужин",
  "обед",
  "завтрак",
];

const planKeywords = [
  "план питания",
  "план на день",
  "план на неделю",
  "план на",
  "расписание питания",
  "рацион на неделю",
  "рацион на день",
  "рацион на",
  "расписание еды",
  "питание на неделю",
  "питание на день",
  "питание на",
  "другой план",
  "новый план",
  "еще один план",
  "составь план",
  "сделай план",
  "придумай план",
  "меню на",
  "меню на неделю",
  "меню на день",
  "давай другой",
  "хочу другой",
  "сделай другой",
  "другой",
];
