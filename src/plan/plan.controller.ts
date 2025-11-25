import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ValidationPipe,
  ParseIntPipe,
} from "@nestjs/common";
import { PlanService } from "./plan.service";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { JwtAuthGuard } from "@/auth/guards/jwt.guard";
import { GetUserId } from "@/auth/decorators/auth.decorator";
import { PrismaService } from "@/prisma.service";
import { IsEmailConfirmedGuard } from "@/auth/guards/is-email-confirm.guard";

@UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
@Controller("plan")
export class PlanController {
  constructor(
    private planService: PlanService,
    private prismaService: PrismaService,
  ) { }

  @UseGuards(JwtAuthGuard, IsEmailConfirmedGuard)
  @Post("create")
  async create(
    @Body(new ValidationPipe({ transform: true })) createPlanDto: CreatePlanDto,
    @GetUserId() userId: string,
  ) {
    return await this.planService.create(createPlanDto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("toggle/byMessageId/:id")
  async toggleVisible(
    @Param("id", ParseIntPipe) id: number,
    @GetUserId() userId: string,
  ) {
    try {
      const message = await this.prismaService.message.findUnique({
        where: { id: Number(id) },
        select: { planId: true },
      });

      if (!message?.planId) {
        return { message: "No plan associated with message" };
      }

      const plan = await this.prismaService.mealPlan.findUnique({
        where: { id: message.planId },
        select: { id: true, userId: true, date: true, visible: true },
      });

      if (!plan || plan.userId !== userId) {
        throw new Error("Plan not found or access denied");
      }

      const updated = await this.prismaService.mealPlan.update({
        where: { id: plan.id },
        data: { visible: !plan.visible },
        select: { id: true, visible: true, date: true },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get("/lastWeek")
  async findAll(@GetUserId() userId: string) {
    return await this.prismaService.mealPlan.findMany({
      where: {
        visible: true,
        userId,
      },
      include: { meals: true },
      orderBy: [{ date: "asc" }],
      take: 14,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) { }

  @Patch(":id")
  update(@Param("id") id: string) { }

  @Delete(":id")
  remove(@Param("id") id: string) { }
}
