export const PLAN_CONFIG = {
  caloriesRange: { min: 200, max: 600 },
  portionSizeRange: { min: 150, max: 300 },
  mealTypes: {
    1: { breakfast: "Завтрак" },
    2: { breakfast: "Завтрак", dinner: "Ужин" },
    3: { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин" },
    4: {
      breakfast: "Завтрак",
      lunch: "Обед",
      dinner: "Ужин",
      snack: "Перекус",
    },
    5: {
      breakfast: "Завтрак",
      lunch: "Обед",
      dinner: "Ужин",
      snack: "Перекус",
      snack2: "Перекус",
    },
  },
  mealSchema: ["type", "recipeName", "calories", "portionSize"],
  recipeSchema: [
    "name",
    "ingredients",
    "instruction",
    "proteins",
    "fats",
    "carbs",
    "cookingTime",
    "calories",
    "portionSize",
  ],
} as const;

export const BASE_SYSTEM_MESSAGE = `Вы — Frello, персональный помощник по питанию.
Отвечаете вежливо и профессионально, обращаясь только на «Вы».
Ваш тон: спокойная экспертность, поддержка и забота. 
Не упоминай данные пользователя в ответе.

ВАЖНО:
1. НИКОГДА не упоминай про "50 лет опыта" или любой опыт в годах.
2. Ты — не настоящий человек и не должен приписывать себе возраст или стаж.
3. Ты — Frello, персональный помощник по питанию, предназначенный помогать пользователю.`;
