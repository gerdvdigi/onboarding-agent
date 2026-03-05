import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly supabase: SupabaseClient | null = null;
  private readonly bucketName: string;

  constructor(private readonly config: ConfigService) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.bucketName =
      this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'onboarding-pdfs';

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.logger.log(`StorageService initialized with bucket: ${this.bucketName}`);
    } else {
      this.logger.warn(
        'Supabase Storage not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
  }

  /**
   * Uploads a PDF buffer to Supabase Storage
   * @param buffer PDF file buffer
   * @param fileName File name (e.g., "implementation-plan-company-name.pdf")
   * @returns Public URL of the uploaded file, or null if upload fails
   */
  async uploadPdf(
    buffer: Buffer,
    fileName: string,
  ): Promise<string | null> {
    if (!this.supabase) {
      this.logger.error('Supabase client not initialized');
      return null;
    }

    try {
      // Ensure bucket exists (create if not)
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b) => b.name === this.bucketName);

      if (!bucketExists) {
        this.logger.warn(
          `Bucket ${this.bucketName} does not exist. Attempting to create...`,
        );
        const { error: createError } = await this.supabase.storage.createBucket(
          this.bucketName,
          {
            public: true, // Make bucket public so PDFs can be accessed via URL
            fileSizeLimit: 10485760, // 10MB limit
            allowedMimeTypes: ['application/pdf'],
          },
        );

        if (createError) {
          this.logger.error(
            `Failed to create bucket: ${createError.message}`,
            createError.stack,
          );
          return null;
        }
        this.logger.log(`Bucket ${this.bucketName} created successfully`);
      }

      // Upload file
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, buffer, {
          contentType: 'application/pdf',
          upsert: true, // Overwrite if exists
        });

      if (error) {
        this.logger.error(`Failed to upload PDF: ${error.message}`, error.stack);
        return null;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = this.supabase.storage.from(this.bucketName).getPublicUrl(fileName);

      this.logger.log(`PDF uploaded successfully: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      this.logger.error(
        `Unexpected error uploading PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }
}
