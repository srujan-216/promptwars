import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `globals: false` means Testing Library cannot self-register its auto-cleanup,
// so without this the DOM accumulates across tests and role queries match twice.
afterEach(() => {
  cleanup();
});
