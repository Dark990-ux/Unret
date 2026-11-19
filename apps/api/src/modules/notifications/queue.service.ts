import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

type Handler = (data: any) => Promise<void>;

/**
 * Background job queue backed by Redis/BullMQ. Workers run in-process by default;
 * set RUN_WORKERS=false on API instances and run a dedicated worker process to split them.
 * Falls back to in-process async execution when Redis is not configured.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger(QueueService.name);
  private connection?: IORedis;
  private queues = new Map<string, Queue>();
  private workers: Worker[] = [];
  private handlers = new Map<string, Handler>();

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL');
    if (url && process.env.NODE_ENV !== 'test') {
      this.connection = new IORedis(url, { maxRetriesPerRequest: null });
      this.connection.on('error', (e) => this.log.warn(`Redis: ${e.message}`));
    }
  }

  register(name: string, handler: Handler) {
    this.handlers.set(name, handler);
    if (!this.connection) return;
    this.queues.set(name, new Queue(name, { connection: this.connection }));
    if (this.config.get('RUN_WORKERS') !== 'false') {
      const w = new Worker(name, async (job) => handler(job.data), { connection: this.connection, concurrency: 5 });
      w.on('failed', (job, err) => this.log.error(`Job ${name}#${job?.id} failed: ${err.message}`));
      this.workers.push(w);
    }
  }

  async add(name: string, data: unknown, opts: { delayMs?: number } = {}) {
    const q = this.queues.get(name);
    if (q) {
      await q.add(name, data, { delay: opts.delayMs, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 });
      return;
    }
    const h = this.handlers.get(name);
    if (!h) throw new Error(`No handler for queue ${name}`);
    setTimeout(() => h(data).catch((e) => this.log.error(`${name}: ${e.message}`)), opts.delayMs ?? 0);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection?.quit().catch(() => undefined);
  }
}
