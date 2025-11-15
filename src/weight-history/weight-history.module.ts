import { Module } from '@nestjs/common'
import { PrismaService } from '@/prisma.service'
import { WeightHistoryController } from './weight-history.controller'
import { WeightHistoryService } from './weight-history.service'
import { ConsumedMealController } from './consumed-meal.controller'

@Module({
	controllers: [WeightHistoryController, ConsumedMealController],
	providers: [WeightHistoryService, PrismaService],
})
export class WeightHistoryModule {}
