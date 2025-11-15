import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "@/prisma.service";
import { UserModule } from "@/user/user.module"; // Убедитесь, что UserModule импортирован
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { CleanupService } from "@/auth/cleanup.service";
import { EmailService } from "@/email/email.service";

@Module({
  imports: [
    forwardRef(() => UserModule), // Используем forwardRef для разрешения циклической зависимости
    ConfigModule.forRoot({
      isGlobal: true, // Настроим конфиг как глобальный
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule], // Инжектируем ConfigModule
      inject: [ConfigService], // Инжектируем ConfigService
      useFactory: (configService: ConfigService) => ({
        secret: configService.get("JWT_SECRET"), // Берем секрет из конфигурации
        signOptions: { expiresIn: "60m" }, // Устанавливаем срок действия токена
      }),
    }),
  ],
  controllers: [AuthController], // Контроллер для аутентификации
  providers: [
    AuthService, // Сервис аутентификации
    JwtStrategy, // Стратегия для работы с JWT
    PrismaService, // Сервис для работы с базой данных
    CleanupService,
    EmailService
  ],
  exports: [AuthService, JwtModule], // Экспортируем AuthService и JwtModule для использования в других модулях
})
export class AuthModule {}
