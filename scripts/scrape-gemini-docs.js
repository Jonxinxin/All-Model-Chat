#!/usr/bin/env node
// Gemini API docs scraper - uses Playwright to navigate each page and copy markdown

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://ai.google.dev';
const OUT_DIR = '/Users/jones/Documents/Code/All-Model-Chat/Gemini-API-Docs';

// Category mapping with folder names
const docs = [
  // Get started
  { cat: '01-Get-Started', name: 'Overview', href: '/gemini-api/docs' },
  { cat: '01-Get-Started', name: 'Quickstart', href: '/gemini-api/docs/quickstart' },
  { cat: '01-Get-Started', name: 'API keys', href: '/gemini-api/docs/api-key' },
  { cat: '01-Get-Started', name: 'Libraries', href: '/gemini-api/docs/libraries' },
  { cat: '01-Get-Started', name: 'Pricing', href: '/gemini-api/docs/pricing' },
  { cat: '01-Get-Started', name: 'Batch API', href: '/gemini-api/docs/batch-api' },
  { cat: '01-Get-Started', name: 'Interactions API', href: '/gemini-api/docs/interactions' },
  { cat: '01-Get-Started', name: 'Coding agent setup', href: '/gemini-api/docs/coding-agents' },

  // Models
  { cat: '02-Models', name: 'All models', href: '/gemini-api/docs/models' },
  { cat: '02-Models', name: 'Gemini 3', href: '/gemini-api/docs/gemini-3' },
  { cat: '02-Models', name: 'Nano Banana', href: '/gemini-api/docs/image-generation' },
  { cat: '02-Models', name: 'Veo', href: '/gemini-api/docs/video' },
  { cat: '02-Models', name: 'Lyria 3', href: '/gemini-api/docs/music-generation' },
  { cat: '02-Models', name: 'Lyria RealTime', href: '/gemini-api/docs/realtime-music-generation' },
  { cat: '02-Models', name: 'Imagen', href: '/gemini-api/docs/imagen' },
  { cat: '02-Models', name: 'Text-to-speech', href: '/gemini-api/docs/speech-generation' },
  { cat: '02-Models', name: 'Embeddings', href: '/gemini-api/docs/embeddings' },
  { cat: '02-Models', name: 'Robotics', href: '/gemini-api/docs/robotics-overview' },

  // Core capabilities
  { cat: '03-Core-Capabilities', name: 'Text', href: '/gemini-api/docs/text-generation' },
  { cat: '03-Core-Capabilities', name: 'Image generation', href: '/gemini-api/docs/image-generation?view=gen' },
  { cat: '03-Core-Capabilities', name: 'Image understanding', href: '/gemini-api/docs/image-understanding' },
  { cat: '03-Core-Capabilities', name: 'Video generation', href: '/gemini-api/docs/video?view=gen' },
  { cat: '03-Core-Capabilities', name: 'Video understanding', href: '/gemini-api/docs/video-understanding' },
  { cat: '03-Core-Capabilities', name: 'Documents', href: '/gemini-api/docs/document-processing' },
  { cat: '03-Core-Capabilities', name: 'Speech generation', href: '/gemini-api/docs/speech-generation?view=gen' },
  { cat: '03-Core-Capabilities', name: 'Audio understanding', href: '/gemini-api/docs/audio' },
  { cat: '03-Core-Capabilities', name: 'Thinking', href: '/gemini-api/docs/thinking' },
  { cat: '03-Core-Capabilities', name: 'Thought signatures', href: '/gemini-api/docs/thought-signatures' },
  { cat: '03-Core-Capabilities', name: 'Structured outputs', href: '/gemini-api/docs/structured-output' },
  { cat: '03-Core-Capabilities', name: 'Function calling', href: '/gemini-api/docs/function-calling' },
  { cat: '03-Core-Capabilities', name: 'Long context', href: '/gemini-api/docs/long-context' },

  // Agents
  { cat: '04-Agents', name: 'Agents Overview', href: '/gemini-api/docs/agents' },
  { cat: '04-Agents', name: 'Deep Research Agent', href: '/gemini-api/docs/deep-research' },

  // Tools
  { cat: '05-Tools', name: 'Tools Overview', href: '/gemini-api/docs/tools' },
  { cat: '05-Tools', name: 'Google Search', href: '/gemini-api/docs/google-search' },
  { cat: '05-Tools', name: 'Google Maps', href: '/gemini-api/docs/maps-grounding' },
  { cat: '05-Tools', name: 'Code execution', href: '/gemini-api/docs/code-execution' },
  { cat: '05-Tools', name: 'URL context', href: '/gemini-api/docs/url-context' },
  { cat: '05-Tools', name: 'Computer Use', href: '/gemini-api/docs/computer-use' },
  { cat: '05-Tools', name: 'File Search', href: '/gemini-api/docs/file-search' },
  { cat: '05-Tools', name: 'Combine Tools and Function calling', href: '/gemini-api/docs/tool-combination' },

  // Live API
  { cat: '06-Live-API', name: 'Live API Overview', href: '/gemini-api/docs/live-api' },
  { cat: '06-Live-API', name: 'Get started GenAI SDK', href: '/gemini-api/docs/live-api/get-started-sdk' },
  { cat: '06-Live-API', name: 'Get started WebSockets', href: '/gemini-api/docs/live-api/get-started-websocket' },
  { cat: '06-Live-API', name: 'Capabilities', href: '/gemini-api/docs/live-api/capabilities' },
  { cat: '06-Live-API', name: 'Tool use', href: '/gemini-api/docs/live-api/tools' },
  { cat: '06-Live-API', name: 'Session management', href: '/gemini-api/docs/live-api/session-management' },
  { cat: '06-Live-API', name: 'Ephemeral tokens', href: '/gemini-api/docs/live-api/ephemeral-tokens' },
  { cat: '06-Live-API', name: 'Best practices', href: '/gemini-api/docs/live-api/best-practices' },

  // Guides
  { cat: '07-Guides', name: 'Input methods', href: '/gemini-api/docs/file-input-methods' },
  { cat: '07-Guides', name: 'Files API', href: '/gemini-api/docs/files' },
  { cat: '07-Guides', name: 'Context caching', href: '/gemini-api/docs/caching' },
  { cat: '07-Guides', name: 'OpenAI compatibility', href: '/gemini-api/docs/openai' },
  { cat: '07-Guides', name: 'Media resolution', href: '/gemini-api/docs/media-resolution' },
  { cat: '07-Guides', name: 'Token counting', href: '/gemini-api/docs/tokens' },
  { cat: '07-Guides', name: 'Prompt engineering', href: '/gemini-api/docs/prompting-strategies' },
  { cat: '07-Guides', name: 'Get started with logs', href: '/gemini-api/docs/logs-datasets' },
  { cat: '07-Guides', name: 'Data logging and sharing', href: '/gemini-api/docs/logs-policy' },
  { cat: '07-Guides', name: 'Safety settings', href: '/gemini-api/docs/safety-settings' },
  { cat: '07-Guides', name: 'Safety guidance', href: '/gemini-api/docs/safety-guidance' },

  // Frameworks
  { cat: '08-Frameworks', name: 'LangChain and LangGraph', href: '/gemini-api/docs/langgraph-example' },
  { cat: '08-Frameworks', name: 'CrewAI', href: '/gemini-api/docs/crewai-example' },
  { cat: '08-Frameworks', name: 'LlamaIndex', href: '/gemini-api/docs/llama-index' },
  { cat: '08-Frameworks', name: 'Vercel AI SDK', href: '/gemini-api/docs/vercel-ai-sdk-example' },
  { cat: '08-Frameworks', name: 'Temporal', href: '/gemini-api/docs/temporal-example' },

  // Resources
  { cat: '09-Resources', name: 'Release notes', href: '/gemini-api/docs/changelog' },
  { cat: '09-Resources', name: 'Deprecations', href: '/gemini-api/docs/deprecations' },
  { cat: '09-Resources', name: 'Rate limits', href: '/gemini-api/docs/rate-limits' },
  { cat: '09-Resources', name: 'Billing info', href: '/gemini-api/docs/billing' },
  { cat: '09-Resources', name: 'Migrate to Gen AI SDK', href: '/gemini-api/docs/migrate' },
  { cat: '09-Resources', name: 'API troubleshooting', href: '/gemini-api/docs/troubleshooting' },
  { cat: '09-Resources', name: 'Partner and library integrations', href: '/gemini-api/docs/partner-integration' },

  // Google AI Studio
  { cat: '10-Google-AI-Studio', name: 'AI Studio Quickstart', href: '/gemini-api/docs/ai-studio-quickstart' },
  { cat: '10-Google-AI-Studio', name: 'Vibe code in Build mode', href: '/gemini-api/docs/aistudio-build-mode' },
  { cat: '10-Google-AI-Studio', name: 'Developing Full-Stack Apps', href: '/gemini-api/docs/aistudio-fullstack' },
  { cat: '10-Google-AI-Studio', name: 'Try out LearnLM', href: '/gemini-api/docs/learnlm' },
  { cat: '10-Google-AI-Studio', name: 'AI Studio Troubleshooting', href: '/gemini-api/docs/troubleshoot-ai-studio' },
  { cat: '10-Google-AI-Studio', name: 'Access for Workspace users', href: '/gemini-api/docs/workspace' },

  // Google Cloud Platform
  { cat: '11-Google-Cloud-Platform', name: 'VertexAI Gemini API', href: '/gemini-api/docs/migrate-to-cloud' },
  { cat: '11-Google-Cloud-Platform', name: 'OAuth authentication', href: '/gemini-api/docs/oauth' },

  // Policies
  { cat: '12-Policies', name: 'Terms of service', href: '/gemini-api/terms' },
  { cat: '12-Policies', name: 'Available regions', href: '/gemini-api/docs/available-regions' },
  { cat: '12-Policies', name: 'Abuse monitoring', href: '/gemini-api/docs/usage-policies' },
  { cat: '12-Policies', name: 'Feedback information', href: '/gemini-api/docs/feedback-policies' },
];

