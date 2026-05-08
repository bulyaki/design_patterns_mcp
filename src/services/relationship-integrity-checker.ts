/**
 * Pattern Relationship Integrity Checker
 * Verifies all pattern relationships reference valid pattern IDs
 */
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../services/database-manager.js';
import { logger } from '../services/logger.js';
import { isObject } from '../utils/type-guards.js';

interface FileRelationship {
  target_pattern_id?: string;
  targetPatternId?: string;
  type?: string;
}

interface FilePattern {
  id: string;
  relationships?: FileRelationship[];
}

function isFileRelationship(value: unknown): value is FileRelationship {
  return isObject(value);
}

function isFilePattern(value: unknown): value is FilePattern {
  return isObject(value) && typeof value.id === 'string';
}

function extractPatternsFromFile(parsed: unknown): FilePattern[] {
  if (!isObject(parsed)) {
    return [];
  }

  if (Array.isArray(parsed.patterns)) {
    return parsed.patterns.filter(isFilePattern);
  }

  return isFilePattern(parsed) ? [parsed] : [];
}

export interface IntegrityCheckResult {
  valid: boolean;
  totalPatterns: number;
  totalRelationships: number;
  brokenReferences: BrokenReference[];
  orphanedPatterns: string[];
  duplicateRelationships: DuplicateRelationship[];
  duration: number;
}

export interface BrokenReference {
  sourcePatternId: string;
  sourcePatternName: string;
  targetPatternId: string;
  relationshipType: string;
  description?: string;
  fileName: string;
}

export interface DuplicateRelationship {
  sourcePatternId: string;
  targetPatternId: string;
  type: string;
  count: number;
}

export class RelationshipIntegrityChecker {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  checkIntegrity(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const result: IntegrityCheckResult = {
      valid: true,
      totalPatterns: 0,
      totalRelationships: 0,
      brokenReferences: [],
      orphanedPatterns: [],
      duplicateRelationships: [],
      duration: 0,
    };

    try {
      const patterns = this.db.query<{ id: string; name: string }>('SELECT id, name FROM patterns');
      result.totalPatterns = patterns.length;

      const patternIds = new Set(patterns.map(p => p.id));
      const patternNames = new Map(patterns.map(p => [p.id, p.name]));

      const relationships = this.db.query<{
        id: string;
        source_pattern_id: string;
        target_pattern_id: string;
        type: string;
        description?: string;
      }>(
        `SELECT pr.id, pr.source_pattern_id, pr.target_pattern_id, pr.type, pr.description
         FROM pattern_relationships pr`
      );
      result.totalRelationships = relationships.length;

      for (const rel of relationships) {
        if (!patternIds.has(rel.target_pattern_id)) {
          result.valid = false;
          result.brokenReferences.push({
            sourcePatternId: rel.source_pattern_id,
            sourcePatternName: patternNames.get(rel.source_pattern_id) ?? 'Unknown',
            targetPatternId: rel.target_pattern_id,
            relationshipType: rel.type,
            description: rel.description,
            fileName: '',
          });
        }
      }

      const sourceCounts = new Map<string, number>();
      for (const rel of relationships) {
        const key = `${rel.source_pattern_id}|${rel.target_pattern_id}|${rel.type}`;
        sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
      }

      for (const [key, count] of sourceCounts) {
        if (count > 1) {
          const [source, target, type] = key.split('|');
          result.duplicateRelationships.push({
            sourcePatternId: source,
            targetPatternId: target,
            type,
            count,
          });
        }
      }

      const patternFileMap = this.buildPatternFileMap();

      for (const ref of result.brokenReferences) {
        const fileName = patternFileMap.get(ref.sourcePatternId) ?? 'Unknown';
        ref.fileName = fileName;
      }

      result.duration = Date.now() - startTime;

      if (!result.valid) {
        logger.warn(
          'integrity-checker',
          `Found ${result.brokenReferences.length} broken references`
        );
      }

      return Promise.resolve(result);
    } catch (error) {
      logger.error('integrity-checker', 'Integrity check failed', undefined, {
        details: String(error),
      });
      return Promise.reject(error);
    }
  }

