import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';

// Importaciones condicionales de proveedores
let OpenAIEmbeddings: any;
let CohereEmbeddings: any;
let HuggingFaceInferenceEmbeddings: any;
let OllamaEmbeddings: any;
let VoyageEmbeddings: any;

try {
  const openai = require('@langchain/openai');
  OpenAIEmbeddings = openai.OpenAIEmbeddings;
} catch (e) {
  // OpenAI no instalado
}

try {
  const cohere = require('@langchain/cohere');
  CohereEmbeddings = cohere.CohereEmbeddings;
} catch (e) {
  // Cohere no instalado
}

try {
  const hf = require('@langchain/community/embeddings/hf');
  HuggingFaceInferenceEmbeddings = hf.HuggingFaceInferenceEmbeddings;
} catch (e) {
  // HuggingFace no instalado
}

try {
  const ollama = require('@langchain/community/embeddings/ollama');
  OllamaEmbeddings = ollama.OllamaEmbeddings;
} catch (e) {
  // Ollama no instalado
}

try {
  const voyage = require('@langchain/community/embeddings/voyage');
  VoyageEmbeddings = voyage.VoyageEmbeddings;
} catch (e) {
  // Voyage AI no instalado
}

type EmbeddingProvider =
  | 'openai'
  | 'cohere'
  | 'huggingface'
  | 'ollama'
  | 'voyage';

interface EmbeddingConfig {
  provider: EmbeddingProvider;
  dimensions: number;
  modelName?: string;
}

@Injectable()
export class PineconeService implements OnModuleInit {
  private readonly logger = new Logger(PineconeService.name);
  private pineconeClient: Pinecone | null = null;
  private indexName: string;
  private embeddings: Embeddings;
  private vectorStore: PineconeStore | null = null;
  private embeddingConfig: EmbeddingConfig;

  constructor(private configService: ConfigService) {
    this.indexName =
      this.configService.get<string>('PINECONE_INDEX_NAME') || 'hubspot-cases';
    this.embeddings = this.createEmbeddings();
  }

  private createEmbeddings(): Embeddings {
    const provider = (this.configService.get<string>('EMBEDDING_PROVIDER') ||
      'openai') as EmbeddingProvider;

    this.logger.log(`Inicializando embeddings con proveedor: ${provider}`);

    switch (provider) {
      case 'cohere':
        return this.createCohereEmbeddings();
      case 'huggingface':
        return this.createHuggingFaceEmbeddings();
      case 'ollama':
        return this.createOllamaEmbeddings();
      case 'voyage':
        return this.createVoyageAIEmbeddings();
      case 'openai':
      default:
        return this.createOpenAIEmbeddings();
    }
  }

