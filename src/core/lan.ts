/* Copyright Advanced Software and AI Solutions LLC */
import net from 'node:net';

export class LanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LanError';
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function parseCidr(cidr: string): { kind: 'ipv4' | 'ipv6'; value: string; prefix: number } {
  const [value, prefixRaw] = cidr.split('/');
  if (!value || prefixRaw === undefined) throw new LanError(`Invalid CIDR: ${cidr}`);
  const prefix = Number(prefixRaw);
  const kind = net.isIP(value);
  if (kind === 4) return { kind: 'ipv4', value, prefix };
  if (kind === 6) return { kind: 'ipv6', value, prefix };
  throw new LanError(`Invalid CIDR: ${cidr}`);
}

function ipv6ToBigInt(ip: string): bigint {
  const expanded = expandIpv6(ip);
  return expanded.split(':').reduce((acc, part) => (acc << 16n) + BigInt(parseInt(part, 16)), 0n);
}

function expandIpv6(ip: string): string {
  const parts = ip.split('::');
  if (parts.length === 1) {
    const groups = ip.split(':');
    return groups.map((g) => g.padStart(4, '0')).join(':');
  }
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const middle = Array.from({ length: missing }, () => '0000');
  return [...left, ...middle, ...right].map((g) => g.padStart(4, '0')).join(':');
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  const kind = net.isIP(ip);
  if (parsed.kind === 'ipv4' && kind === 4) {
    const mask = parsed.prefix === 0 ? 0 : (~0 << (32 - parsed.prefix)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(parsed.value) & mask);
  }
  if (parsed.kind === 'ipv6' && kind === 6) {
    const mask =
      parsed.prefix === 0 ? 0n : ((1n << 128n) - 1n) << BigInt(128 - parsed.prefix) & ((1n << 128n) - 1n);
    return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(parsed.value) & mask);
  }
  // IPv4-mapped IPv6
  if (kind === 6 && ip.toLowerCase().startsWith('::ffff:') && parsed.kind === 'ipv4') {
    const v4 = ip.slice(ip.lastIndexOf(':') + 1);
    if (net.isIP(v4) === 4) return ipInCidr(v4, cidr);
  }
  return false;
}

export function isClientAllowed(ip: string | undefined, allowedCidrs: string[]): boolean {
  if (!ip) return false;
  const cleaned = ip.replace(/^::ffff:/i, '');
  return allowedCidrs.some((cidr) => ipInCidr(cleaned, cidr) || ipInCidr(ip, cidr));
}

export function assertBindHost(host: string, allowAllInterfaces: boolean): void {
  const normalized = host.trim().toLowerCase();
  if (normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
    if (!allowAllInterfaces) {
      throw new LanError(
        'Refusing to bind all interfaces unless ALLOW_ALL_INTERFACES=true',
      );
    }
    return;
  }
  if (normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1') {
    return;
  }
  const kind = net.isIP(host);
  if (kind === 0) {
    throw new LanError('HOST must be an IP address');
  }
  // Refuse public hosts: only private/loopback/link-local allowed.
  const privateCidrs = [
    '127.0.0.0/8',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '::1/128',
    'fc00::/7',
    'fe80::/10',
  ];
  if (!privateCidrs.some((cidr) => ipInCidr(host, cidr))) {
    throw new LanError('Refusing to bind a public HOST');
  }
}
