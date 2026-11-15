import { describe, expect, it } from 'vitest';
import { listenHost } from '../src/server/listen';

describe('listen address', () => {
  it('defaults to this computer only', () => {
    expect(listenHost({})).toBe('127.0.0.1');
    expect(listenHost({ HOST: '  ' })).toBe('127.0.0.1');
  });

  it('uses HOST when set, now that sign-in exists (ADR 0003)', () => {
    for (const HOST of ['127.0.0.1', '0.0.0.0', '::']) expect(listenHost({ HOST })).toBe(HOST);
  });
});