  private createOpenAIEmbeddings(): Embeddings {
    if (!OpenAIEmbeddings) {
      throw new Error(
        'OpenAI embeddings no disponible. Instala: pnpm add @langchain/openai',
      );
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada');
    }

    const modelName =
      this.configService.get<string>('OPENAI_EMBEDDING_MODEL') ||
      'text-embedding-ada-002';

    const dimension = modelName.includes('large') ? 3072 : 1536;
    this.embeddingConfig = { provider: 'openai', dimensions: dimension, modelName };

    return new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName,
    });
  }

  private createCohereEmbeddings(): Embeddings {
    if (!CohereEmbeddings) {
      throw new Error(
        'Cohere embeddings no disponible. Instala: pnpm add @langchain/cohere',
      );
    }

    const apiKey = this.configService.get<string>('COHERE_API_KEY');
    if (!apiKey) {
      throw new Error('COHERE_API_KEY no configurada');
    }

    const modelName =
      this.configService.get<string>('COHERE_MODEL') || 'embed-english-v3.0';

    this.embeddingConfig = { provider: 'cohere', dimensions: 1024, modelName };

    return new CohereEmbeddings({
      apiKey,
      model: modelName,
    });
  }

  private createHuggingFaceEmbeddings(): Embeddings {
    if (!HuggingFaceInferenceEmbeddings) {
      throw new Error(
        'HuggingFace embeddings no disponible. Instala: pnpm add @langchain/community',
      );
    }

    const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
    if (!apiKey) {
      throw new Error('HUGGINGFACE_API_KEY no configurada');
    }

    const modelName =
      this.configService.get<string>('HUGGINGFACE_MODEL') ||
      'sentence-transformers/all-MiniLM-L6-v2';

    // Dimensiones comunes:
    // all-MiniLM-L6-v2: 384
    // multilingual-e5-base: 768
    const dimension = modelName.includes('e5-base') ? 768 : 384;
    this.embeddingConfig = {
      provider: 'huggingface',
      dimensions: dimension,
      modelName,
    };

    return new HuggingFaceInferenceEmbeddings({
      apiKey,
      modelName,
    });
  }

  private createOllamaEmbeddings(): Embeddings {
    if (!OllamaEmbeddings) {
      throw new Error(
        'Ollama embeddings no disponible. Instala: pnpm add @langchain/community',
      );
    }

    const baseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
    const modelName =
      this.configService.get<string>('OLLAMA_MODEL') || 'nomic-embed-text';

    // nomic-embed-text: 768 dimensiones
    this.embeddingConfig = {
      provider: 'ollama',
      dimensions: 768,
      modelName,
    };

    return new OllamaEmbeddings({
      baseUrl,
      model: modelName,
    });
  }

  private createVoyageAIEmbeddings(): Embeddings {
    if (!VoyageEmbeddings) {
      throw new Error(
        'Voyage AI embeddings no disponible. Instala: pnpm add @langchain/community',
      );
    }

    // Según documentación: VoyageEmbeddings usa VOYAGEAI_API_KEY por defecto
    // pero también acepta apiKey explícito
    const apiKey =
      this.configService.get<string>('VOYAGE_API_KEY') ||
      this.configService.get<string>('VOYAGEAI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'VOYAGE_API_KEY o VOYAGEAI_API_KEY no configurada',
      );
    }

    const modelName =
      this.configService.get<string>('VOYAGE_MODEL') || 'voyage-2';

    // Voyage AI modelos:
    // voyage-2: 1024 dimensiones (recomendado para búsqueda)
    // voyage-code-2: 1024 dimensiones (optimizado para código)
    // voyage-large-2: 1536 dimensiones (más grande)
    const dimension = modelName.includes('large') ? 1536 : 1024;
    this.embeddingConfig = {
      provider: 'voyage',
      dimensions: dimension,
      modelName,
    };

    // Según documentación oficial:
    // - NO hay parámetro 'model' (VoyageEmbeddings lo maneja automáticamente)
    // - inputType puede ser 'query', 'document', o undefined (default)
    // - VoyageEmbeddings detecta automáticamente según embedQuery vs embedDocuments
    // - Por ahora no especificamos inputType para que funcione en ambos casos
    return new VoyageEmbeddings({
      apiKey,
      // inputType no especificado - VoyageEmbeddings lo maneja automáticamente
      // según el método llamado (embedQuery usa 'query', embedDocuments usa 'document')
    });
  }

  async onModuleInit() {
    try {
      const apiKey = this.configService.get<string>('PINECONE_API_KEY');
      if (!apiKey) {
        this.logger.warn(
          'PINECONE_API_KEY no configurada. Pinecone no estará disponible.',
        );
        return;
      }

      this.pineconeClient = new Pinecone({
        apiKey,
      });

      // Verificar que el índice existe, si no, crearlo
      await this.ensureIndexExists();

      // Inicializar el vector store
      this.vectorStore = await PineconeStore.fromExistingIndex(this.embeddings, {
        pineconeIndex: this.pineconeClient.index(this.indexName),
      });

      this.logger.log(
        `Pinecone inicializado correctamente. Índice: ${this.indexName}`,
      );
      this.logger.log(
        `Proveedor de embeddings: ${this.embeddingConfig.provider} (${this.embeddingConfig.dimensions} dimensiones)`,
      );
    } catch (error) {
      this.logger.error(`Error al inicializar Pinecone: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async ensureIndexExists() {
    if (!this.pineconeClient) return;

    const indexes = await this.pineconeClient.listIndexes();
    const indexExists = indexes.indexes?.some((idx) => idx.name === this.indexName);

    if (!indexExists) {
      this.logger.log(`Creando índice Pinecone: ${this.indexName}`);
      const dimension =
        this.embeddingConfig?.dimensions ||
        this.getDefaultDimensions(this.embeddingConfig?.provider || 'openai');

      await this.pineconeClient.createIndex({
        name: this.indexName,
        dimension,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });
      this.logger.log(
        `Índice ${this.indexName} creado exitosamente (${dimension} dimensiones)`,
      );
    }
  }

  private getDefaultDimensions(provider: EmbeddingProvider): number {
    switch (provider) {
      case 'cohere':
        return 1024;
      case 'huggingface':
        return 384;
      case 'ollama':
        return 768;
      case 'voyage':
        return 1024;
      case 'openai':
      default:
        return 1536;
    }
  }

  /**
   * Obtiene el vector store para realizar búsquedas
   */
  getVectorStore(): PineconeStore {
    if (!this.vectorStore) {
      throw new Error('Pinecone no está inicializado. Verifica PINECONE_API_KEY.');
    }
    return this.vectorStore;
  }

  /**
   * Agrega documentos al índice
   */
  async addDocuments(documents: Document[]): Promise<string[]> {
    if (!this.vectorStore) {
      throw new Error('Pinecone no está inicializado.');
    }

    const ids = await this.vectorStore.addDocuments(documents);
    this.logger.log(`Agregados ${documents.length} documentos a Pinecone`);
    return ids;
  }

  /**
   * Realiza una búsqueda semántica
   */
  async similaritySearch(
    query: string,
    k: number = 3,
    filter?: Record<string, any>,
  ): Promise<Document[]> {
    if (!this.vectorStore) {
      throw new Error('Pinecone no está inicializado.');
    }

    return this.vectorStore.similaritySearch(query, k, filter);
  }

  /**
   * Realiza una búsqueda con scores de similitud
   */
  async similaritySearchWithScore(
    query: string,
    k: number = 3,
    filter?: Record<string, any>,
  ): Promise<[Document, number][]> {
    if (!this.vectorStore) {
      throw new Error('Pinecone no está inicializado.');
    }

    return this.vectorStore.similaritySearchWithScore(query, k, filter);
  }

  /**
   * Elimina documentos por IDs
   */
  async deleteDocuments(ids: string[]): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('Pinecone no está inicializado.');
    }

    await this.vectorStore.delete({ ids });
    this.logger.log(`Eliminados ${ids.length} documentos de Pinecone`);
  }

  /**
   * Verifica si Pinecone está disponible
   */
  isAvailable(): boolean {
    return this.vectorStore !== null;
  }

  /**
   * Obtiene información del proveedor de embeddings
   */
  getEmbeddingInfo(): EmbeddingConfig {
    return this.embeddingConfig;
  }
}
