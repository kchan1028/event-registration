import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailRefusal, EmailUncertain, emailFromEnv } from '../src/server/email';

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
    await expect(sender.send({ ...message, to: 'outside@example.test' }, 'eml_saved_attempt')).rejects.toThrow(/test list/);
    expect(request).not.toHaveBeenCalled();
    await expect(sender.send(message, 'eml_saved_attempt')).resolves.toBe('provider-id');
    expect(request).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer fake-test-key', 'Content-Type': 'application/json', 'Idempotency-Key': 'eml_saved_attempt' },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
    }));
  });

  it('distinguishes a confirmed refusal from a lost or ambiguous response', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: 'private details' }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ name: 'concurrent_idempotent_requests' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ message: 'hidden' }, { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))
      .mockRejectedValueOnce(new TypeError('network down at https://api.resend.com/emails'));
    vi.stubGlobal('fetch', request);
    const sender = emailFromEnv(config);
    const outcome = async () => {
      try {
        await sender.send(message, 'eml_saved_attempt');
      } catch (err) {
        return err;
      }
      throw new Error('expected the sender to reject');
    };
    const refusal = await outcome();
    expect(refusal).toBeInstanceOf(EmailRefusal);
    expect((refusal as Error).message).toBe('Resend returned HTTP 403.');
    const messages = [
      'Send outcome unknown. The provider response had no message ID.',
      'Send outcome unknown after HTTP 409.',
      'Send outcome unknown after HTTP 503.',
      'Send outcome unknown after a timeout.',
      'Send outcome unknown after a network failure.',
    ];
    for (const messageText of messages) {
      const err = await outcome();
      expect(err).toBeInstanceOf(EmailUncertain);
      expect((err as Error).message).toBe(messageText);
      expect((err as Error).message).not.toMatch(/private|hidden|api\.resend/);
    }
  });
});
