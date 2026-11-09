import { AsyncLocalStorage } from "node:async_hooks";

// Request-local routing, never a global mode switch. Demo actions cannot see real books.
const context = new AsyncLocalStorage<boolean>();
export const inJudgeDemo = () => context.getStore() === true;
export function withJudgeDemo<T>(callback: () => T): T { return context.run(true, callback); }
