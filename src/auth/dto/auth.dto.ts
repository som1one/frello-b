import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class AuthDto {
  @IsEmail(
    {},
    { message: "Пожалуйста, укажите корректный адрес электронной почты" },
  )
  email: string;

  @IsString({ message: "Пароль должен быть строкой" })
  @MinLength(6, { message: "Пароль должен содержать не менее 6 символов" })
  password: string;

  @IsOptional()
  @IsString({ message: "Промокод должен быть строкой" })
  promoCode?: string;
}

export class ResetPasswordDto {
	@IsEmail({}, { message: 'Некорректный email' })
	email: string
}

export class ConfirmResetPasswordDto {
	@IsString({ message: 'Токен обязателен' })
	token: string

	@IsString({ message: 'Пароль обязателен' })
	@MinLength(6, { message: 'Пароль минимум 6 символов' })
	password: string
}