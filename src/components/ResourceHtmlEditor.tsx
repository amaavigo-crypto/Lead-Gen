import React, { useEffect, useRef, useState } from 'react';
import { Bold, Code2, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react';
import { sanitizeResourceHtml } from '../shared/resourceHtml.js';

interface ResourceHtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onOpenImageLibrary: () => void;
}

type EditorMode = 'visual' | 'html';

export default function ResourceHtmlEditor({ value, onChange, onOpenImageLibrary }: ResourceHtmlEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'visual' || !editorRef.current) return;
    const safeValue = sanitizeResourceHtml(value || '');
    if (editorRef.current.innerHTML !== safeValue && !editorRef.current.contains(document.activeElement)) {
      editorRef.current.innerHTML = safeValue;
    }
  }, [value, mode]);

  const syncVisual = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const runCommand = (command: string, argument?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, argument);
    syncVisual();
  };

  const switchMode = (next: EditorMode) => {
    if (mode === 'visual') syncVisual();
    setMode(next);
  };

  const addLink = () => {
    const url = window.prompt('Enter a link URL (https:// or a path on this website):');
    if (!url) return;
    if (!(/^https:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//')))) {
      window.alert('Use an HTTPS link or a same-site path.');
      return;
    }
    runCommand('createLink', url);
  };

  const tools = [
    { label: 'Heading', icon: <Heading2 size={14} />, action: () => runCommand('formatBlock', 'h2') },
    { label: 'Bold', icon: <Bold size={14} />, action: () => runCommand('bold') },
    { label: 'Italic', icon: <Italic size={14} />, action: () => runCommand('italic') },
    { label: 'Bulleted list', icon: <List size={14} />, action: () => runCommand('insertUnorderedList') },
    { label: 'Numbered list', icon: <ListOrdered size={14} />, action: () => runCommand('insertOrderedList') },
    { label: 'Quote', icon: <Quote size={14} />, action: () => runCommand('formatBlock', 'blockquote') },
    { label: 'Link', icon: <Link2 size={14} />, action: addLink },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-2">
        <div className="flex gap-1">
          <button type="button" onClick={() => switchMode('visual')} className={'rounded-lg px-3 py-1.5 text-xs font-semibold ' + (mode === 'visual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>Visual editor</button>
          <button type="button" onClick={() => switchMode('html')} className={'rounded-lg px-3 py-1.5 text-xs font-semibold ' + (mode === 'html' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>HTML source</button>
        </div>
        <button type="button" onClick={onOpenImageLibrary} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ImagePlus size={14} /> Image library</button>
      </div>
      {mode === 'visual' ? (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-2 py-2">
            {tools.map((tool) => <button key={tool.label} type="button" title={tool.label} aria-label={tool.label} onClick={tool.action} className="rounded-md border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100">{tool.icon}</button>)}
            <span className="ml-auto text-[10px] text-slate-400">Select text to format it</span>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncVisual}
            onBlur={syncVisual}
            className="resource-html-editor min-h-[360px] max-h-[720px] overflow-y-auto px-5 py-4 text-sm leading-7 text-slate-800 outline-none"
            data-placeholder="Start writing your article, paste formatted content, or import an HTML / ZIP package…"
          />
        </>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500"><Code2 size={13} /> HTML source · scripts and unsafe attributes are removed on save</div>
          <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} className="min-h-[420px] w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100 outline-none" placeholder="<article>…</article>" />
        </div>
      )}
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-500">
        Safe HTML elements, article CSS and platform image URLs are supported. JavaScript, forms, embedded scripts and unsafe links are stripped before publishing.
      </div>
    </div>
  );
}
