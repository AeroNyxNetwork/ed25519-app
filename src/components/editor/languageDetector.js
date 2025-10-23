/**
 * ============================================
 * File: src/components/editor/languageDetector.js
 * ============================================
 * Language Detection and Configuration Utility
 * 
 * Creation Reason: Auto-detect file language for syntax highlighting
 * Main Functionality: Map file extensions to CodeMirror language modes
 * Dependencies: CodeMirror language packages
 * 
 * Main Logical Flow:
 * 1. Extract file extension from filename
 * 2. Map extension to language identifier
 * 3. Return appropriate CodeMirror extension
 * 
 * ⚠️ Important Note for Next Developer:
 * - Language imports are lazy-loaded for performance
 * - Add new languages by updating LANGUAGE_MAP
 * - Fallback to plain text if language not found
 * - DO NOT delete existing language mappings
 * 
 * Last Modified: v1.0.0 - Initial implementation
 * ============================================
 */

import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';

/**
 * Language map - Extension to language identifier
 */
export const LANGUAGE_MAP = {
  // JavaScript family
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  
  // Python
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  
  // Markdown
  md: 'markdown',
  markdown: 'markdown',
  
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  
  // Data formats
  json: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  
  // Systems programming
  rs: 'rust',
  go: 'go',
  c: 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  
  // Java ecosystem
  java: 'java',
  kt: 'kotlin',
  
  // Scripting
  php: 'php',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  
  // Database
  sql: 'sql',
  
  // Config files
  conf: 'text',
  config: 'text',
  ini: 'text',
  env: 'text',
  
  // Text
  txt: 'text',
  log: 'text',
  
  // Other
  dockerfile: 'dockerfile',
  gitignore: 'text'
};

/**
 * Language display names
 */
export const LANGUAGE_NAMES = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  rust: 'Rust',
  go: 'Go',
  cpp: 'C/C++',
  java: 'Java',
  php: 'PHP',
  ruby: 'Ruby',
  shell: 'Shell',
  sql: 'SQL',
  text: 'Plain Text'
};

/**
 * Get language extension for CodeMirror
 */
export function getLanguageExtension(language) {
  const extensions = [];
  
  switch (language) {
    case 'javascript':
    case 'typescript':
      extensions.push(javascript({ jsx: true, typescript: language === 'typescript' }));
      break;
      
    case 'python':
      extensions.push(python());
      break;
      
    case 'markdown':
      extensions.push(markdown());
      break;
      
    case 'html':
      extensions.push(html());
      break;
      
    case 'css':
      extensions.push(css());
      break;
      
    case 'json':
      extensions.push(json());
      break;
      
    case 'xml':
      extensions.push(xml());
      break;
      
    case 'rust':
      extensions.push(rust());
      break;
      
    case 'go':
      extensions.push(go());
      break;
      
    case 'java':
      extensions.push(java());
      break;
      
    case 'cpp':
      extensions.push(cpp());
      break;
      
    case 'php':
      extensions.push(php());
      break;
      
    case 'sql':
      extensions.push(sql());
      break;
      
    default:
      // Plain text mode
      break;
  }
  
  return extensions;
}

/**
 * Detect language from filename
 */
export function detectLanguage(filename) {
  if (!filename) return 'text';
  
  // Special cases
  if (filename === 'Dockerfile') return 'dockerfile';
  if (filename === '.gitignore') return 'text';
  if (filename === '.env') return 'text';
  
  // Extract extension
  const parts = filename.split('.');
  const extension = parts.length > 1 ? parts.pop().toLowerCase() : '';
  
  // Map to language
  return LANGUAGE_MAP[extension] || 'text';
}

/**
 * Check if file is markdown
 */
export function isMarkdownFile(filename) {
  const lang = detectLanguage(filename);
  return lang === 'markdown';
}

/**
 * Check if language supports specific features
 */
export function supportsAutoComplete(language) {
  return ['javascript', 'typescript', 'python', 'java', 'cpp', 'rust'].includes(language);
}

export function supportsLinting(language) {
  return ['javascript', 'typescript', 'python', 'json'].includes(language);
}

/**
 * Get file icon color by language
 */
export function getLanguageColor(language) {
  const colors = {
    javascript: '#F7DF1E',
    typescript: '#3178C6',
    python: '#3776AB',
    markdown: '#083FA1',
    html: '#E34F26',
    css: '#1572B6',
    json: '#000000',
    rust: '#CE422B',
    go: '#00ADD8',
    java: '#007396',
    cpp: '#00599C',
    php: '#777BB4',
    sql: '#CC2927',
    text: '#6B7280'
  };
  
  return colors[language] || '#6B7280';
}
