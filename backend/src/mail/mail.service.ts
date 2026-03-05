import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromEmail =
      this.config.get<string>('MAIL_FROM') ?? 'onboarding@example.com';
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  /**
   * Builds the magic link email HTML: clear, accessible layout.
   */
  private buildMagicLinkHtml(
    magicLink: string,
    expiresInDays: number = 3,
  ): string {
    const encodedLink = magicLink.replace(/&/g, '&amp;');
    const expiresText = expiresInDays === 1 ? '1 day' : `${expiresInDays} days`;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Continue your onboarding</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; color: #1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding: 40px 32px 32px;">
              <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #111827;">
                Continue your onboarding
              </h1>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                Hi,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">
                You requested to continue the process. Click the button below to pick up where you left off—it only takes a moment.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
                <tr>
                  <td style="border-radius: 8px; background-color: #2563eb;">
                    <a href="${encodedLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Continue now
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: #6b7280;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.5; word-break: break-all;">
                <a href="${encodedLink}" style="color: #2563eb; text-decoration: none;">${encodedLink}</a>
              </p>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                This link expires in ${expiresText}. If you didn't request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                You received this email because an access link was requested from your email address.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }

  /**
   * Sends the onboarding magic link by email.
   * If RESEND_API_KEY is not set, only logs to console (development).
   */
  async sendMagicLink(
    to: string,
    magicLink: string,
    expiresInDays: number = 3,
  ): Promise<void> {
    const subject = 'Your link to continue is ready';
    const html = this.buildMagicLinkHtml(magicLink, expiresInDays);

    if (!this.resend) {
      console.log('[MailService] RESEND_API_KEY not set. Simulated email:');
      console.log('  To:', to);
      console.log('  Magic link:', magicLink);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to: [to],
      subject,
      html,
    });

    if (error) {
      const isDomainNotVerified =
        (error as { statusCode?: number; name?: string }).statusCode === 403 ||
        (error as { name?: string }).name === 'validation_error';

      if (isDomainNotVerified && process.env.NODE_ENV !== 'production') {
        console.warn(
          '[MailService] Domain not verified in Resend. Email not sent. Use MAIL_FROM=onboarding@resend.dev for testing.',
        );
        console.log('  Magic link (dev):', magicLink);
        return;
      }

      console.error('[MailService] Error sending email:', error);
      throw new Error(
        `Failed to send email: ${error.message}. Verify your domain at https://resend.com/domains or use MAIL_FROM=onboarding@resend.dev for testing.`,
      );
    }
  }
}
