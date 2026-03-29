
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [
        react(),
        viteStaticCopy({
            targets: [
                {
                    src: 'node_modules/pyodide/*',
                    dest: 'pyodide'
                }
            ]
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // __dirname is not available in ES modules.
          // We'll resolve from the current working directory.
          '@': path.resolve('.'),
        }
      },
      build: {
        rollupOptions: {
          // Externalize React and ReactDOM to ensure the app uses the same
          // instance as react-pdf (which is loaded via CDN/importmap).
          // This prevents the "Cannot read properties of null (reading 'useReducer')" error.
          external: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react-pdf',
            'pdfjs-dist',
            '@formkit/auto-animate/react',
            'react-virtuoso',
            'xlsx'
          ],
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                // Mermaid — huge library, lazy loaded by MermaidBlock
                if (id.includes('mermaid')) return 'vendor-mermaid';
                // Markdown rendering pipeline
                if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('unified') || id.includes('bail') || id.includes('is-plain') || id.includes('trough') || id.includes('vfile') || id.includes('unist')) return 'vendor-markdown';
                // Highlight.js syntax themes
                if (id.includes('highlight.js')) return 'vendor-highlight';
                // KaTeX math rendering
                if (id.includes('katex')) return 'vendor-katex';
                // Utility libraries
                if (id.includes('jszip') || id.includes('dompurify') || id.includes('turndown')) return 'vendor-utils';
                // html2canvas (already dynamically imported in exportUtils)
                if (id.includes('html2canvas')) return 'vendor-html2canvas';
                // Google GenAI SDK
                if (id.includes('@google/genai')) return 'vendor-google-genai';
              }
            }
          }
        }
      }
    };
});