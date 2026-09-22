import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function client() {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError(503, 'A IA ainda não foi configurada. Adicione GEMINI_API_KEY ao arquivo .env e reinicie o servidor.');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function messageFor(error) {
  if (error instanceof AppError) return error;
  const status = Number(error?.status || error?.statusCode);
  const appError = status === 401 || status === 403
    ? new AppError(503, 'A IA não aceitou a configuração atual. Confira a chave e o modelo no .env.')
    : status === 429
      ? new AppError(503, 'A IA está com muitas solicitações agora. Espere um pouco e tente de novo.')
      : status >= 500
        ? new AppError(503, 'A IA está indisponível agora. Seu texto continua salvo neste navegador.')
        : new AppError(503, 'Não consegui falar com a IA agora. Seu texto continua salvo neste navegador.');
  appError.originalMessage = error?.message;
  appError.sourceStatus = status;
  return appError;
}

export async function generate({ contents, config, model = MODEL }) {
  try {
    const response = await client().models.generateContent({ model, contents, config });
    if (!response.text?.trim()) throw new AppError(502, 'A IA não retornou um texto que eu consiga mostrar. Tente novamente.');
    return response.text.trim();
  } catch (error) {
    throw messageFor(error);
  }
}