function sanitizeFilename(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, '_');
}

async function main() {
  // Create all category dirs
  const cats = [...new Set(docs.map(d => d.cat))];
  for (const cat of cats) {
    fs.mkdirSync(path.join(OUT_DIR, cat), { recursive: true });
  }

  // Connect to existing Chrome via CDP
  const browser = await chromium.connectOverCDP('http://127.0.0.1:18800');
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext();
  const page = await context.newPage();

  let success = 0;
  let fail = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const url = BASE + doc.href + (doc.href.includes('?') ? '&hl=en' : '?hl=en');
    const filename = sanitizeFilename(doc.name) + '.txt';
    const filepath = path.join(OUT_DIR, doc.cat, filename);

    console.log(`[${i+1}/${docs.length}] ${doc.cat}/${doc.name} ...`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for the article content to load
      await page.waitForSelector('article', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Try clicking "Copy page as markdown" button
      const copyBtn = page.locator('button:has-text("Copy page as markdown")').first();
      if (await copyBtn.count() > 0) {
        await copyBtn.click();
        await page.waitForTimeout(2000);

        // The page might copy to clipboard. Try reading clipboard or just extract the article content
        // Since CDP clipboard access is tricky, we'll extract the article text directly
      }

      // Extract the article content as text
      const content = await page.evaluate(() => {
        const article = document.querySelector('article');
        if (!article) return null;
        
        // Get all text content from the article
        const clone = article.cloneNode(true);
        
        // Remove script and style tags
        clone.querySelectorAll('script, style, .devsite-banner, .devsite-article-meta').forEach(el => el.remove());
        
        // Convert to readable text
        return clone.innerText;
      });

      if (content && content.trim().length > 100) {
        // Add metadata header
        const header = `# ${doc.name}\n# Source: ${url}\n# Category: ${doc.cat}\n# Scraped: ${new Date().toISOString()}\n\n`;
        fs.writeFileSync(filepath, header + content.trim(), 'utf-8');
        console.log(`  ✅ Saved (${(content.length / 1024).toFixed(1)} KB)`);
        success++;
      } else {
        console.log(`  ⚠️ Content too short (${content?.length || 0} chars), trying longer wait...`);
        await page.waitForTimeout(3000);
        const content2 = await page.evaluate(() => {
          const article = document.querySelector('article');
          if (!article) return document.body.innerText;
          const clone = article.cloneNode(true);
          clone.querySelectorAll('script, style').forEach(el => el.remove());
          return clone.innerText;
        });
        if (content2 && content2.trim().length > 50) {
          const header = `# ${doc.name}\n# Source: ${url}\n# Category: ${doc.cat}\n# Scraped: ${new Date().toISOString()}\n\n`;
          fs.writeFileSync(filepath, header + content2.trim(), 'utf-8');
          console.log(`  ✅ Saved on retry (${(content2.length / 1024).toFixed(1)} KB)`);
          success++;
        } else {
          console.log(`  ❌ Failed - no content`);
          fail++;
        }
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone! ${success} saved, ${fail} failed.`);
  await page.close();
}

main().catch(console.error);