  checkFileIntegrity(patternFiles: string[]): Promise<{
    brokenReferences: Array<{
      fileName: string;
      sourcePatternId: string;
      targetPatternId: string;
      relationshipType: string;
    }>;
  }> {
    const brokenReferences: Array<{
      fileName: string;
      sourcePatternId: string;
      targetPatternId: string;
      relationshipType: string;
    }> = [];

    for (const file of patternFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      const patterns = extractPatternsFromFile(parsed);
      const patternIdsInFile = new Set(patterns.map(pattern => pattern.id));

      for (const pattern of patterns) {
        const relationships = Array.isArray(pattern.relationships)
          ? pattern.relationships.filter(isFileRelationship)
          : [];

        for (const rel of relationships) {
          const targetId = rel.target_pattern_id ?? rel.targetPatternId;
          if (!targetId || patternIdsInFile.has(targetId)) {
            continue;
          }

          const existsInDb = this.db.queryOne<{ id: string }>(
            'SELECT id FROM patterns WHERE id = ?',
            [targetId]
          );

          if (!existsInDb) {
            brokenReferences.push({
              fileName: path.basename(file),
              sourcePatternId: pattern.id,
              targetPatternId: targetId,
              relationshipType: rel.type ?? 'unknown',
            });
          }
        }
      }
    }

    return Promise.resolve({ brokenReferences });
  }

  private buildPatternFileMap(): Map<string, string> {
    const map = new Map<string, string>();

    try {
      const files = fs.readdirSync('./data/patterns').filter(file => file.endsWith('.json'));

      for (const file of files) {
        try {
          const content = fs.readFileSync(`./data/patterns/${file}`, 'utf-8');
          const parsed: unknown = JSON.parse(content);
          const patterns = extractPatternsFromFile(parsed);

          for (const pattern of patterns) {
            map.set(pattern.id, file);
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch {
      // Directory doesn't exist or other error
    }

    return map;
  }

  async fixBrokenReferences(): Promise<{
    fixed: number;
    failed: number;
    errors: string[];
  }> {
    const checkResult = await this.checkIntegrity();
    let fixed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const ref of checkResult.brokenReferences) {
      try {
        this.db.execute(
          'DELETE FROM pattern_relationships WHERE source_pattern_id = ? AND target_pattern_id = ?',
          [ref.sourcePatternId, ref.targetPatternId]
        );
        logger.info(
          'integrity-checker',
          `Removed broken reference: ${ref.sourcePatternId} -> ${ref.targetPatternId}`
        );
        fixed++;
      } catch (error) {
        failed++;
        errors.push(
          `Failed to remove ${ref.sourcePatternId} -> ${ref.targetPatternId}: ${String(error)}`
        );
      }
    }

    return { fixed, failed, errors };
  }

  formatReport(result: IntegrityCheckResult): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('PATTERN RELATIONSHIP INTEGRITY REPORT');
    lines.push('═'.repeat(60));
    lines.push(`Duration: ${result.duration}ms`);
    lines.push(`Patterns: ${result.totalPatterns}`);
    lines.push(`Relationships: ${result.totalRelationships}`);
    lines.push('');

    if (result.valid) {
      lines.push('✓ All relationships are valid');
    } else {
      lines.push('✗ Issues found:');
      lines.push('');

      if (result.brokenReferences.length > 0) {
        lines.push('BROKEN REFERENCES:');
        lines.push('-'.repeat(40));
        for (const ref of result.brokenReferences) {
          lines.push(`  ${ref.sourcePatternId} -> ${ref.targetPatternId}`);
          lines.push(`    Type: ${ref.relationshipType}`);
          lines.push(`    File: ${ref.fileName}`);
          lines.push('');
        }
      }

      if (result.duplicateRelationships.length > 0) {
        lines.push('DUPLICATE RELATIONSHIPS:');
        lines.push('-'.repeat(40));
        for (const dup of result.duplicateRelationships) {
          lines.push(`  ${dup.sourcePatternId} -> ${dup.targetPatternId} (${dup.type})`);
          lines.push(`    Count: ${dup.count}`);
          lines.push('');
        }
      }
    }

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }
}
