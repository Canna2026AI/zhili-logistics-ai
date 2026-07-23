import { DomainApiError, toDomainApiError, type ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import type { AiMappingProposalRef, ImportJobRef, ImportPort } from '../../model/import';

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function assertUlid(value: string, code: string) {
  if (!ulidPattern.test(value)) throw new DomainApiError(code, { code });
}

function assertVersion(version: number, code: string) {
  if (!Number.isInteger(version) || version < 1) throw new DomainApiError(code, { code });
}

function assertImportJob(
  remote: components['schemas']['ImportJob'],
  expectedId?: string,
  previousVersion?: number
) {
  assertUlid(remote.id, 'IMPORT_ID_INVALID');
  assertVersion(remote.version, 'IMPORT_VERSION_INVALID');
  if (
    (expectedId && remote.id !== expectedId) ||
    (previousVersion !== undefined && remote.version <= previousVersion)
  ) {
    throw new DomainApiError('IMPORT_SNAPSHOT_MISMATCH', { code: 'IMPORT_SNAPSHOT_MISMATCH' });
  }
}

function assertJob(remote: components['schemas']['Job']) {
  assertUlid(remote.id, 'JOB_ID_INVALID');
}

function mapImportJob(remote: components['schemas']['ImportJob']): ImportJobRef {
  return {
    id: remote.id,
    version: remote.version,
    status: remote.status,
    created: remote.status === 'COMPLETED' ? remote.validRows : undefined,
    failed: remote.status === 'COMPLETED' ? remote.invalidRows : undefined,
  };
}

function parseEtagVersion(response: Response | undefined, previousVersion: number) {
  const etag = response?.headers.get('ETag');
  const match = etag?.match(/^"([1-9][0-9]*)"$/);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(version) || version <= previousVersion) {
    throw new DomainApiError('IMPORT_ETAG_VERSION_INVALID', {
      code: 'IMPORT_ETAG_VERSION_INVALID',
    });
  }
  return version;
}

function proposalIdFromResultRef(resultRef: string | null | undefined) {
  const proposalId = resultRef?.match(/[0-9A-HJKMNP-TV-Z]{26}$/)?.[0];
  if (!proposalId) {
    throw new DomainApiError('AI_PROPOSAL_RESULT_REF_INVALID', {
      code: 'AI_PROPOSAL_RESULT_REF_INVALID',
    });
  }
  return proposalId;
}

function assertProposal(
  proposal: components['schemas']['AiMappingProposal'],
  importId: string,
  proposalId: string
): asserts proposal is AiMappingProposalRef {
  assertUlid(proposal.id, 'AI_PROPOSAL_ID_INVALID');
  assertUlid(proposal.importId, 'IMPORT_ID_INVALID');
  assertVersion(proposal.version, 'AI_PROPOSAL_VERSION_INVALID');
  if (proposal.id !== proposalId || proposal.importId !== importId) {
    throw new DomainApiError('AI_PROPOSAL_IDENTITY_MISMATCH', {
      code: 'AI_PROPOSAL_IDENTITY_MISMATCH',
    });
  }
  for (const candidate of proposal.candidates) assertUlid(candidate.id, 'AI_CANDIDATE_ID_INVALID');
}

function intentId(operation: string, payload: unknown) {
  return `${operation}:${JSON.stringify(payload)}`;
}

