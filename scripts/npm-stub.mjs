// Dùng khi kiểm thử bằng node: thay specifier "npm:..." (chỉ Deno / Edge Runtime hiểu) bằng một mô-đun giả.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('npm:')) return { url: 'data:text/javascript,export const createClient = () => ({});', shortCircuit: true };
  return nextResolve(specifier, context);
}
`)
);
