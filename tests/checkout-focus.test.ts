import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  armCheckoutOnTestSignIn,
  cancelCheckoutFocus,
  commitCheckoutFocus,
  retainCheckoutFocus,
  setRegisterActive,
} from '../src/web/checkoutFocus';

function drain(): void {
  setRegisterActive(false);
  cancelCheckoutFocus();
  retainCheckoutFocus({ current: false });
}

beforeEach(drain);

describe('restored checkout focus', () => {
  it('keeps the resume flag when the mount effect runs twice', () => {
    setRegisterActive(true);
    armCheckoutOnTestSignIn();
    setRegisterActive(false);
    commitCheckoutFocus();
    const resume = { current: false };
    retainCheckoutFocus(resume);
    retainCheckoutFocus(resume);
    expect(resume.current).toBe(true);
  });

  it('does not arm when registration was not on screen', () => {
    armCheckoutOnTestSignIn();
    commitCheckoutFocus();
    const resume = { current: false };
    retainCheckoutFocus(resume);
    expect(resume.current).toBe(false);
  });

  it('does not arm when sign-in is cancelled', () => {
    setRegisterActive(true);
    armCheckoutOnTestSignIn();
    cancelCheckoutFocus();
    commitCheckoutFocus();
    const resume = { current: false };
    retainCheckoutFocus(resume);
    expect(resume.current).toBe(false);
  });

  it('leaves a fresh resume flag unset when nothing is pending', () => {
    const resume = { current: false };
    retainCheckoutFocus(resume);
    retainCheckoutFocus(resume);
    expect(resume.current).toBe(false);
  });
});

describe('registration takes the flag in its mount effect', () => {
  const register = readFileSync(new URL('../src/web/Register.tsx', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/web/auth.tsx', import.meta.url), 'utf8');

  it('calls retainCheckoutFocus once, from the mount effect', () => {
    const start = register.indexOf('export function Register(');
    const next = register.indexOf('\nexport function ', start + 1);
    const body = register.slice(start, next);
    expect(body).not.toContain('takePendingCheckoutFocus');
    expect(body.match(/retainCheckoutFocus\s*\(/g)?.length ?? 0).toBe(1);
    const effectStart = body.indexOf('useEffect(() => {\n    setRegisterActive(true);');
    const effect = body.slice(effectStart, body.indexOf('}, []);', effectStart));
    expect(effect).toContain('retainCheckoutFocus(resumeCheckoutFocus)');
  });

  it('arms, commits, and cancels through checkoutFocus', () => {
    expect(auth).toContain('armCheckoutOnTestSignIn()');
    expect(auth).toContain('commitCheckoutFocus()');
    expect(auth).toContain('cancelCheckoutFocus()');
    expect(auth).not.toContain('pendingCheckoutFocus');
    expect(auth).not.toContain('armCheckoutFocus');
  });
});
