import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailFromEnv } from '../src/server/email';

const config = {
  EMAIL_MODE: 'resend',
  EMAIL_FROM: 'CycleReg <beta@example.test>',
  RESEND_API_KEY: 'fake-test-key',
  EMAIL_TEST_RECIPIENTS: ' other@example.test, TESTER@example.test ',
};
const message = { to: 'tester@example.test', subject: 'Invitation', text: 'Sign in to CycleReg.' };

afterEach(() => vi.unstubAllGlobals());

describe('Resend invitation sender', () => {
  it('defaults to local and requires test configuration outside production', () => {
    expect(emailFromEnv({}).mode).toBe('local');
    expect(emailFromEnv({ EMAIL_MODE: 'local' }).mode).toBe('local');
    expect(() => emailFromEnv({ EMAIL_MODE: 'ses' })).toThrow(/local or resend/);
    expect(() => emailFromEnv({ EMAIL_MODE: 'resend' })).toThrow(/RESEND_API_KEY/);
    expect(() => emailFromEnv({ ...config, EMAIL_TEST_RECIPIENTS: ' , ' })).toThrow(/EMAIL_TEST_RECIPIENTS/);
    expect(() => emailFromEnv({ ...config, NODE_ENV: 'production' })).toThrow(/test-only/);
  });

  it('only calls Resend for allowlisted recipients and returns its message ID', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ id: 'provider-id' }));
    vi.stubGlobal('fetch', request);
    const sender = emailFromEnv(config);
    await expect(sender.send({ ...message, to: 'outside@example.test' })).rejects.toThrow(/test list/);
    expect(request).not.toHaveBeenCalled();
    await expect(sender.send(message)).resolves.toBe('provider-id');
    expect(request).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer fake-test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, from: config.EMAIL_FROM, to: [message.to] }),
    }));
  });

  it('rejects provider errors and successful responses without a message ID', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ message: 'private details' }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({})));
    const sender = emailFromEnv(config);
    await expect(sender.send(message)).rejects.toThrow(/^Resend returned HTTP 403\.$/);
    await expect(sender.send(message)).rejects.toThrow(/no message ID/);
  });
});
