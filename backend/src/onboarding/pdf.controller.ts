import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake');
import { GeneratePdfRequestDto } from '../common/dto/pdf.dto';
import { normalizeMarkdown } from '../common/utils/normalize-markdown';

const PDF_FONTS = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};
pdfmake.addFonts(PDF_FONTS);

// PdfMake types - doc definition structure
type PdfContent = Record<string, unknown> | string | (Record<string, unknown> | string)[];

@Controller('generate-pdf')
export class PdfController {
  @Post()
  async generatePdf(
    @Body() request: GeneratePdfRequestDto,
    @Res() res: Response,
  ) {
    try {
      const { plan, userInfo, fullPlanText } = request;

      if (!plan || !userInfo) {
        throw new HttpException(
          'Plan and userInfo are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const pdfBuffer = await this.createPdfWithPdfMake(plan, userInfo, fullPlanText);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="implementation-plan-${userInfo.company}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Unknown error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private preprocessPlanForPdf(md: string): string {
    let s = md;
    s = s.replace(/\n#?\s*[A-Za-z0-9][A-Za-z0-9\s\-]*\s+Implementation\s+Plan\s*\n/gi, '\n');
    s = s.replace(/Let me know if this plan works for you[^.!]*[.!]\s*/gi, '');
    s = s.replace(/\b(SALES|MARKETING|SERVICE)\s+Hub\b/gi, '$1 HUB');
    // Remove redundant Objectives block (already shown in Summary as Main Implementation Goals)
    s = s.replace(
      /\n\*\*Objectives:\*\*\s*\n(?:Need\/Objective\s*#?\d+[^\n]*\n?)+/gi,
      '\n',
    );
    s = s.replace(
      /\nObjectives:\s*\n(?:Need\/Objective\s*#?\d+[^\n]*\n?)+/gi,
      '\n',
    );
    return s;
  }

  private parseHubsFromPlan(fullPlanText?: string): string[] {
    if (!fullPlanText) return [];
    const matches = [...fullPlanText.matchAll(/##\s+(SALES\s+HUB|MARKETING\s+HUB|SERVICE\s+HUB)/gi)];
    const seen = new Set<string>();
    const hubs: string[] = [];
    for (const m of matches) {
      const hub = m[1].trim();
      if (!seen.has(hub.toUpperCase())) {
        seen.add(hub.toUpperCase());
        hubs.push(hub);
      }
    }
    return hubs;
  }

  private parseObjectivesFromPlan(fullPlanText?: string): string[] {
    if (!fullPlanText) return [];
    const objectives: string[] = [];
    // Match "Need/Objective #N: text" or "**Need/Objective #N:** text"
    const needMatches = [...fullPlanText.matchAll(/(?:\*\*)?Need\/Objective\s*#?\d+\s*(?:\*\*)?:?\s*([^\n*]+)/gi)];
    for (const m of needMatches) {
      const text = m[1].trim().replace(/\*\*/g, '');
      if (text.length > 2 && text.length < 200) objectives.push(text);
    }
    if (objectives.length > 0) return objectives;
    // Fallback: "main objectives... include [goal1, goal2, goal3]"
    const includeMatch = fullPlanText.match(/objectives?\s+(?:you are looking to achieve[^.]*\.?\s*)?include\s*\[([^\]]+)\]/i);
    if (includeMatch) {
      return includeMatch[1].split(',').map((s) => s.trim()).filter((s) => s.length > 2);
    }
    return [];
  }

  private markdownToPdfContent(md: string): PdfContent[] {
    const lines = md.trim().split('\n');
    const content: PdfContent[] = [];
    let listItems: PdfContent[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        content.push({ ul: listItems, margin: [0, 4], lineHeight: 1.4 });
        listItems = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        content.push({ text: ' ', margin: [0, 2] });
        continue;
      }

      // ## Header
      if (trimmed.match(/^##\s+.+$/)) {
        flushList();
        const text = trimmed.replace(/^##\s+/, '').replace(/\*\*/g, '');
        content.push({ text, style: 'sectionHeader', margin: [0, 12, 0, 6] });
        continue;
      }

      // ### Subheader
      if (trimmed.match(/^###\s+.+$/)) {
        flushList();
        const text = trimmed.replace(/^###\s+/, '').replace(/\*\*/g, '');
        content.push({ text, style: 'subHeader', margin: [0, 10, 0, 4] });
        continue;
      }

      // List item: • or - or * or 1.
      const listMatch = trimmed.match(/^([•\-*]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        const itemContent = this.parseInlineFormatting(listMatch[2]);
        listItems.push({ text: itemContent, margin: [0, 1] });
        continue;
      }

      // Label ending with : (bold)
      if (trimmed.endsWith(':') && trimmed.length < 80) {
        flushList();
        content.push({
          text: this.parseInlineFormatting(trimmed),
          bold: true,
          margin: [0, 6, 0, 2],
        });
        continue;
      }

      // Paragraph with possible **bold**
      flushList();
      content.push({
        text: this.parseInlineFormatting(trimmed),
        margin: [0, 2],
      });
    }
    flushList();

    return content;
  }

  private parseInlineFormatting(
    text: string,
  ): string | { text: string; bold?: boolean; link?: string; color?: string; decoration?: string } | (string | { text: string; bold?: boolean; link?: string; color?: string; decoration?: string })[] {
    let s = text;
    // ** at start without closing ** -> bold rest of line
    if (s.startsWith('**') && !s.includes('**', 2)) {
      return { text: s.slice(2), bold: true };
    }
    const result: (string | { text: string; bold?: boolean; link?: string; color?: string; decoration?: string })[] = [];
    let remaining = s;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

      let nextBold = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
      let nextLink = linkMatch ? remaining.indexOf(linkMatch[0]) : -1;
      if (nextBold === -1) nextBold = Infinity;
      if (nextLink === -1) nextLink = Infinity;

      if (nextBold < nextLink && nextBold !== Infinity) {
        if (nextBold > 0) result.push(remaining.slice(0, nextBold));
        result.push({ text: boldMatch![1], bold: true });
        remaining = remaining.slice(nextBold + boldMatch![0].length);
      } else if (nextLink < nextBold && nextLink !== Infinity) {
        if (nextLink > 0) result.push(remaining.slice(0, nextLink));
        let url = linkMatch![2].trim();
        if (url && !/^https?:\/\//i.test(url)) {
          url = 'https://' + url;
        }
        result.push({
          text: linkMatch![1],
          link: url,
          color: '#2563eb',
          decoration: 'underline',
        });
        remaining = remaining.slice(nextLink + linkMatch![0].length);
      } else {
        result.push(remaining);
        break;
      }
    }

    return result.length === 1 && typeof result[0] === 'string' ? result[0] : result;
  }

  private async createPdfWithPdfMake(
    plan: GeneratePdfRequestDto['plan'],
    userInfo: GeneratePdfRequestDto['userInfo'],
    fullPlanText?: string,
  ): Promise<Buffer> {
    const companyName = plan.company || userInfo.company || 'Your Company';
    const companyDomain = userInfo.website
      ? (userInfo.website.startsWith('http') ? userInfo.website : `https://${userInfo.website}`)
      : undefined;

    const hubs = this.parseHubsFromPlan(fullPlanText);
    const hubsList = hubs.length > 0 ? hubs.join(', ') : '';

    let planMd = fullPlanText ? normalizeMarkdown(fullPlanText) : '';
    planMd = this.preprocessPlanForPdf(planMd);
    const planContent = fullPlanText
      ? this.markdownToPdfContent(planMd)
      : this.fallbackPlanContent(plan);

    const fullDisclaimerText =
      'This Implementation Plan has been generated with the assistance of artificial intelligence and is provided as a draft. Due to the nature of AI, it may contain errors, omissions, or inconsistencies. As outlined in the Terms and Conditions agreed to at the start of this service, Digifianz makes no guarantees regarding the accuracy or completeness of AI-generated outputs and shall not be liable for damages or issues resulting from reliance on them. The Client is solely responsible for reviewing and confirming the plan\'s suitability before implementation. Please note that you have already agreed to these Terms and Conditions prior to the creation of this plan.';

    const closingNoteText =
      'This plan was AI-assisted and may contain errors. As per the Terms and Conditions already agreed, the Client is responsible for reviewing and confirming its suitability.';

    let logoBase64: string | null = null;
    const logoPath = path.join(process.cwd(), 'assets', 'digi-logo.png');
    try {
      if (fs.existsSync(logoPath)) {
        logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath, 'base64');
      }
    } catch {
      // Logo opcional
    }

    const docDefinition: Record<string, unknown> = {
      pageSize: 'A4',
      pageMargins: [50, 50, 50, 80],
      footer: (currentPage: number, pageCount: number) => {
        const pageNumText = `-- ${currentPage} of ${pageCount} --`;
        if (currentPage === 1) {
          return {
            stack: [
              {
                text: [
                  { text: 'Disclaimer', bold: true, italics: true },
                  { text: ': ' + fullDisclaimerText, italics: true },
                ],
                style: 'disclaimer',
                alignment: 'left',
                margin: [50, 0, 50, 0],
              },
              { text: pageNumText, alignment: 'center' as const, fontSize: 9, color: '#9ca3af', margin: [0, 8, 0, 0] },
            ],
          };
        }
        return {
          stack: [
            {
              text: [
                { text: 'Note', bold: true, italics: true },
                { text: ': ' + closingNoteText, italics: true },
              ],
              style: 'disclaimer',
              alignment: 'left',
              margin: [50, 0, 50, 0],
            },
            { text: pageNumText, alignment: 'center' as const, fontSize: 9, color: '#9ca3af', margin: [0, 8, 0, 0] },
          ],
        };
      },
      defaultStyle: { fontSize: 11, font: 'Roboto', lineHeight: 1.2 },
      styles: {
        coverTitle: { fontSize: 32, bold: true },
        coverSubtitle: { fontSize: 16, color: '#4b5563' },
        coverCompany: { fontSize: 24, bold: true },
        disclaimer: { fontSize: 8, color: '#6b7280' },
        mainSectionHeader: { fontSize: 18, bold: true },
        sectionHeader: { fontSize: 14, bold: true },
        subHeader: { fontSize: 11, bold: true },
        needHelp: { fontSize: 14, bold: true },
        finalNote: { fontSize: 9, color: '#6b7280', italics: true },
      },
      content: [
        // Page 1: Cover
        ...(logoBase64
          ? [
              { image: logoBase64, width: 220, alignment: 'center' as const, margin: [0, 40, 0, 40] },
            ]
          : []),
        { text: 'HubSpot Implementation Plan', style: 'coverTitle', alignment: 'center', margin: [0, logoBase64 ? 0 : 80, 0, 32] },
        { text: 'AI-Assisted HubSpot Implementation for', style: 'coverSubtitle', alignment: 'center', margin: [0, 0, 0, 12] },
        companyDomain
          ? { text: companyName, style: 'coverCompany', alignment: 'center', margin: [0, 0, 0, 60], link: companyDomain }
          : { text: companyName, style: 'coverCompany', alignment: 'center', margin: [0, 0, 0, 60] },

        { text: ' ', pageBreak: 'after' },

        // Page 2: Summary + Plan
        { text: 'Summary:', style: 'mainSectionHeader', margin: [0, 0, 0, 8] },
        ...(hubsList
          ? [
              { text: 'Hubs to be Implemented:', style: 'subHeader', margin: [0, 8, 0, 4] },
              { text: hubsList, margin: [0, 0, 0, 12] },
            ]
          : []),
        { text: 'Main Implementation Goals:', style: 'subHeader', margin: [0, 8, 0, 4] },
        {
          ul: (plan.objectives?.length ? plan.objectives : this.parseObjectivesFromPlan(fullPlanText))
            .map((o) => ({ text: o, margin: [0, 2] })),
          margin: [0, 0, 0, 16],
          lineHeight: 1.4,
        },
        {
          table: {
            widths: ['*'],
            body: [[{ text: '', border: [false, false, false, true] }]],
          },
          margin: [0, 0, 0, 20],
        },
        { text: 'The Implementation Plan:', style: 'mainSectionHeader', margin: [0, 8, 0, 8] },
        ...planContent,

        // Resources + Next Steps
        {
          table: {
            widths: ['*'],
            body: [[{ text: '', border: [false, false, false, true] }]],
          },
          margin: [0, 0, 0, 20],
        },
        { text: 'Resources:', style: 'mainSectionHeader', margin: [0, 8, 0, 8] },
        {
          text: 'Relevant HubSpot Knowledge Base articles and navigation paths are included in the plan above.',
          margin: [0, 0, 0, 16],
        },
        { text: 'Next Steps:', style: 'subHeader', margin: [0, 0, 0, 4] },
        {
          text: "Our team will reach out shortly to request access to your account. Once access is confirmed, we'll complete the implementation steps outlined above within the included three (3) hours and then send you a summary of what's been set up.",
          margin: [0, 0, 0, 0],
        },

        // Closing page
        {
          text: "Depending on the complexity of your plan, some items may remain after those three hours. If that happens, we'll equip you with clear resources and a step-by-step plan so your team can move forward confidently.",
          margin: [0, 0, 0, 12],
        },
        {
          text: "And if you'd like to accelerate results or go deeper with expert guidance, you're welcome to add more hands-on hours with our team—many clients choose this option to get even more value from their investment.",
          margin: [0, 0, 0, 12],
        },
        {
          text: 'Either way, you\'ll leave this process with the foundations in place and a clear path forward—ready to grow today and well into the future.',
          margin: [0, 0, 0, 24],
        },
        { text: 'Need Help?', style: 'needHelp', margin: [0, 0, 0, 8] },
        {
          text: [
            'Feel free to send an email to ',
            { text: 'help@digifianz.com', link: 'mailto:help@digifianz.com', color: '#2563eb' },
            ' at any time, and we would be happy to assist you with any questions you may have.',
          ],
          margin: [0, 0, 0, 32],
        },
      ],
    };

    const pdf = pdfmake.createPdf(docDefinition);
    return pdf.getBuffer();
  }

  private fallbackPlanContent(plan: GeneratePdfRequestDto['plan']): PdfContent[] {
    const content: PdfContent[] = [
      { text: 'Objectives', style: 'subHeader', margin: [0, 0, 0, 8] },
      {
        ul: plan.objectives.map((o) => ({ text: o, margin: [0, 2] })),
        margin: [0, 0, 0, 16],
        lineHeight: 1.4,
      },
    ];
    if (plan.recommendations?.length) {
      content.push(
        { text: 'Recommendations', style: 'subHeader', margin: [0, 8, 0, 8] },
        {
          ul: plan.recommendations.map((r) => ({ text: r, margin: [0, 2] })),
          margin: [0, 0, 0, 0],
          lineHeight: 1.4,
        },
      );
    }
    return content;
  }
}
