import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PDF, rgb, StandardFonts, measureText } from '@libpdf/core';
import { GeneratePdfRequestDto } from '../common/dto/pdf.dto';

const LINK_PLACEHOLDER = '\x00LINK_';
const LINK_PLACEHOLDER_END = '\x00';

const FONT_SIZE = 11;
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SUBTITLE = 13;
const FONT_SIZE_SECTION = 12;
const LINE_HEIGHT = 14;
const MARGIN = 50;
const PAGE_WIDTH = 595; // A4
const PAGE_HEIGHT = 842;

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

      const pdfBytes = await this.createPdfFromTemplate(plan, userInfo, fullPlanText);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="implementation-plan-${userInfo.company}.pdf"`,
      );
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Unknown error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private sanitize(text: string): string {
    // Normalize Unicode apostrophes/quotes to ASCII so they aren't stripped
    const normalized = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    return normalized.replace(/[^\x20-\x7E\n\r]/g, ' ').trim();
  }

  /**
   * Normalizes Markdown to match the same structure shown in the chat (ChatMessageContent).
   * Must mirror the frontend's normalizeMarkdown so PDF output matches chat display.
   */
  private normalizeMarkdown(content: string): string {
    let normalized = content;

    // 0. Fix broken brand names (HubSpot split across lines/spaces)
    normalized = normalized.replace(/Hub\s*\n+\s*Spot/gi, 'HubSpot');
    normalized = normalized.replace(/Hub\s+Spot(?=\s|[.,!?:;]|$)/gi, 'HubSpot');
    normalized = normalized.replace(/\bHub\s+Spot\b/gi, 'HubSpot');
    normalized = normalized.replace(/Hub[\s\n]+Spot/gi, 'HubSpot');

    // 1. Remove empty elements
    normalized = normalized.replace(/^#{1,6}\s*$/gm, '');
    normalized = normalized.replace(/^[-*]\s*$/gm, '');
    normalized = normalized.replace(/^([-*])\s+\n/gm, '\n');

    // 2. Join bullets with content on next line
    normalized = normalized.replace(/^([-*])\s*\n+\s*([A-Za-z\*\[])/gm, '$1 $2');
    normalized = normalized.replace(/^(\d+\.)\s*\n+\s*([A-Za-z\*\[])/gm, '$1 $2');

    // 3. Fix glued text
    normalized = normalized.replace(
      /^(#{1,6}\s+.+?)([a-zA-Z])([A-Z][a-z])/gm,
      (_m, header, lastChar, newWord) => `${header}${lastChar}\n\n${newWord}`,
    );
    normalized = normalized.replace(/Hub(?!Spot)([A-Z][a-z])/gi, 'Hub\n\n$1');
    normalized = normalized.replace(/(Stage|Step|Process|Setup|Automation)([A-Z][a-z])/g, '$1\n\n$2');
    normalized = normalized.replace(/([a-z])((?:Proposal|Discovery|Follow|Deal|Closed|Marketing|Sales|Service|Technical|Buyer|Lead|Account)\s+[A-Z])/g, '$1\n\n$2');
    normalized = normalized.replace(/([a-z])\*\*([A-Z][a-z])/g, '$1\n\n**$2');
    normalized = normalized.replace(/([a-z])(Deal|Step|Stage|Section|Properties|Automations|Where|Helpful|Campaign|Persona|Technical|Tracking|Privacy|Buyer|Lead|Forms|Chatbots)(?=[:\s])/g, '$1\n\n$2');
    normalized = normalized.replace(/([a-z])((?:Proposal|Where|Helpful|Properties|Automations|The trigger|A deal|Here are|Some of|Our initial)[^a-z])/g, '$1\n\n$2');

    // 4. Fix bold labels separated from content
    normalized = normalized.replace(/(\*\*[^*]+\*\*)\s*\n+\s*(:?\s*)/g, '$1$2');
    normalized = normalized.replace(/(\*\*[^*]+:\*\*)\s*\n+\s*([A-Za-z0-9])/g, '$1 $2');
    normalized = normalized.replace(/(\*\*[^*]+:\*\*)([A-Za-z])/g, '$1 $2');
    // Fix bold label glued to bullet: "**Objectives:**- Organize" -> "**Objectives:**\n\n- Organize"
    normalized = normalized.replace(/(\*\*[^*]+:\*\*)- ([A-Za-z])/g, '$1\n\n- $2');

    // 5. Fix numbers glued to text
    normalized = normalized.replace(/([a-zA-Z])(\d+\s+(?:days?|weeks?|hours?|minutes?|emails?))/gi, '$1 $2');
    normalized = normalized.replace(/(over|after|in|for)(\d)/gi, '$1 $2');
    normalized = normalized.replace(/(Persona|Campaign|Step|Stage|Process|Pipeline)(\d)/gi, '$1 $2');
    normalized = normalized.replace(/(\.)(\d+-)/g, '$1 $2');

    // 6. Ensure proper line breaks
    // Fix "Makers- Qualifier", "Automation- Triggered" (with or without ** before -)
    normalized = normalized.replace(/(Makers|Automation|Sequence|Segmentation)\*{0,2}(-\s+)(Qualifier|Triggered|For|Score|Create)/g, '$1\n\n$2$3');
    normalized = normalized.replace(/(Helpful Articles)(:\s*-\s*)([A-Za-z])/g, '$1:\n\n- $3');
    // Fix "Helpful Article:" or "Helpful Articles:" glued to content (no space before link or text)
    normalized = normalized.replace(/(Helpful Article[s]?):([A-Za-z\[\]])/g, '$1: $2');
    normalized = normalized.replace(/([a-zA-Z0-9.,!?:;\-\)])(#{1,6}\s)/g, '$1\n\n$2');
    normalized = normalized.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
    normalized = normalized.replace(/([a-zA-Z0-9])\*\*([A-Z][a-z]+.*?:)\*\*/g, '$1\n\n**$2**');
    normalized = normalized.replace(/([a-z])\*\*(?=Where|Helpful|Properties|Automations|Campaign|Persona|Technical)/g, '$1\n\n**');
    normalized = normalized.replace(/([a-zA-Z:.])([-*]\s+[A-Z\*\[])/g, '$1\n$2');
    normalized = normalized.replace(/^-([A-Za-z\*])/gm, '- $1');

    // 7. Final cleanup
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    normalized = normalized.replace(/^\s+$/gm, '');

    // 8. Final fix for HubSpot (run last)
    normalized = normalized.replace(/Hub[\s\n]+Spot/gi, 'HubSpot');

    return normalized;
  }

  /**
   * Draws text line by line, adding new pages when needed. Returns final y position.
   * Handles section headers, subsection headers, regular text, and clickable links.
   */
  private drawFlowText(
    page: { drawText: (text: string, opts: Record<string, unknown>) => void; addLinkAnnotation?: (opts: { rect: { x: number; y: number; width: number; height: number }; uri: string }) => void },
    pdf: { addPage: (opts?: { size?: string }) => { drawText: (text: string, opts: Record<string, unknown>) => void; addLinkAnnotation?: (opts: { rect: { x: number; y: number; width: number; height: number }; uri: string }) => void } },
    fontName: string,
    boldFontName: string,
    text: string,
    links: Array<{ text: string; url: string }>,
    x: number,
    y: number,
    size: number,
    options?: { boldTitles?: boolean },
  ): { page: typeof page; y: number } {
    const lines = text.split('\n');
    let currentPage = page;
    let currentY = y;
    const linkColor = rgb(0.1, 0.3, 0.6);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const safe = this.sanitize(line.replace(/\x00/g, ' '));
      
      // Skip empty lines but add spacing
      if (safe.length === 0) {
        currentY -= LINE_HEIGHT / 2;
        continue;
      }

      // Check for section separators (======= or -------)
      if (safe.match(/^[=-]{10,}$/)) {
        currentY -= LINE_HEIGHT / 4;
        continue;
      }

      // Check if we need a new page
      if (currentY < MARGIN + LINE_HEIGHT) {
        currentPage = pdf.addPage({ size: 'a4' });
        currentY = PAGE_HEIGHT - MARGIN;
      }

      // Determine formatting based on content
      let useBold = false;
      let useSize = size;
      let addSpacingBefore = false;

      // Main section headers (SALES HUB, MARKETING HUB, etc.)
      if (safe.match(/^(SALES HUB|MARKETING HUB|SERVICE HUB|ACCOUNT FOUNDATIONS)/i)) {
        useBold = true;
        useSize = FONT_SIZE_SECTION;
        addSpacingBefore = true;
      }
      // Subsection headers (ends with :)
      else if (safe.endsWith(':') && safe.length < 60) {
        useBold = true;
      }
      // Pipeline stage headers (contains "Stage -")
      else if (safe.includes('Stage -') || safe.includes('Stage:')) {
        useBold = true;
      }
      // "Where to do this", "Helpful Articles", "Where:", "- Where:" labels
      else if (safe.startsWith('Where to do this') || safe.startsWith('Helpful Articles') || safe.startsWith('Helpful Article:') || safe.match(/^[•\-]?\s*Where:/)) {
        useBold = true;
      }
      // Property name lines: "Company Size: Text Property" - bold the label part
      else if (safe.match(/^[•\-]?\s*.+:\s*(Text|Currency|Number|Date|Yes\/No|Dropdown|Owner)\s*Property/i)) {
        useBold = true;
      }
      // Generic bold detection from options
      else if (options?.boldTitles && safe.length < 60 && safe === safe.toUpperCase()) {
        useBold = true;
      }

      if (addSpacingBefore) {
        currentY -= LINE_HEIGHT;
      }

      // Check if line contains link placeholders (before sanitize strips them)
      const rawLine = lines[i];
      const hasLinks = rawLine.includes(LINK_PLACEHOLDER) && links.length > 0;

      if (hasLinks) {
        const parts = rawLine.split(/\x00LINK_(\d+)\x00/);
        const segments: Array<{ type: 'text' | 'link'; value: string; linkIdx?: number }> = [];
        for (let p = 0; p < parts.length; p++) {
          if (p % 2 === 1) {
            const idx = parseInt(parts[p], 10);
            if (links[idx]) segments.push({ type: 'link', value: links[idx].text, linkIdx: idx });
          } else if (parts[p].length > 0) {
            segments.push({ type: 'text', value: this.sanitize(parts[p]) });
          }
        }
        const maxWidth = PAGE_WIDTH - MARGIN * 2;
        let currentX = x;
        for (const seg of segments) {
          if (currentY < MARGIN + LINE_HEIGHT) {
            currentPage = pdf.addPage({ size: 'a4' });
            currentY = PAGE_HEIGHT - MARGIN;
          }
          if (seg.type === 'text') {
            const wrapped = this.wrapText(seg.value, 90);
            for (const wline of wrapped) {
              const w = measureText(wline, (useBold ? boldFontName : fontName) as any, useSize);
              if (currentX + w > x + maxWidth && currentX > x) {
                currentX = x;
                currentY -= LINE_HEIGHT;
                if (currentY < MARGIN + LINE_HEIGHT) {
                  currentPage = pdf.addPage({ size: 'a4' });
                  currentY = PAGE_HEIGHT - MARGIN;
                }
              }
              currentPage.drawText(wline, {
                x: currentX,
                y: currentY,
                size: useSize,
                font: useBold ? boldFontName : fontName,
                color: rgb(0.1, 0.1, 0.1),
              });
              currentX += w;
            }
          } else if (seg.type === 'link' && seg.linkIdx !== undefined && links[seg.linkIdx]) {
            const link = links[seg.linkIdx];
            const linkText = link.text;
            const w = measureText(linkText, fontName as any, size);
            if (currentX + w > x + maxWidth && currentX > x) {
              currentX = x;
              currentY -= LINE_HEIGHT;
              if (currentY < MARGIN + LINE_HEIGHT) {
                currentPage = pdf.addPage({ size: 'a4' });
                currentY = PAGE_HEIGHT - MARGIN;
              }
            }
            currentPage.drawText(linkText, {
              x: currentX,
              y: currentY,
              size,
              font: fontName,
              color: linkColor,
            });
            if (typeof (currentPage as any).addLinkAnnotation === 'function') {
              (currentPage as any).addLinkAnnotation({
                rect: { x: currentX, y: currentY - LINE_HEIGHT, width: w, height: LINE_HEIGHT },
                uri: link.url,
              });
            }
            currentX += w;
          }
          useBold = false;
        }
        currentY -= LINE_HEIGHT;
      } else {
        const wrappedLines = this.wrapText(safe, 90);
        for (const wrappedLine of wrappedLines) {
          if (currentY < MARGIN + LINE_HEIGHT) {
            currentPage = pdf.addPage({ size: 'a4' });
            currentY = PAGE_HEIGHT - MARGIN;
          }
          currentPage.drawText(wrappedLine, {
            x,
            y: currentY,
            size: useSize,
            font: useBold ? boldFontName : fontName,
            color: rgb(0.1, 0.1, 0.1),
          });
          currentY -= LINE_HEIGHT;
          useBold = false;
        }
      }
    }
    return { page: currentPage, y: currentY };
  }

  /** Converts Markdown to structured plain text for PDF, preserving hierarchy. Returns content and extracted links for clickable annotations. */
  private markdownToPlainText(md: string): { content: string; links: Array<{ text: string; url: string }> } {
    // Apply same normalization as chat display so PDF matches what user sees
    let text = this.normalizeMarkdown(md);

    // 0. Remove intro phrases that shouldn't be in the plan
    text = text.replace(/You have completed the discovery phase![^.]*\./g, '');
    text = text.replace(/I will now proceed to gather[^.]*\./g, '');
    text = text.replace(/Please hold on for a moment\./g, '');
    text = text.replace(/Now, I will call the tools[^.]*\./g, '');
    text = text.replace(/Based on our discovery and HubSpot best practices, here is your tailored Implementation Plan:/g, '');

    // 1. Fix headers glued to content (e.g., "## SALES HUBHere are" -> "## SALES HUB\n\nHere are")
    text = text.replace(/^(#{1,6}\s+[A-Z][A-Z\s]+)([A-Z][a-z])/gm, '$1\n\n$2');
    text = text.replace(/^(#{1,6}\s+.*?[a-z])([A-Z][a-z])/gm, '$1\n\n$2');

    // 2. Fix numbers glued to text
    text = text.replace(/([a-zA-Z])(\d+\s+(?:days?|weeks?|hours?|minutes?|emails?))/gi, '$1 $2');
    text = text.replace(/(over|after|in|for|than)(\d)/gi, '$1 $2');
    text = text.replace(/(Persona|Campaign|Step|Stage|Process)(\d)/gi, '$1 $2');

    // 3. Convert headers to uppercase labels
    text = text.replace(/^# (.+)$/gm, '\n$1\n' + '='.repeat(50));
    text = text.replace(/^## (.+)$/gm, '\n\n$1\n' + '-'.repeat(40));
    text = text.replace(/^### (.+)$/gm, '\n$1:');

    // 4. Keep bold text but remove markdown syntax
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');

    // 5. Extract links and replace with placeholders for clickable PDF links
    const links: Array<{ text: string; url: string }> = [];
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
      const idx = links.length;
      links.push({ text: linkText, url });
      return `${LINK_PLACEHOLDER}${idx}${LINK_PLACEHOLDER_END}`;
    });

    // 5b. Ensure space after "Helpful Article:" when followed by link placeholder
    text = text.replace(/(Helpful Article[s]?):(\s*)(\x00LINK_)/g, '$1: $3');

    // 6. Clean up bullet points
    text = text.replace(/^- /gm, '• ');

    // 7. Fix text glued after labels (e.g., "Property:Value" -> "Property: Value")
    text = text.replace(/([a-z]):([A-Z])/g, '$1: $2');

    // 8. Fix "Helpful Articles:" stuck to next line
    text = text.replace(/(Helpful Articles:)\s*([•\[])/g, '$1\n$2');

    // 9. Remove trailing "---" from lines (horizontal rule remnants from markdown)
    text = text.replace(/\s*-{3,}\s*$/gm, '');

    // 10. Remove excessive newlines
    text = text.replace(/\n{4,}/g, '\n\n\n');

    return { content: text.trim(), links };
  }

  private async createPdfFromTemplate(plan: any, userInfo: any, fullPlanText?: string): Promise<Uint8Array> {
    const pdf = PDF.create();

    // Document metadata
    pdf.setTitle('HubSpot Implementation Plan');
    pdf.setAuthor('Digifianz');

    const fontName = StandardFonts.Helvetica;
    const boldFontName = StandardFonts.HelveticaBold;

    const companyDomain = userInfo.website || plan.company || 'Your Company';
    const hubsList = this.getHubsList(plan);
    const mainGoals = (plan.objectives || []).join('; ');
    const planResult: { content: string; links: Array<{ text: string; url: string }> } = fullPlanText
      ? this.markdownToPlainText(fullPlanText)
      : { content: this.buildPlanContent(plan), links: [] };

    // ---------- PAGE 1: Cover + Disclaimer ----------
    let page: { drawText: (text: string, opts: Record<string, unknown>) => void } = pdf.addPage({ size: 'a4' });
    let y = PAGE_HEIGHT - MARGIN;

    page.drawText('HubSpot Implementation Plan', {
      x: MARGIN,
      y,
      size: FONT_SIZE_TITLE,
      font: boldFontName,
      color: rgb(0.1, 0.1, 0.2),
    });
    y -= 28;

    page.drawText(`AI-Assisted HubSpot Implementation for ${this.sanitize(companyDomain)}`, {
      x: MARGIN,
      y,
      size: FONT_SIZE_SUBTITLE,
      font: fontName,
      color: rgb(0.2, 0.2, 0.3),
    });
    y -= 24;

    const disclaimer = `Disclaimer: This Implementation Plan has been generated with the assistance of artificial intelligence and is provided as a draft. Due to the nature of AI, it may contain errors, omissions, or inconsistencies. As outlined in the Terms and Conditions agreed to at the start of this service, Digifianz makes no guarantees regarding the accuracy or completeness of AI-generated outputs and shall not be liable for damages or issues resulting from reliance on them. The Client is solely responsible for reviewing and confirming the plan's suitability before implementation. Please note that you have already agreed to these Terms and Conditions prior to the creation of this plan.`;
    const disclaimerLines = this.wrapText(disclaimer, 85);
    for (const dline of disclaimerLines) {
      if (y < MARGIN + LINE_HEIGHT) break;
      page.drawText(dline, { x: MARGIN, y, size: 9, font: fontName, color: rgb(0.2, 0.2, 0.2) });
      y -= 12;
    }
    y -= 20;

    // Page numbers will be added at the end after we know total pages

    // ---------- PAGE 2: Summary + Plan ----------
    page = pdf.addPage({ size: 'a4' });
    y = PAGE_HEIGHT - MARGIN;

    page.drawText('Summary:', { x: MARGIN, y, size: FONT_SIZE_SECTION, font: boldFontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT + 4;

    page.drawText(`HubSpot Implementation Plan For: ${this.sanitize(companyDomain)}`, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT;

    const hubsText = `Hubs to be Implemented: ${this.sanitize(hubsList)}`;
    for (const hubsLine of this.wrapText(hubsText, 90)) {
      page.drawText(hubsLine, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.1, 0.1, 0.2) });
      y -= LINE_HEIGHT;
    }

    page.drawText('Main Implementation Goals:', { x: MARGIN, y, size: FONT_SIZE, font: boldFontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT;
    const goalsLines = this.wrapText(mainGoals, 85);
    for (const g of goalsLines) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = pdf.addPage({ size: 'a4' });
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(g, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.15, 0.15, 0.15) });
      y -= LINE_HEIGHT;
    }
    y -= 8;

    page.drawText('The Implementation Plan:', { x: MARGIN, y, size: FONT_SIZE, font: boldFontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT;

    const result = this.drawFlowText(page, pdf, fontName, boldFontName, planResult.content, planResult.links, MARGIN, y, FONT_SIZE, { boldTitles: true });
    page = result.page;
    y = result.y - 12;

    page.drawText('Resources:', { x: MARGIN, y, size: FONT_SIZE, font: boldFontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT;
    page.drawText('Relevant HubSpot Knowledge Base articles and navigation paths are included in the plan above.', { x: MARGIN, y, size: 10, font: fontName, color: rgb(0.3, 0.3, 0.3) });
    y -= LINE_HEIGHT + 8;

    page.drawText('Next Steps:', { x: MARGIN, y, size: FONT_SIZE, font: boldFontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT;
    const nextSteps = "Our team will reach out shortly to request access to your account. Once access is confirmed, we'll complete the implementation steps outlined above within the included three (3) hours and then send you a summary of what's been set up.";
    for (const ns of this.wrapText(nextSteps, 85)) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = pdf.addPage({ size: 'a4' });
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(ns, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.2, 0.2, 0.2) });
      y -= LINE_HEIGHT;
    }
    y -= 8;
    const noteText = "Note: This plan was AI-assisted and may contain errors. As per the Terms and Conditions already agreed, the Client is responsible for reviewing and confirming its suitability.";
    for (const noteLine of this.wrapText(noteText, 90)) {
      if (y < MARGIN + LINE_HEIGHT) {
        page = pdf.addPage({ size: 'a4' });
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(noteLine, { x: MARGIN, y, size: 9, font: fontName, color: rgb(0.35, 0.35, 0.35) });
      y -= 12;
    }

    // ---------- PAGE 3: Closing + Need Help ----------
    page = pdf.addPage({ size: 'a4' });
    y = PAGE_HEIGHT - MARGIN;

    const p3a = "Depending on the complexity of your plan, some items may remain after those three hours. If that happens, we'll equip you with clear resources and a step-by-step plan so your team can move forward confidently.";
    for (const l of this.wrapText(p3a, 85)) {
      page.drawText(l, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.2, 0.2, 0.2) });
      y -= LINE_HEIGHT;
    }
    y -= LINE_HEIGHT;

    const p3b = "And if you'd like to accelerate results or go deeper with expert guidance, you're welcome to add more hands-on hours with our team—many clients choose this option to get even more value from their investment.";
    for (const l of this.wrapText(p3b, 85)) {
      page.drawText(l, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.2, 0.2, 0.2) });
      y -= LINE_HEIGHT;
    }
    y -= LINE_HEIGHT;

    const p3c = "Either way, you'll leave this process with the foundations in place and a clear path forward—ready to grow today and well into the future.";
    for (const l of this.wrapText(p3c, 85)) {
      page.drawText(l, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.2, 0.2, 0.2) });
      y -= LINE_HEIGHT;
    }
    y -= 20;

    page.drawText('Need Help?', { x: MARGIN, y, size: FONT_SIZE_SECTION, font: boldFontName, color: rgb(0.1, 0.1, 0.2) });
    y -= LINE_HEIGHT;
    const helpText = 'Feel free to send an email to help@digifianz.com at any time, and we would be happy to assist you with any questions you may have.';
    for (const helpLine of this.wrapText(helpText, 90)) {
      page.drawText(helpLine, { x: MARGIN, y, size: FONT_SIZE, font: fontName, color: rgb(0.2, 0.2, 0.2) });
      y -= LINE_HEIGHT;
    }
    y -= 8;
    const finalNote = "Note: This plan was AI-assisted and may contain errors. As per the Terms and Conditions already agreed, the Client is responsible for reviewing and confirming its suitability.";
    for (const finalNoteLine of this.wrapText(finalNote, 90)) {
      page.drawText(finalNoteLine, { x: MARGIN, y, size: 9, font: fontName, color: rgb(0.35, 0.35, 0.35) });
      y -= 12;
    }

    // Add page numbers to all pages
    const pages = pdf.getPages();
    const totalPages = pages.length;
    for (let i = 0; i < totalPages; i++) {
      pages[i].drawText(`-- ${i + 1} of ${totalPages} --`, {
        x: MARGIN,
        y: MARGIN - 10,
        size: 10,
        font: fontName,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    return await pdf.save();
  }

  private wrapText(text: string, maxChars: number): string[] {
    const out: string[] = [];
    const words = text.split(/\s+/);
    let line = '';
    for (const w of words) {
      if (line.length + w.length + 1 <= maxChars) {
        line += (line ? ' ' : '') + w;
      } else {
        if (line) out.push(line);
        line = w.length > maxChars ? w.substring(0, maxChars) : w;
      }
    }
    if (line) out.push(line);
    return out;
  }

  private getHubsList(plan: any): string {
    const modules = plan.modules || plan.modulos || [];
    const names = modules
      .map((m: any) => m.name || m.nombre || '')
      .filter(Boolean)
      .filter((n: string) => !n.toLowerCase().includes('framework') && !n.toLowerCase().includes('data architecture'));
    if (names.length === 0) return 'As per discovery (Sales, Marketing, and/or Service Hub)';
    return names.join(', ');
  }

  private buildPlanContent(plan: any): string {
    const modules = plan.modules || plan.modulos || [];
    const recommendations = plan.recommendations || plan.recomendaciones || [];

    const objectives = (plan.objectives || [])
      .map((o: string, i: number) => `${i + 1}. ${o}`)
      .join('\n');

    // Build structured content per Hub
    const hubSections: string[] = [];
    
    for (const m of modules) {
      const name = (m.name || m.nombre || 'Module').toUpperCase();
      const desc = m.description || m.descripcion || '';
      
      if (name.includes('SALES')) {
        hubSections.push([
          '\nSALES HUB',
          '-'.repeat(40),
          desc,
          '',
          'Key steps:',
          '• Configure deal pipeline stages based on your sales process',
          '• Create custom deal properties for tracking key data',
          '• Set up automations for follow-ups and notifications',
          '',
          'Where to do this in HubSpot:',
          '• Pipeline: Settings > Data Management > Deals > Pipelines',
          '• Properties: Settings > Data Management > Properties > Deals',
          '• Automations: Automations > Workflows',
        ].join('\n'));
      } else if (name.includes('MARKETING')) {
        hubSections.push([
          '\nMARKETING HUB',
          '-'.repeat(40),
          desc,
          '',
          'Key steps:',
          '• Install tracking code on all website pages',
          '• Set up buyer personas and lifecycle stages',
          '• Create email campaigns and lead nurturing workflows',
          '',
          'Where to do this in HubSpot:',
          '• Tracking: Settings > Tracking & Analytics > Tracking Code',
          '• Personas: Settings > Data Management > Properties > Contacts > Persona',
          '• Workflows: Automations > Workflows',
        ].join('\n'));
      } else if (name.includes('SERVICE')) {
        hubSections.push([
          '\nSERVICE HUB',
          '-'.repeat(40),
          desc,
          '',
          'Key steps:',
          '• Configure ticket pipeline stages',
          '• Set up support forms with automatic ticket creation',
          '• Create feedback surveys (CSAT, NPS)',
          '',
          'Where to do this in HubSpot:',
          '• Pipeline: Settings > Data Management > Tickets > Pipelines',
          '• Forms: Marketing > Lead Capture > Forms',
          '• Surveys: Service > Feedback Surveys',
        ].join('\n'));
      } else {
        // Generic module
        hubSections.push([
          `\n${name}`,
          '-'.repeat(40),
          desc,
        ].join('\n'));
      }
    }

    const recText = recommendations.length > 0
      ? recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')
      : 'See detailed recommendations in the plan sections above.';

    return [
      'Objectives:',
      objectives,
      '',
      ...hubSections,
      '',
      'Additional Recommendations:',
      recText,
    ].join('\n');
  }
}
