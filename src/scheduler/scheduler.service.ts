import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma.service";

@Injectable()
export class SchedulerService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_SECONDS) // или другое расписание
  async handleCron() {
    const now = new Date();

    // Получение всех тарифов, у которых истек срок действия и которые еще активны
    const expiredTariffs = await this.prisma.tariff.findMany({
      where: {
        expiration_date: { lte: now },
        is_active: true,
      },
    });

    // Обновление статуса подписок
    for (const tariff of expiredTariffs) {
      await this.prisma.tariff.update({
        where: { id: tariff.id },
        data: { is_active: false },
      });
    }
  }
}
