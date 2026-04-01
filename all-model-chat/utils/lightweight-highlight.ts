// Custom lightweight rehype-highlight plugin that uses selective language registration
// Replaces rehype-highlight which bundles ALL languages (~1MB) with only ~35 languages (~50KB)
import type { LanguageFn } from 'highlight.js';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import plaintext from 'highlight.js/lib/languages/plaintext';
import diff from 'highlight.js/lib/languages/diff';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import scala from 'highlight.js/lib/languages/scala';
import r from 'highlight.js/lib/languages/r';
import latex from 'highlight.js/lib/languages/latex';
import protobuf from 'highlight.js/lib/languages/protobuf';
import ini from 'highlight.js/lib/languages/ini';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';
import lua from 'highlight.js/lib/languages/lua';
import dart from 'highlight.js/lib/languages/dart';
import elixir from 'highlight.js/lib/languages/elixir';
import haskell from 'highlight.js/lib/languages/haskell';

// Map of language names/aliases to their modules
const languageMap: Record<string, LanguageFn> = {
    javascript, typescript, python, json, bash, shell, css, xml, markdown,
    sql, java, cpp, c, csharp, go, rust, yaml, dockerfile, plaintext,
    diff, ruby, php, swift, kotlin, scala, r, latex, protobuf, ini,
    nginx, powershell, lua, dart, elixir, haskell,
    js: javascript, ts: typescript, py: python, sh: bash, zsh: bash,
    html: xml, svg: xml, yml: yaml, 'c++': cpp, 'c#': csharp, cs: csharp,
    golang: go, rs: rust, rb: ruby, kt: kotlin, tex: latex, proto: protobuf,
    toml: ini, conf: ini, ps1: powershell, ex: elixir, exs: elixir, hs: haskell,
};

for (const [name, lang] of Object.entries(languageMap)) {
    try {
        hljs.registerLanguage(name, lang);
    } catch {
        // Already registered, skip
    }
}

// Export hljs instance for other consumers (CodeEditor etc.)
export { hljs };

// Rehype plugin compatible with rehype-highlight API
function rehypeHighlightPlugin(options: { ignoreMissing?: boolean; detect?: boolean; subset?: string[] } = {}) {
    return (tree: any) => {
        visitCodeBlocks(tree);
    };
}

function visitCodeBlocks(tree: any) {
    if (tree.children) {
        for (const child of tree.children) {
            visitCodeBlocks(child);
        }
    }

    if (
        tree.type === 'element' &&
        tree.tagName === 'pre' &&
        tree.children &&
        tree.children.length === 1
    ) {
        const code = tree.children[0];
        if (code.type === 'element' && code.tagName === 'code') {
            highlightCodeBlock(code);
        }
    }
}

function highlightCodeBlock(codeNode: any) {
    const className = getPropertyValue(codeNode, 'className') || '';
    const classes = Array.isArray(className) ? className : [className];
    const langClass = classes.find((c: string) => c.startsWith('language-'));
    const language = langClass ? langClass.replace('language-', '') : null;

    const text = getTextContent(codeNode);
    if (!text) return;

    try {
        let result;
        if (language && hljs.getLanguage(language)) {
            result = hljs.highlight(text, { language, ignoreIllegals: true });
        } else {
            // Auto-detect
            result = hljs.highlightAuto(text);
        }

        if (result && result.value) {
            // Set the highlighted HTML as raw children
            codeNode.children = [{
                type: 'raw',
                value: result.value,
            }];
            if (!classes.includes('hljs')) {
                classes.push('hljs');
            }
        }
    } catch {
        // Silently ignore highlighting failures
    }
}

function getPropertyValue(node: any, prop: string): any {
    if (node.properties && node.properties[prop] !== undefined) {
        return node.properties[prop];
    }
    return null;
}

function getTextContent(node: any): string {
    if (node.type === 'text') return node.value || '';
    if (node.children) {
        return node.children.map((child: any) => getTextContent(child)).join('');
    }
    return '';
}

export default rehypeHighlightPlugin;
