#!/usr/bin/env node
// Save scraped Gemini docs from browser to files
// Usage: node save-docs.js < key < content from browser evaluate

const fs = require('fs');
const path = require('path');

const BASE = '/Users/jones/Documents/Code/All-Model-Chat/Gemini-API-Docs';
const URL_BASE = 'https://ai.google.dev';

// Read JSON from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const docs = JSON.parse(input);
  let saved = 0;
  for (const [key, content] of Object.entries(docs)) {
    const [cat, name] = key.split('/');
    const dir = path.join(BASE, cat);
    fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, name + '.txt');
    const header = `Title: ${name.replace(/_/g, ' ')}\nCategory: ${cat}\nSource: ${URL_BASE}\nScraped: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
    fs.writeFileSync(filepath, header + content, 'utf-8');
    saved++;
    console.log(`✅ ${cat}/${name}.txt (${(content.length/1024).toFixed(1)} KB)`);
  }
  console.log(`\nTotal: ${saved} files saved.`);
});
