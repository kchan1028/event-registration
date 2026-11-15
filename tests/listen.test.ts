import { describe, expect, it } from 'vitest';
import { listenHost } from '../src/server/listen';

describe('listen address', () => {
  it('defaults to this computer only', () => {
    expect(listenHost({})).toBe('127.0.0.1');
    expect(listenHost({ HOST: '  ' })).toBe('127.0.0.1');
  });

  it('accepts loopback addresses', () => {
    for (const HOST of ['127.0.0.1', 'localhost', '::1']) expect(listenHost({ HOST })).toBe(HOST);
  });

  it('refuses a network address until sign-in exists (ADR 0003)', () => {
    for (const HOST of ['0.0.0.0', '::', '192.168.1.20']) expect(() => listenHost({ HOST })).toThrow(/sign-in with MFA/);
  });
});
