import { sendEmailVerification, sendPasswordResetEmail, type User } from 'firebase/auth';
import { auth } from './firebase';

const RESET_ACTION_CODE_SETTINGS = {
  url: 'https://resumora.net/reset-password',
  handleCodeInApp: true,
};

const VERIFICATION_ACTION_CODE_SETTINGS = {
  url: 'https://resumora.net/account',
  handleCodeInApp: true,
};

export function requestPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email.trim(), RESET_ACTION_CODE_SETTINGS);
}

export function requestEmailVerification(user: User): Promise<void> {
  return sendEmailVerification(user, VERIFICATION_ACTION_CODE_SETTINGS);
}
