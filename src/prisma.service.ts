import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    this.logger.log("PrismaService initialized");
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("Prisma connected to database");
    } catch (error) {
      this.logger.error("Failed to connect to Prisma:", error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log("Prisma disconnected from database");
  }
}
