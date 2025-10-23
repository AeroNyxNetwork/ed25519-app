/**
 * ============================================
 * File: src/components/editor/CodeEditor.js
 * ============================================
 * Professional Code Editor Component - PRODUCTION VERSION v1.0.0
 * 
 * Creation Reason: Provide VS Code-like editing experience
 * Main Functionality: Syntax highlighting, code editing with advanced features
 * Dependencies: CodeMirror 6, language packs, themes
 * 
 * Main Logical Flow:
 * 1. Detect file language from filename
 * 2. Load appropriate syntax highlighting
 * 3. Initialize editor with extensions
 * 4. Handle user input and save actions
 * 5. Provide keyboard shortcuts
 * 
 * Features:
 * - ✅ Syntax highlighting for 15+ languages
 * - ✅ Line numbers and code folding
 * - ✅ Search and replace
 * - ✅ Auto-save indicator
 * - ✅ Keyboard shortcuts (Ctrl+S, Ctrl+F)
 * - ✅ Theme switching
 * - ✅ Performance optimized for large files
 * 
 * ⚠️ Important Note for Next Developer:
 * - CodeMirror state is immutable - use onChange callback
 * - Extensions array must be memoized for performance
 * - Auto-save uses debounce to prevent excessive saves
 * - DO NOT modify basicSetup config without testing
 * 
 * Last Modified: v1.0.0 - Initial production implementation
 * ============================================
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';
import { AlertCircle, X } from 'lucide-react';
import clsx from 'clsx';

import EditorToolbar from './EditorToolbar';
import { detectLanguage, getLanguageExtension, isMarkdownFile } from './languageDetector';
import MarkdownEditor from './MarkdownEditor';

export default function CodeEditor({
  // File data
  file,
  initialContent = '',
  
  // Callbacks
  onSave,
  onClose,
  
  // Options
  readOnly = false,
  autoSave = false,
  autoSaveDelay = 2000,
  
  // State
  isSaving = false,
  saveError = null,
  
  // Style
  className
}) {
  // ==================== State ====================
  const [content, setContent] = useState(initialContent);
  const [hasChanges, setHasChanges] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [error, setError] = useState(null);
  
  // Stats
  const [lineCount, setLineCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  
  // Refs
  const autoSaveTimerRef = useRef(null);
  const initialContentRef = useRef(initialContent);
  const editorViewRef = useRef(null);
  
  // ==================== Language Detection ====================
  const language = useMemo(() => {
    return detectLanguage(file?.name || '');
  }, [file?.name]);
  
  const isMarkdown = useMemo(() => {
    return isMarkdownFile(file?.name || '');
  }, [file?.name]);
  
  // ==================== Extensions ====================
  const extensions = useMemo(() => {
    return getLanguageExtension(language);
  }, [language]);
  
  // ==================== Content Management ====================
  
  useEffect(() => {
    setContent(initialContent);
    initialContentRef.current = initialContent;
    setHasChanges(false);
    updateStats(initialContent);
  }, [initialContent]);
  
  const handleChange = useCallback((value) => {
    setContent(value);
    setHasChanges(value !== initialContentRef.current);
    updateStats(value);
    setError(null);
    
    // Auto-save logic
    if (autoSave && !readOnly) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      
      autoSaveTimerRef.current = setTimeout(() => {
        if (value !== initialContentRef.current) {
          handleSave(value);
        }
      }, autoSaveDelay);
    }
  }, [autoSave, autoSaveDelay, readOnly]);
  
  const updateStats = (text) => {
    const lines = text.split('\n').length;
    const chars = text.length;
    setLineCount(lines);
    setCharacterCount(chars);
  };
  
  // ==================== Actions ====================
  
  const handleSave = useCallback(async (contentToSave = content) => {
    if (readOnly || !hasChanges) return;
    
    try {
      setError(null);
      await onSave(contentToSave);
      
      // Update reference after successful save
      initialContentRef.current = contentToSave;
      setHasChanges(false);
      
      // Clear auto-save timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    } catch (err) {
      console.error('[CodeEditor] Save failed:', err);
      setError(err.message || 'Failed to save file');
    }
  }, [content, hasChanges, readOnly, onSave]);
  
  const handleClose = useCallback(() => {
    // Clear auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    // Warn if unsaved changes
    if (hasChanges && !readOnly) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) return;
    }
    
    onClose();
  }, [hasChanges, readOnly, onClose]);
  
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);
  
  // ==================== Keyboard Shortcuts ====================
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!readOnly && hasChanges) {
          handleSave();
        }
      }
      
      // Escape: Close
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, readOnly, handleSave, handleClose]);
  
  // ==================== Cleanup ====================
  
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);
  
  // ==================== Render ====================
  
  // If markdown, use specialized editor
  if (isMarkdown) {
    return (
      <MarkdownEditor
        file={file}
        initialContent={initialContent}
        onSave={onSave}
        onClose={onClose}
        isSaving={isSaving}
        saveError={saveError}
        readOnly={readOnly}
        className={className}
      />
    );
  }
  
  return (
    <div className={clsx('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <EditorToolbar
        fileName={file?.name || 'Untitled'}
        filePath={file?.path || ''}
        language={language}
        lineCount={lineCount}
        characterCount={characterCount}
        hasChanges={hasChanges}
        onSave={() => handleSave()}
        onClose={handleClose}
        onThemeToggle={toggleTheme}
        isSaving={isSaving}
        saveError={saveError}
        theme={theme}
        readOnly={readOnly}
      />
      
      {/* Error Message */}
      <AnimatePresence>
        {(error || saveError) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={clsx(
              'mx-4 mt-3 p-3 rounded-lg border flex items-center gap-2',
              theme === 'dark'
                ? 'bg-red-500/20 border-red-500/50'
                : 'bg-red-100 border-red-300'
            )}
          >
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className={clsx(
              'text-sm flex-1',
              theme === 'dark' ? 'text-red-400' : 'text-red-700'
            )}>
              {error || saveError}
            </p>
            <button
              onClick={() => setError(null)}
              className={clsx(
                'p-1 rounded transition-colors',
                theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-red-200'
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={content}
          height="100%"
          theme={theme === 'dark' ? vscodeDark : githubLight}
          extensions={extensions}
          onChange={handleChange}
          readOnly={readOnly}
          editable={!readOnly}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          style={{
            fontSize: '14px',
            height: '100%'
          }}
        />
      </div>
      
      {/* Status Bar */}
      <div className={clsx(
        'px-4 py-2 border-t flex items-center justify-between text-xs',
        theme === 'dark'
          ? 'bg-black/40 border-white/10 text-gray-400'
          : 'bg-gray-100 border-gray-300 text-gray-600'
      )}>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>LF</span>
          {readOnly && (
            <span className="text-yellow-400 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Read Only
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-gray-500">
          <span>Ctrl+S to save</span>
          <span>•</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
