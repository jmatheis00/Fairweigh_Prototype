import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileDemoDataRepository } from './demo-data.repository.js';

describe('JsonFileDemoDataRepository', () => {
  it('explains how to fix a missing data file', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'scc-no-data-'));
    expect(() => new JsonFileDemoDataRepository(emptyDir)).toThrow('npm run data:build');
  });
});
