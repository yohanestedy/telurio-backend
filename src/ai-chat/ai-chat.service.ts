import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { AiToolsRegistry, type AiAuthUser } from './ai-tools.registry';
import type {
  ChatCompletionsDto,
  ChatMessageDto,
  ModelOption,
  ToolDescriptor,
} from './dto/chat.dto';
import { SCHEMA_CONTEXT } from './schema-context';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/id';

dayjs.extend(utc);
dayjs.extend(timezone);

const JAKARTA_TZ = 'Asia/Jakarta';

interface RawModelEntry {
  id: string;
  object?: string;
  owned_by?: string;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private readonly maxToolIterations: number;
  private readonly defaultModel: string;
  private readonly baseURL: string;
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly toolsRegistry: AiToolsRegistry,
  ) {
    this.baseURL = this.config.get<string>('NINEROUTER_URL') ?? '';
    this.apiKey = this.config.get<string>('NINEROUTER_KEY') ?? '';
    this.maxToolIterations = Number(
      this.config.get<string>('AI_CHAT_MAX_TOOL_ITERATIONS') ?? '8',
    );
    this.defaultModel =
      this.config.get<string>('AI_CHAT_DEFAULT_MODEL') ?? 'mid-free';
  }

  async listModels(): Promise<ModelOption[]> {
    if (!this.baseURL || !this.apiKey) {
      this.logger.error('NINEROUTER_URL or NINEROUTER_KEY is not configured');
      throw new Error('AI provider is not configured');
    }

    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.error(
          `Failed to fetch models from 9router (${response.status}): ${text}`,
        );
        throw new Error(`Provider returned ${response.status}`);
      }

      const json = (await response.json()) as { data?: RawModelEntry[] };
      const data = json.data ?? [];
      return data
        .filter((entry) => entry.owned_by === 'combo')
        .map((entry) => ({ id: entry.id }));
    } catch (error) {
      this.logger.error(
        `listModels error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  listTools(user: AiAuthUser): ToolDescriptor[] {
    return this.toolsRegistry.getAllowedTools(user).map((tool) => ({
      name: tool.name,
      description: tool.description,
      permission: tool.permission,
    }));
  }

  async streamCompletions(
    user: AiAuthUser,
    body: ChatCompletionsDto,
    res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const tools = this.toolsRegistry.getOpenAiToolDefinitions(user);
    const model = body.model || this.defaultModel;

    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: this.buildSystemPrompt(user, body.clientTimezone) },
      ...body.messages.map((msg) => this.normalizeMessage(msg)),
    ];

    let iteration = 0;
    let closed = false;

    res.on('close', () => {
      closed = true;
    });

    try {
      while (iteration < this.maxToolIterations && !closed) {
        iteration += 1;

        const requestBody: Record<string, unknown> = {
          model,
          messages,
          stream: true,
        };
        if (tools.length) {
          requestBody.tools = tools;
        }

        const upstream = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text();
          this.logger.error(
            `Upstream chat completions failed (${upstream.status}): ${text}`,
          );
          this.write(res, {
            type: 'error',
            message: `Provider error (${upstream.status})`,
          });
          break;
        }

        let assistantContent = '';
        const pendingToolCalls = new Map<
          number,
          { id: string; name: string; arguments: string }
        >();
        let finishReason: string | null = null;

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIndex = buffer.indexOf('\n\n');
          while (nlIndex !== -1) {
            const rawEvent = buffer.slice(0, nlIndex).trim();
            buffer = buffer.slice(nlIndex + 2);
            nlIndex = buffer.indexOf('\n\n');
            if (!rawEvent.startsWith('data:')) continue;
            const data = rawEvent.slice(5).trim();
            if (data === '[DONE]') continue;

            let chunk: ChatCompletionChunk;
            try {
              chunk = JSON.parse(data) as ChatCompletionChunk;
            } catch {
              continue;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            if (choice.delta?.content) {
              assistantContent += choice.delta.content;
              this.write(res, {
                type: 'content',
                delta: choice.delta.content,
              });
            }

            if (choice.delta?.tool_calls?.length) {
              for (const call of choice.delta.tool_calls) {
                const entry = pendingToolCalls.get(call.index) ?? {
                  id: '',
                  name: '',
                  arguments: '',
                };
                if (call.id) entry.id = call.id;
                if (call.function?.name) entry.name += call.function.name;
                if (call.function?.arguments)
                  entry.arguments += call.function.arguments;
                pendingToolCalls.set(call.index, entry);
              }
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }
        }

        if (closed) break;

        if (pendingToolCalls.size === 0) {
          this.write(res, { type: 'done' });
          break;
        }

        const toolCallsArray = Array.from(pendingToolCalls.entries())
          .sort(([a], [b]) => a - b)
          .map(([, value]) => ({
            id: value.id,
            type: 'function' as const,
            function: {
              name: value.name,
              arguments: value.arguments || '{}',
            },
          }));

        const assistantMessage: Record<string, unknown> = {
          role: 'assistant',
          tool_calls: toolCallsArray,
        };
        if (assistantContent) {
          assistantMessage.content = assistantContent;
        } else {
          assistantMessage.content = '';
        }
        messages.push(assistantMessage);

        for (const call of toolCallsArray) {
          this.write(res, {
            type: 'tool_call',
            name: call.function.name,
          });

          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = call.function.arguments
              ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
              : {};
          } catch {
            parsedArgs = {};
          }

          const result = await this.toolsRegistry.runTool(
            call.function.name,
            parsedArgs,
            user,
          );

          const toolContent = this.safeStringify(result ?? { ok: true });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: toolContent,
          });
        }

        if (finishReason && finishReason !== 'tool_calls') {
          this.write(res, { type: 'done' });
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI chat error: ${message}`, error);
      if (!closed) {
        this.write(res, { type: 'error', message });
      }
    } finally {
      if (!closed) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  }

  private write(res: Response, payload: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, (_key, val) =>
        typeof val === 'bigint' ? val.toString() : val,
      );
    } catch {
      return JSON.stringify({ error: 'Failed to serialize tool result' });
    }
  }

  private normalizeMessage(msg: ChatMessageDto): Record<string, unknown> {
    const base: Record<string, unknown> = {
      role: msg.role,
      content: msg.content ?? '',
    };
    if (msg.tool_call_id) base.tool_call_id = msg.tool_call_id;
    if (msg.tool_calls) base.tool_calls = msg.tool_calls;
    return base;
  }

  private isValidTimezone(tz: string | undefined): tz is string {
    if (!tz) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  private buildSystemPrompt(user: AiAuthUser, clientTimezone?: string): string {
    const nowJakarta = dayjs().tz(JAKARTA_TZ).locale('id');
    const jakartaToday = nowJakarta.format('dddd, DD MMMM YYYY');
    const jakartaTime = nowJakarta.format('HH:mm');

    const userTz = this.isValidTimezone(clientTimezone)
      ? clientTimezone
      : JAKARTA_TZ;
    const sameAsJakarta = userTz === JAKARTA_TZ;
    const nowUser = dayjs().tz(userTz).locale('id');
    const userToday = nowUser.format('dddd, DD MMMM YYYY');
    const userTime = nowUser.format('HH:mm');

    const roleLabel: Record<Role, string> = {
      ADMIN: 'Admin (akses penuh)',
      OWNER: 'Owner (pemilik kandang, akses laporan finansial)',
      OPERATOR: 'Operator (akses operasional kandang)',
    };

    const timeLines: string[] = [];
    timeLines.push(
      `Waktu operasional bisnis (Asia/Jakarta / WIB): ${jakartaToday}, jam ${jakartaTime}.`,
    );
    if (sameAsJakarta) {
      timeLines.push('User berada di zona waktu yang sama (Asia/Jakarta).');
    } else {
      timeLines.push(
        `Waktu lokal user (${userTz}): ${userToday}, jam ${userTime}.`,
      );
      timeLines.push(
        'Aturan zona waktu:',
        '- Untuk pertanyaan jam atau tanggal pribadi user (contoh: "sekarang jam berapa", "hari ini tanggal berapa"), pakai waktu lokal user.',
        '- Untuk filter data bisnis (contoh: "pesanan kemarin", "produksi minggu ini", "expense bulan ini"), SELALU pakai Asia/Jakarta karena semua data operasional (deliveryDate, production date, dst) tersimpan dalam tanggal Asia/Jakarta.',
        '- Jika tanggal user dan tanggal Jakarta berbeda, sebutkan secara eksplisit di jawaban (contoh: "Pesanan kemarin (28 Mei 2026 Asia/Jakarta, di lokasi Anda masih 27 Mei)").',
      );
    }

    return [
      'Anda adalah asisten AI untuk Telurio, sistem manajemen peternakan telur keluarga Pak Heri.',
      'Tugas Anda hanya membaca data dan memberikan jawaban yang ringkas, akurat, dalam Bahasa Indonesia.',
      ...timeLines,
      `User saat ini: role ${user.role} (${roleLabel[user.role] ?? user.role}).`,
      'Gunakan tools yang tersedia untuk mengambil data nyata dari database. Jangan menebak angka atau membuat data palsu.',
      '',
      SCHEMA_CONTEXT,
      '',
      'Format jawaban dengan Markdown (GFM). Gunakan **bold** untuk istilah penting, list `- item` untuk enumerasi, dan tabel pipe `| Kolom | Kolom |` ketika menampilkan data tabular seperti daftar pesanan, ringkasan per kandang, atau perbandingan angka. Pastikan tabel selalu memakai header row dan separator `|---|---|`.',
      'Saat menjawab, format angka dengan pemisah ribuan titik (contoh 1.250 kg, Rp 12.500.000).',
      'Setelah menjawab, Anda BOLEH menambahkan blok rekomendasi pertanyaan lanjutan dengan format:',
      '<choices>',
      '- Pertanyaan lanjutan 1',
      '- Pertanyaan lanjutan 2',
      '</choices>',
      'Aturan blok choices (suggestion):',
      '- Isinya BUKAN pilihan format atau konfirmasi, melainkan saran pertanyaan/aksi lanjutan yang relevan dengan jawaban Anda barusan, seolah-olah user akan bertanya hal itu berikutnya.',
      '- Setiap pilihan harus berbentuk pertanyaan atau permintaan yang siap diklik dan dikirim sebagai pesan user (contoh: "Bandingkan dengan minggu lalu", "Tampilkan detail per pelanggan", "Stok kandang mana yang paling rendah").',
      '- Hanya tambahkan blok ini ketika ada arah lanjutan yang masuk akal. Jika jawaban sudah final dan tidak ada yang relevan untuk dieksplorasi, jangan tambahkan blok choices.',
      '- Maksimal 3 pilihan, masing-masing ≤ 10 kata.',
      '- Jangan ulang pertanyaan yang baru saja dijawab.',
      '- Jangan tambahkan opsi "Lainnya" atau "Custom" karena user sudah bisa mengetik bebas di input chat.',
      '- Letakkan blok ini paling akhir setelah penjelasan utama.',
      'Jika user bertanya tentang fitur atau aksi yang membutuhkan akses tulis (membuat/mengubah/menghapus), beri tahu bahwa Anda hanya bisa membantu pertanyaan baca data.',
      'Jika user tidak punya akses ke data tertentu, sampaikan dengan sopan tanpa membocorkan struktur permission internal.',
    ].join('\n');
  }
}
