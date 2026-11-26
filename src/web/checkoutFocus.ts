// The local test sign-in page replaces the app, so checkout remounts afterwards.
// Arm focus only when registration was on screen at the moment sign-in was requested,
// and only after success. Take the pending flag in an effect: a render-time read is
// cleared by the development server's extra StrictMode pass.

let registerActive = false;
let armCheckoutFocus = false;
let pendingCheckoutFocus = false;

export function setRegisterActive(active: boolean): void {
  registerActive = active;
}

export function armCheckoutOnTestSignIn(): void {
  armCheckoutFocus = registerActive;
}

export function commitCheckoutFocus(): void {
  pendingCheckoutFocus = armCheckoutFocus;
  armCheckoutFocus = false;
}

export function cancelCheckoutFocus(): void {
  armCheckoutFocus = false;
}

/** A second read returns false and must not clear a resume flag the first read already set. */
export function retainCheckoutFocus(resume: { current: boolean }): void {
  if (takePendingCheckoutFocus()) resume.current = true;
}

function takePendingCheckoutFocus(): boolean {
  const pending = pendingCheckoutFocus;
  pendingCheckoutFocus = false;
  return pending;
}
