import { GenericContainer, type StartedTestContainer } from 'testcontainers';

export async function startRedisContainer(): Promise<StartedTestContainer> {
  return new GenericContainer('redis:8-alpine').withExposedPorts(6379).start();
}
