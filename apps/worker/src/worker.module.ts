import {
  Inject,
  Injectable,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { loadEnv } from '@zhili/config';
import { createLogger } from '@zhili/observability';
import { OutboxPublisher } from './outbox.processor';

export const OUTBOX_PUBLISHER = Symbol('OUTBOX_PUBLISHER');

@Injectable()
class WorkerLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(OUTBOX_PUBLISHER) private readonly publisher: Pick<OutboxPublisher, 'start' | 'close'>
  ) {}

  onApplicationBootstrap(): void {
    this.publisher.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.publisher.close();
  }
}

@Module({
  providers: [
    {
      provide: OUTBOX_PUBLISHER,
      useFactory: (): OutboxPublisher => {
        const env = loadEnv();
        return new OutboxPublisher({
          databaseUrl: env.DATABASE_URL,
          redisUrl: env.REDIS_URL,
          logger: createLogger({ name: 'zhili-outbox-worker', level: env.LOG_LEVEL }),
        });
      },
    },
    WorkerLifecycle,
  ],
  exports: [OUTBOX_PUBLISHER],
})
export class WorkerModule {}
