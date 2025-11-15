import { Injectable } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name, { timestamp: true });

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.rambler.ru",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });

    this.transporter.verify((error, success) => {
      this.logger.log("success mail", success);
      if (error) {
        console.error("Error connecting to email server:", error);
      } else {
        console.log("Server is ready to take our messages");
      }
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    this.logger.log(`sendVerificationMail:`, {
      service: "MailService",
      mailTo: email,
      code,
    });
    await this.transporter.sendMail({
      from: `Frello AI <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Подтверждение регистрации",
      text: "Please activate your account.",
      html: `<p>Ваш код подтверждения: <b>${code}</b></p><p>Код действителен в течение 10 минут.</p>`,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
  ): Promise<void> {
    this.logger.log(`Отправка ссылки на сброс пароля на ${email}`);
    await this.transporter.sendMail({
      from: `Frello AI <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Сброс пароля",
      html: `
				<h2>Сброс пароля</h2>
				<p>Вы запросили сброс пароля. Перейдите по ссылке ниже:</p>
				<p><a href="${resetLink}" style="color: #3b82f6; font-weight: bold;">Задать новый пароль</a></p>
				<p>Или скопируйте ссылку:</p>
				<p><code>${resetLink}</code></p>
				<p><small>Ссылка действительна 15 минут. Если вы не запрашивали сброс — проигнорируйте письмо.</small></p>
			`,
    });
  }
}
