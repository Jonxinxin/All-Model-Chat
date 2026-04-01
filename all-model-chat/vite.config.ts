
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
          '@': __dirname,
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
                if (id.includes('mermaid') || id.includes('dagre') || id.includes('cytoscape') || id.includes('elkjs') || id.includes('web-worker')) return 'vendor-mermaid';
                // Markdown rendering pipeline + highlight
                if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('unified') || id.includes('bail') || id.includes('is-plain') || id.includes('trough') || id.includes('vfile') || id.includes('unist') || id.includes('highlight.js')) return 'vendor-markdown';
                // KaTeX math rendering
                if (id.includes('katex')) return 'vendor-katex';
                // Utility libraries
                if (id.includes('jszip') || id.includes('dompurify') || id.includes('turndown')) return 'vendor-utils';
                // html2canvas (already dynamically imported in exportUtils)
                if (id.includes('html2canvas')) return 'vendor-html2canvas';
                // Google GenAI SDK
                if (id.includes('@google/genai') || id.includes('gaxios') || id.includes('google-auth')) return 'vendor-google-genai';
                // D3 (used by mermaid/graphviz — only needed for diagrams)
                if (id.includes('/d3-') || id.includes('d3/')) return 'vendor-d3';
              }
            }
          }
        }
      }
    };
});