-- Добавить столбец planId как необязательный
ALTER TABLE "ConsumedMeal" ADD COLUMN "planId" INTEGER;

-- Заполнить planId на основе связи mealId -> Meal -> planId
UPDATE "ConsumedMeal"
SET "planId" = (
  SELECT "planId"
  FROM "Meal"
  WHERE "Meal"."id" = "ConsumedMeal"."mealId"
);

-- Сделать planId обязательным
ALTER TABLE "ConsumedMeal" ALTER COLUMN "planId" SET NOT NULL;

-- Добавить внешний ключ для связи с MealPlan
ALTER TABLE "ConsumedMeal"
ADD CONSTRAINT "ConsumedMeal_planId_fkey"
FOREIGN KEY ("planId")
REFERENCES "MealPlan" ("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Удалить столбец date
ALTER TABLE "ConsumedMeal" DROP COLUMN "date";