export function createImportApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): ImportPort {
  const pendingIntentKeys = new Map<string, string>();
  const keyFor = (intent: string) => {
    const existing = pendingIntentKeys.get(intent);
    if (existing) return existing;
    const key = `import-${createIdempotencyKey()}`;
    pendingIntentKeys.set(intent, key);
    return key;
  };
  const createHeaders = (intent: string) => ({ 'Idempotency-Key': keyFor(intent) });
  const headers = (intent: string, version: number) => ({
    'Idempotency-Key': keyFor(intent),
    'If-Match': `"${version}"`,
  });
  return {
    async create(source) {
      const body: components['schemas']['CreateImportJobRequest'] = {
        domain: 'ORDERS',
        sourceFileRef: source,
        atomicity: 'ALLOW_PARTIAL',
      };
      const intent = intentId('create', body);
      let response;
      try {
        response = await client.POST('/imports', {
          params: { header: createHeaders(intent) },
          body,
        });
      } catch (error) {
        throw toDomainApiError(error);
      }
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      const remote = response.data?.data;
      if (!remote)
        throw new DomainApiError('IMPORT_RESPONSE_EMPTY', { code: 'IMPORT_RESPONSE_EMPTY' });
      assertImportJob(remote);
      pendingIntentKeys.delete(intent);
      return mapImportJob(remote);
    },
    async proposeMapping(importId, importVersion) {
      assertUlid(importId, 'IMPORT_ID_INVALID');
      assertVersion(importVersion, 'IMPORT_VERSION_INVALID');
      const body: components['schemas']['ProposeAiMappingRequest'] = {
        targetSchemaVersion: 'orders.v2026.07',
        sampleRowCount: 100,
      };
      const intent = intentId('propose-mapping', { importId, importVersion, body });
      let response;
      try {
        response = await client.POST('/ai/imports/{importId}/mapping-proposals', {
          params: { path: { importId }, header: createHeaders(intent) },
          body,
        });
      } catch (error) {
        throw toDomainApiError(error);
      }
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      let job = response.data?.data;
      if (!job)
        throw new DomainApiError('AI_PROPOSAL_JOB_EMPTY', { code: 'AI_PROPOSAL_JOB_EMPTY' });
      assertJob(job);
      if (job.status !== 'SUCCEEDED') {
        const polled = await client.GET('/jobs/{jobId}', { params: { path: { jobId: job.id } } });
        if (polled.error) throw toDomainApiError(polled.error, polled.response);
        if (!polled.data?.data)
          throw new DomainApiError('AI_PROPOSAL_JOB_EMPTY', { code: 'AI_PROPOSAL_JOB_EMPTY' });
        job = polled.data.data;
        assertJob(job);
      }
      if (job.status !== 'SUCCEEDED') {
        throw new DomainApiError('AI_PROPOSAL_PENDING', {
          status: 202,
          code: 'AI_PROPOSAL_PENDING',
          context: { job },
        });
      }
      const proposalId = proposalIdFromResultRef(job.resultRef);
      const proposalResponse = await client.GET(
        '/ai/imports/{importId}/mapping-proposals/{proposalId}',
        { params: { path: { importId, proposalId } } }
      );
      if (proposalResponse.error)
        throw toDomainApiError(proposalResponse.error, proposalResponse.response);
      const proposal = proposalResponse.data?.data;
      if (!proposal) throw new DomainApiError('AI_PROPOSAL_EMPTY', { code: 'AI_PROPOSAL_EMPTY' });
      assertProposal(proposal, importId, proposalId);
      pendingIntentKeys.delete(intent);
      if (proposal.candidates.some((candidate) => candidate.confidence < 0.8)) {
        throw new DomainApiError('AI 字段映射置信度不足，需要人工确认', {
          status: 422,
          code: 'AI_LOW_CONFIDENCE',
          remediation: '请选择字段映射候选项后再继续校验',
          context: { proposal },
        });
      }
      return proposal;
    },
    async validate(importId, version) {
      assertUlid(importId, 'IMPORT_ID_INVALID');
      const intent = intentId('validate', { importId, version });
      const response = await client.POST('/imports/{importId}:validate', {
        params: { path: { importId }, header: headers(intent, version) },
      });
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      const job = response.data?.data;
      if (!job)
        throw new DomainApiError('IMPORT_VALIDATE_JOB_EMPTY', {
          code: 'IMPORT_VALIDATE_JOB_EMPTY',
        });
      assertJob(job);
      const nextVersion = parseEtagVersion(response.response, version);
      pendingIntentKeys.delete(intent);
      return { id: importId, version: nextVersion, jobId: job.id, status: 'VALIDATING' };
    },
    async commit(importId, version, acknowledgePartial) {
      assertUlid(importId, 'IMPORT_ID_INVALID');
      const body: components['schemas']['CommitImportRequest'] = {
        mappingVersion: version,
        validationVersion: version,
        acknowledgePartial,
      };
      const intent = intentId('commit', { importId, version, body });
      const response = await client.POST('/imports/{importId}:commit', {
        params: { path: { importId }, header: headers(intent, version) },
        body,
      });
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      const job = response.data?.data;
      if (!job)
        throw new DomainApiError('IMPORT_COMMIT_JOB_EMPTY', { code: 'IMPORT_COMMIT_JOB_EMPTY' });
      assertJob(job);
      const nextVersion = parseEtagVersion(response.response, version);
      pendingIntentKeys.delete(intent);
      return {
        id: importId,
        version: nextVersion,
        jobId: job.id,
        status: job.status,
      };
    },
    async rollback(importId, version, reason) {
      assertUlid(importId, 'IMPORT_ID_INVALID');
      const body: components['schemas']['RollbackImportBatchRequest'] = { reason };
      const intent = intentId('rollback', { importId, version, body });
      const response = await client.POST('/imports/{importId}:rollback', {
        params: { path: { importId }, header: headers(intent, version) },
        body,
      });
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      const result = response.data?.data;
      if (!result)
        throw new DomainApiError('IMPORT_ROLLBACK_RESULT_EMPTY', {
          code: 'IMPORT_ROLLBACK_RESULT_EMPTY',
        });
      if (result.resourceId !== importId || result.version <= version) {
        throw new DomainApiError('IMPORT_ROLLBACK_IDENTITY_MISMATCH', {
          code: 'IMPORT_ROLLBACK_IDENTITY_MISMATCH',
        });
      }
      pendingIntentKeys.delete(intent);
      return {
        id: importId,
        version: result.version,
        status: result.status,
        evidence: { kind: 'resource' as const, resourceId: result.resourceId },
      };
    },
    async applyMapping(importId, importVersion, proposalId, proposalVersion, acceptedMappingIds) {
      assertUlid(importId, 'IMPORT_ID_INVALID');
      assertUlid(proposalId, 'AI_PROPOSAL_ID_INVALID');
      acceptedMappingIds.forEach((id) => assertUlid(id, 'AI_CANDIDATE_ID_INVALID'));
      const body: components['schemas']['ApplyAiMappingsRequest'] = {
        proposalId,
        proposalVersion,
        acceptedMappingIds,
      };
      const intent = intentId('apply-mapping', { importId, importVersion, body });
      const response = await client.POST('/ai/imports/{importId}/mapping-proposals:apply', {
        params: { path: { importId }, header: headers(intent, importVersion) },
        body,
      });
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      const remote = response.data?.data;
      if (!remote)
        throw new DomainApiError('IMPORT_MAPPING_RESULT_EMPTY', {
          code: 'IMPORT_MAPPING_RESULT_EMPTY',
        });
      assertImportJob(remote, importId, importVersion);
      pendingIntentKeys.delete(intent);
      const mapped = mapImportJob(remote);
      const requestId = response.data?.meta.requestId;
      return requestId ? { ...mapped, evidence: { kind: 'trace' as const, requestId } } : mapped;
    },
  };
}
