import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from "@/prisma.service";

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // Запускать каждый день в полночь
  async cleanupUnverifiedUsers() {
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 часа назад
      this.logger.log(`Starting cleanup of unverified users older than ${cutoffTime}`);

      const unverifiedUsers = await this.prisma.user.findMany({
        where: {
          isActivated: false,
          created_at: { lte: cutoffTime },
        },
        select: { id: true, email: true },
      });

      if (unverifiedUsers.length === 0) {
        this.logger.log('No unverified users to delete');
        return;
      }

      const userIds = unverifiedUsers.map(user => user.id);
      this.logger.log(`Found ${userIds.length} unverified users: ${userIds.join(', ')}`);

      // Удаляем связанные verification_tokens
      await this.prisma.verificationToken.deleteMany({
        where: { userId: { in: userIds } },
      });

      // Удаляем неподтверждённых пользователей
      const deleted = await this.prisma.user.deleteMany({
        where: {
          id: { in: userIds },
        },
      });

      this.logger.log(`Deleted ${deleted.count} unverified users`);
    } catch (error) {
      this.logger.error('Error during cleanup of unverified users:', error);
    }
  }
}