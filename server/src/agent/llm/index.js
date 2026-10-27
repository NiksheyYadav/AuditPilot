import { cfg } from '../../config.js';
import { createMockProvider } from './mock.js';
import { createOpenAiCompatProvider } from './openaiCompat.js';

export const getProvider = () => (cfg.llmProvider === 'mock' ? createMockProvider() : createOpenAiCompatProvider());
