export function reelWorkerHeaders(headers = {}, env = process.env) {
  const token = env.REEL_INTERNAL_TOKEN;
  if (!token) {
    throw new Error('REEL_INTERNAL_TOKEN is required for internal Reel Pipeline Worker routes');
  }
  return { ...headers, authorization: `Bearer ${token}` };
}
