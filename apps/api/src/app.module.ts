import { Module, type DynamicModule, type OnApplicationShutdown, type Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule, Reflector } from '@nestjs/core';
import { AuthenticatedPrincipalGuard, PermissionGuard } from '@zhili/auth';
import { loadEnv, type AppEnv } from '@zhili/config';
import { closeDatabaseClient, withTenantTransaction } from '@zhili/db';
import {
  API_HEALTH_PROBES,
  API_READINESS_TIMEOUT_MS,
  HealthController,
  createDefaultHealthProbes,
} from './health.controller';
import { IdempotencyInterceptor } from './platform/idempotency';
import { ProblemFilter } from './platform/problem-filter';
import { RequestContextInterceptor } from './platform/request-context';

export const API_ENV = Symbol('API_ENV');

class ApiLifecycle implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await closeDatabaseClient();
  }
}

@Module({
  imports: [DiscoveryModule],
  controllers: [HealthController],
  providers: [
    { provide: API_ENV, useFactory: (): AppEnv => loadEnv() },
    { provide: API_READINESS_TIMEOUT_MS, useValue: 1_000 },
    {
      provide: API_HEALTH_PROBES,
      inject: [API_ENV],
      useFactory: (env: AppEnv) => createDefaultHealthProbes(env),
    },
    ApiLifecycle,
    {
      provide: APP_GUARD,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new AuthenticatedPrincipalGuard(reflector),
    },
    {
      provide: APP_GUARD,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new PermissionGuard(reflector),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new RequestContextInterceptor(reflector),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [Reflector],
      useFactory: (reflector: Reflector) =>
        new IdempotencyInterceptor(withTenantTransaction, reflector),
    },
    { provide: APP_FILTER, useFactory: () => new ProblemFilter() },
  ],
})
export class AppModule {}

export function registerFeatureModule(featureModule: Type<unknown>): DynamicModule {
  return { module: AppModule, imports: [featureModule] };
}
