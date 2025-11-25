import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common"
import { Response } from "express"
import { AuthService } from "./auth.service"
import {
  AuthDto,
  ConfirmResetPasswordDto,
  ResetPasswordDto,
} from "./dto/auth.dto"

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // Маршрут для входа в систему
  @UsePipes(new ValidationPipe()) // Валидируем данные с помощью ValidationPipe
  @HttpCode(200)
  @Post("login") // Обрабатывает POST-запросы по /api/auth/login
  async login(@Body() dto: AuthDto, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...response } = await this.authService.login(dto);
    // this.authService.addRefreshTokenToResponse(res, refreshToken); // Больше не используем cookie
    return { ...response, refreshToken };
  }

  // Маршрут для регистрации
  @UsePipes(new ValidationPipe()) // Валидируем данные с помощью ValidationPipe
  @HttpCode(201) // Код ответа 201, так как создается новый ресурс
  @Post("register")
  async register(
    @Body() dto: AuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { refreshToken, ...response } =
        await this.authService.register(dto);
      // this.authService.addRefreshTokenToResponse(res, refreshToken); // Больше не используем cookie

      return { ...response, refreshToken };
    } catch (error) {
      throw error;
    }
  }

  // Маршрут для получения новых токенов
  @HttpCode(200)
  @Post("login/access-token")
  async getNewTokens(
    @Body("refreshToken") refreshToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      if (!refreshToken) {
        throw new UnauthorizedException("Refresh-токен не передан");
      }

      // Получаем новые токены
      const { refreshToken: newRefreshToken, ...response } =
        await this.authService.getNewTokens(refreshToken);

      // Добавляем новый refreshToken в response (cookie) — если хотите оставить совместимость, иначе можно убрать
      // this.authService.addRefreshTokenToResponse(res, newRefreshToken);

      return { ...response, refreshToken: newRefreshToken };
    } catch (error) {
      throw new UnauthorizedException("Невозможно обновить токены");
    }
  }

  // Маршрут для выхода из системы
  @HttpCode(200)
  @Post("logout")
  async logout(@Res({ passthrough: true }) res: Response) {
    // Удаляем refreshToken
    // this.authService.removeRefreshTokenFromResponse(res); // Больше не используем cookie
    return { message: "Выход выполнен успешно" };
  }

  @Post("verify-email")
  async verifyEmail(
    @Body() body: { email: string; code: string }
  ) {
    try {
      const tokens = await this.authService.verifyEmail(body.email, body.code);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        message: "Email успешно подтверждён"
      };
    } catch (error) {
      throw error;
    }
  }

  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.sendResetPasswordEmail(dto.email);
    return { message: "Ссылка для сброса отправлена на почту" };
  }

  @UsePipes(new ValidationPipe())
  @Post("reset-password/confirm")
  @HttpCode(200)
  async confirmResetPassword(@Body() dto: ConfirmResetPasswordDto) {
    const tokens = await this.authService.confirmResetPassword(
      dto.token,
      dto.password,
    );
    return { message: "Пароль успешно изменён", ...tokens };
  }

  @Post("resend-verification")
  @HttpCode(200)
  async resendVerification(@Body("email") email: string) {
    await this.authService.resendVerificationEmail(email);
    return { message: "Код подтверждения отправлен повторно" };
  }

  @Get("validate-promo/:code")
  @HttpCode(200)
  async validatePromoCode(@Param("code") code: string) {
    const isValid = await this.authService.validatePromoCode(code);
    return { valid: isValid };
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie("refreshToken", refreshToken, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  }
}
