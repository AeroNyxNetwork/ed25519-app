/**
 * ============================================
 * File: src/components/editor/EditorToolbar.js
 * ============================================
 * Editor Toolbar Component
 * 
 * Creation Reason: Provide editor controls and status display
 * Main Functionality: Save, language selector, theme toggle, status bar
 * Dependencies: lucide-react icons, languageDetector
 * 
 * Main Logical Flow:
 * 1. Display file info and status
 * 2. Provide action buttons (save, close)
 * 3. Show editor statistics
 * 4. Theme and language controls
 * 
 * ⚠️ Important Note for Next Developer:
 * - All callbacks are passed from parent component
 * - Disabled states prevent accidental actions
 * - Statistics update in real-time
 * - DO NOT add business logic here - keep it presentational
 * 
 * Last Modified: v1.0.0 - Initial implementation
 * ============================================
 */

'use client';

import React from 'react';
import {
  Save,
  X,
  FileText,
  Sun,
  Moon,
  Code,
  Loader2,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import clsx from 'clsx';
import { LANGUAGE_NAMES, getLanguageColor } from './languageDetector';

export default function EditorToolbar({
  // File info
  fileName,
  filePath,
  language,
  
  // Content info
  lineCount,
  characterCount,
  hasChanges,
  
  // Actions
  onSave,
  onClose,
  onThemeToggle,
  
  // State
  isSaving,
  saveError,
  theme = 'dark',
  
  // Optional
  readOnly = false,
  className
}) {
  const languageName = LANGUAGE_NAMES[language] || 'Plain Text';
  const languageColor = getLanguageColor(language);
  
  return (
    <div className={clsx(
      'flex items-center justify-between px-4 py-3 border-b border-white/10',
      theme === 'dark' ? 'bg-gradient-to-r from-purple-900/20 to-blue-900/20' : 'bg-gray-100',
      className
    )}>
      {/* Left: File Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <FileText className={clsx(
          'w-5 h-5 flex-shrink-0',
          theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
        )} />
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={clsx(
              'font-medium truncate',
              theme === 'dark' ? 'text-white' : 'text-gray-900'
            )}>
              {fileName}
            </span>
            
            {hasChanges && !isSaving && (
              <div className="flex items-center gap-1 text-xs text-yellow-400">
                <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                <span>Unsaved</span>
              </div>
            )}
            
            {isSaving && (
              <div className="flex items-center gap-1 text-xs text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Saving...</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="truncate">{filePath}</span>
          </div>
        </div>
      </div>
      
      {/* Center: Language & Stats */}
      <div className="flex items-center gap-4 mx-4">
        <div 
          className="flex items-center gap-2 px-3 py-1 rounded-full border"
          style={{
            borderColor: `${languageColor}40`,
            backgroundColor: `${languageColor}10`
          }}
        >
          <Code className="w-3.5 h-3.5" style={{ color: languageColor }} />
          <span className="text-xs font-medium" style={{ color: languageColor }}>
            {languageName}
          </span>
        </div>
        
        {lineCount > 0 && (
          <div className={clsx(
            'text-xs',
            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {lineCount} {lineCount === 1 ? 'line' : 'lines'} • {characterCount.toLocaleString()} chars
          </div>
        )}
      </div>
      
      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          onClick={onThemeToggle}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            theme === 'dark'
              ? 'hover:bg-white/10 text-gray-400 hover:text-white'
              : 'hover:bg-gray-200 text-gray-600 hover:text-gray-900'
          )}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
        
        <div className="w-px h-6 bg-white/10" />
        
        {/* Save Button */}
        {!readOnly && (
          <button
            onClick={onSave}
            disabled={isSaving || !hasChanges}
            className={clsx(
              'px-4 py-2 rounded-lg transition-all flex items-center gap-2 shadow-lg',
              hasChanges && !isSaving
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
            )}
            title={hasChanges ? 'Save changes (Ctrl+S)' : 'No changes to save'}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveError ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : hasChanges ? (
              <Save className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {isSaving ? 'Saving...' : saveError ? 'Error' : hasChanges ? 'Save' : 'Saved'}
            </span>
          </button>
        )}
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isSaving}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            theme === 'dark'
              ? 'hover:bg-white/10 text-gray-400'
              : 'hover:bg-gray-200 text-gray-600',
            isSaving && 'opacity-50 cursor-not-allowed'
          )}
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
