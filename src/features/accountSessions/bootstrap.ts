import { accountSessions, consumeAccountReturn } from './api';
import { googleDriveAuth } from '../googleDrive/auth';
import { hfAuth } from '../huggingface/auth';
import { bucketConnection } from '../bucketStorage/connection';

/** Local files render immediately; startup remote loads wait for remembered connections before their first request. */
export async function restoreAccountSessions(options: { skipGoogle?: boolean } = {}): Promise<void> {
  consumeAccountReturn();
  const state = await accountSessions.load();
  await Promise.allSettled([
    !options.skipGoogle && state.accounts.some(account => account.provider === 'google') ? googleDriveAuth.restore() : Promise.resolve(),
    state.accounts.some(account => account.provider === 'hf') ? hfAuth.restore() : Promise.resolve(),
  ]);
  if (state.bucket && !bucketConnection.getSession()) bucketConnection.connect(state.bucket.config, undefined, state.bucket.writable);
}
