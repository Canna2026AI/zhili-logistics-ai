import { GenericContainer, type StartedTestContainer } from 'testcontainers';

export async function startRedisContainer(): Promise<StartedTestContainer> {
  return new GenericContainer('redis:7.4-alpine').withExposedPorts(6379).start();
}
