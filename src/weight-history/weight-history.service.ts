import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma.service";

@Injectable()
export class WeightHistoryService {
  constructor(private prisma: PrismaService) {}

  async getWeightHistory(userId: string) {
    return await this.prisma.weightHistory.findMany({
      where: {
        userId,
        date: {
          gte: new Date(new Date().setDate(new Date().getDate() - 7)), // Последние 7 дней
        },
      },
      select: {
        weight: true,
        date: true,
      },
      orderBy: { date: "asc" },
    });
  }

  async updateWeight({ userId, weight }: { userId: string; weight: number }) {
    return await this.prisma.weightHistory.create({
      data: { userId, weight, date: new Date() },
    });
  }
}
