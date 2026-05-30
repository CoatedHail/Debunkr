import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  DatasetVerdict,
  PublisherLookup,
  ReliabilityTier
} from '../types/api.js';

// Resolve data directory robustly for both tsx (ESM) and ts-jest (CJS).
// jest runs with cwd = backend/; tsx dev server runs from backend/ too.
const DATA_DIR = path.resolve(process.cwd(), 'src', 'data');

const TIER_TO_VERDICT: Record<Exclude<ReliabilityTier, 'unknown'>, string> = {
  high: 'Generally reliable',
  medium: 'No consensus',
  mixed: 'Mixed reliability — depends on topic',
  low: 'Generally unreliable'
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

interface ReliabilityRow {
  tier: Exclude<ReliabilityTier, 'unknown'>;
  wikipediaSection: string;
}

function loadCurated(): Map<string, ReliabilityRow> {
  const text = readFileSync(path.join(DATA_DIR, 'curated-reliability.csv'), 'utf-8');
  const rows = parseCsv(text);
  const map = new Map<string, ReliabilityRow>();
  const VALID_TIERS: ReadonlyArray<Exclude<ReliabilityTier, 'unknown'>> = ['high', 'medium', 'mixed', 'low'];
  for (const row of rows) {
    const domain = row.domain?.toLowerCase();
    const tier = row.tier as ReliabilityTier;
    if (!domain || !tier) continue;
    if (!VALID_TIERS.includes(tier as Exclude<ReliabilityTier, 'unknown'>)) continue;
    map.set(domain, { tier: tier as Exclude<ReliabilityTier, 'unknown'>, wikipediaSection: row.wikipedia_section ?? '' });
  }
  return map;
}

function loadIfcn(): Map<string, string> {
  const text = readFileSync(path.join(DATA_DIR, 'ifcn-signatories.csv'), 'utf-8');
  const rows = parseCsv(text);
  const map = new Map<string, string>();
  for (const row of rows) {
    const domain = row.domain?.toLowerCase();
    if (!domain) continue;
    map.set(domain, row.organization ?? domain);
  }
  return map;
}

export type DatasetLookup = (domain: string) => PublisherLookup;

export function createDatasetLookup(): DatasetLookup {
  const curated = loadCurated();
  const ifcn = loadIfcn();

  return (rawDomain: string): PublisherLookup => {
    const domain = rawDomain.toLowerCase();
    const verdicts: DatasetVerdict[] = [];

    const curatedRow = curated.get(domain);
    if (curatedRow) {
      verdicts.push({
        source: 'curated-wikipedia',
        verdict: TIER_TO_VERDICT[curatedRow.tier],
        details: curatedRow.wikipediaSection
          ? `Wikipedia editors' consensus`
          : undefined,
        link: curatedRow.wikipediaSection
          ? `https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources#${curatedRow.wikipediaSection}`
          : undefined
      });
    }

    const ifcnOrg = ifcn.get(domain);
    if (ifcnOrg) {
      verdicts.push({
        source: 'ifcn',
        verdict: `${ifcnOrg} is an IFCN-signatory fact-checker`,
        link: 'https://ifcncodeofprinciples.poynter.org/signatories'
      });
    }

    const reliabilityTier: ReliabilityTier = curatedRow ? curatedRow.tier : 'unknown';

    return {
      canonicalDomain: domain,
      reliabilityTier,
      verdicts
    };
  };
}
