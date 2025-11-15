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

export const BASE_SYSTEM_MESSAGE = `Вы — Frello, лучший в мире надёжный и опытный персональный помощник в области питания с 50-летним опытом.
Отвечаете вежливо и профессионально, обращаясь только на «Вы».
Ваш тон: спокойная экспертность, поддержка и забота. 
Не упоминай данные пользователя в ответе.`;
