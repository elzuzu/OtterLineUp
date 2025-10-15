import { createHash } from 'node:crypto';
const MARKET_UID_PREFIX = 'muid';
const MARKET_UID_VERSION = 'v1';

export interface MarketIdentifier {
  operator: string;
  sport: string;
  league: string;
  event: string;
  marketType: string;
  outcome: string;
  eventTimestamp: Date;
  variant?: string | null;
  ladder?: string | null;
}

export type MarketUid = string;
export class MarketUidError extends Error {
  readonly field: keyof MarketIdentifier;

  constructor(field: keyof MarketIdentifier) {
    super(`missing required field \`${String(field)}\` for market UID generation`);
    this.name = 'MarketUidError';
    this.field = field;
  }
}

export function canonicalFingerprint(identifier: MarketIdentifier): string {
  const operator = normalizeRequired(identifier.operator, 'operator');
  const sport = normalizeRequired(identifier.sport, 'sport');
  const league = normalizeRequired(identifier.league, 'league');
  const event = normalizeRequired(identifier.event, 'event');
  const marketType = normalizeRequired(identifier.marketType, 'marketType');
  const outcome = normalizeRequired(identifier.outcome, 'outcome');
  const variant = normalizeOptional(identifier.variant);
  const ladder = normalizeOptional(identifier.ladder);
  const eventTime = truncateTimestamp(identifier.eventTimestamp);

  return [
    MARKET_UID_PREFIX,
    MARKET_UID_VERSION,
    operator,
    sport,
    league,
    event,
    marketType,
    variant,
    ladder,
    eventTime,
    outcome,
  ].join('|');
}

export function marketUidFromIdentifier(identifier: MarketIdentifier): MarketUid {
  const fingerprint = canonicalFingerprint(identifier);
  const digest = createHash('sha256').update(fingerprint).digest('hex');
  return `${MARKET_UID_PREFIX}-${MARKET_UID_VERSION}-${digest.slice(0, 24)}`;
}

function normalizeRequired(
  value: string,
  field: keyof MarketIdentifier,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MarketUidError(field);
  }

  const normalized = canonicalize(trimmed);
  if (!normalized) {
    throw new MarketUidError(field);
  }

  return normalized;
}

function normalizeOptional(value: string | null | undefined): string {
  if (value === undefined || value === null) {
    return 'na';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 'na';
  }
  const normalized = canonicalize(trimmed);
  return normalized || 'na';
}

function truncateTimestamp(timestamp: Date): string {
  const millis = timestamp.getTime();
  const truncated = new Date(Math.trunc(millis / 60_000) * 60_000);
  const year = truncated.getUTCFullYear().toString().padStart(4, '0');
  const month = (truncated.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = truncated.getUTCDate().toString().padStart(2, '0');
  const hours = truncated.getUTCHours().toString().padStart(2, '0');
  const minutes = truncated.getUTCMinutes().toString().padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}Z`;
}

function canonicalize(value: string): string {
  let buffer = '';
  for (const char of value.normalize('NFKD')) {
    buffer += isAsciiAlphaNumeric(char) ? char.toLowerCase() : ' ';
  }
  return buffer.split(/\s+/).filter(Boolean).join('_');
}

function isAsciiAlphaNumeric(char: string): boolean {
  if (char.length !== 1) {
    return false;
  }

  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}
