export interface ParsedImportRow {
  line: number;
  customer: string;
  weight: number;
  destination: string;
}

export interface ImportJobRef {
  id: string;
  version: number;
  created?: number;
  failed?: number;
  status?: string;
  jobId?: string;
  evidence?:
    | { kind: 'audit'; auditId: string }
    | { kind: 'trace'; requestId: string }
    | { kind: 'resource'; resourceId: string };
}

export interface AiMappingCandidateRef {
  id: string;
  sourceColumn: string;
  targetField: string;
  confidence: number;
  evidence: string[];
  sampleValues?: string[];
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  autoApplicable?: boolean;
}

export interface AiMappingProposalRef {
  id: string;
  importId: string;
  model: string;
  promptVersion: string;
  status: 'RUNNING' | 'READY' | 'FAILED' | 'PARTIALLY_APPLIED' | 'APPLIED';
  candidates: AiMappingCandidateRef[];
  version: number;
}

export interface ImportPort {
  create(source: string): Promise<ImportJobRef>;
  proposeMapping(importId: string, importVersion: number): Promise<AiMappingProposalRef>;
  validate(importId: string, version: number): Promise<ImportJobRef>;
  commit(importId: string, version: number, acknowledgePartial: boolean): Promise<ImportJobRef>;
  rollback(importId: string, version: number, reason: string): Promise<ImportJobRef>;
  applyMapping(
    importId: string,
    importVersion: number,
    proposalId: string,
    proposalVersion: number,
    acceptedMappingIds: string[]
  ): Promise<ImportJobRef>;
}

const memoryImportId = '01JY8Z8F6ME4F0Y9QH2X6D4R7E';
const memoryProposalId = '01JY8Z8F6ME4F0Y9QH2X6D4R7F';
const memoryCandidateId = '01JY8Z8F6ME4F0Y9QH2X6D4R7G';

export const memoryImportPort: ImportPort = {
  async create() {
    return { id: memoryImportId, version: 1, status: 'UPLOADED' };
  },
  async proposeMapping(importId) {
    return {
      id: memoryProposalId,
      importId,
      model: 'Zhili-Map 2.1',
      promptVersion: '2026.07',
      status: 'READY',
      candidates: [
        {
          id: memoryCandidateId,
          sourceColumn: '收件州',
          targetField: 'receiverState',
          confidence: 0.96,
          evidence: ['列名与目标字段匹配'],
          risk: 'LOW',
          autoApplicable: true,
        },
      ],
      version: 1,
    };
  },
  async validate(importId, version) {
    return { id: importId, version: version + 1 };
  },
  async commit(importId, version, acknowledgePartial) {
    return {
      id: importId,
      version: version + 1,
      created: 1,
      failed: acknowledgePartial ? 1 : 0,
      status: 'COMPLETED',
    };
  },
  async rollback(importId, version) {
    return { id: importId, version: version + 1, status: 'ROLLED_BACK' };
  },
  async applyMapping(importId, importVersion) {
    return {
      id: importId,
      version: importVersion + 1,
      status: 'MAPPING',
      evidence: { kind: 'audit', auditId: `AUD-AI-MAPPING-${importId}` },
    };
  },
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseImportRows(csv: string) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? '');
  const customerIndex = header.indexOf('客户');
  const weightIndex = header.indexOf('重量');
  const destinationIndex = header.indexOf('目的地');
  const errors: string[] = [];
  const rows: ParsedImportRow[] = [];
  lines.slice(1).forEach((line, index) => {
    if (!line.trim()) return;
    const cells = parseCsvLine(line);
    const customer = cells[customerIndex]?.trim() ?? '';
    const weight = Number(cells[weightIndex]);
    const destination = cells[destinationIndex]?.trim() ?? '';
    if (!customer || !Number.isFinite(weight) || weight <= 0 || !destination) {
      errors.push(`第 ${index + 2} 行：客户、重量或目的地无效`);
      return;
    }
    rows.push({ line: index + 2, customer, weight, destination });
  });
  return { valid: rows.length, invalid: errors.length, errors, rows };
}
