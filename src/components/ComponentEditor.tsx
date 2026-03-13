"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import { useCallback, useEffect, useState } from "react";
import type { TipTapDoc } from "@/lib/tiptap-utils";

interface ComponentEditorProps {
  content: TipTapDoc;
  maxChars?: number;
  minChars?: number;
  onChange: (json: TipTapDoc) => void;
  singleLine?: boolean;
}

export function ComponentEditor({
  content,
  maxChars,
  minChars,
  onChange,
  singleLine,
}: ComponentEditorProps) {
  const [showSource, setShowSource] = useState(false);
  const [sourceHtml, setSourceHtml] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: singleLine ? false : undefined,
        bulletList: singleLine ? false : undefined,
        orderedList: singleLine ? false : undefined,
        blockquote: singleLine ? false : undefined,
        codeBlock: singleLine ? false : undefined,
        horizontalRule: singleLine ? false : undefined,
      }),
      CharacterCount.configure({
        limit: maxChars,
      }),
    ],
    content,
    editorProps: {
      handleKeyDown: singleLine
        ? (_view, event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              return true;
            }
            return false;
          }
        : undefined,
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[2.5rem] px-3 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as TipTapDoc);
    },
  });

  useEffect(() => {
    if (editor && content) {
      const current = JSON.stringify(editor.getJSON());
      const incoming = JSON.stringify(content);
      if (current !== incoming) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content]);

  const charCount = editor?.storage.characterCount.characters() ?? 0;

  const charColor =
    maxChars && charCount > maxChars
      ? "text-red-500"
      : maxChars && charCount > maxChars * 0.9
        ? "text-yellow-500"
        : minChars && charCount < minChars
          ? "text-yellow-500"
          : "text-foreground/40";

  const handleSourceChange = useCallback(
    (html: string) => {
      setSourceHtml(html);
      editor?.commands.setContent(html);
    },
    [editor]
  );

  const toggleSource = useCallback(() => {
    if (!showSource && editor) {
      setSourceHtml(editor.getHTML());
    }
    setShowSource((prev) => !prev);
  }, [showSource, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-foreground/10 bg-background">
      {/* Toolbar — only for paragraph mode */}
      {!singleLine && (
        <div className="flex items-center gap-1 border-b border-foreground/10 px-2 py-1">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rounded px-2 py-1 text-sm transition-colors ${
              editor.isActive("bold")
                ? "bg-foreground/10 text-foreground"
                : "text-foreground/50 hover:text-foreground"
            }`}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rounded px-2 py-1 text-sm italic transition-colors ${
              editor.isActive("italic")
                ? "bg-foreground/10 text-foreground"
                : "text-foreground/50 hover:text-foreground"
            }`}
          >
            I
          </button>
        </div>
      )}

      {/* Editor or source view */}
      {showSource ? (
        <textarea
          value={sourceHtml}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="w-full min-h-[6rem] bg-background px-3 py-2 font-mono text-sm text-foreground focus:outline-none"
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* Footer: char count + source toggle */}
      <div className="flex items-center justify-between border-t border-foreground/10 px-3 py-1.5">
        <span className={`text-xs ${charColor}`}>
          {charCount}
          {maxChars ? ` / ${maxChars}` : ""}
          {minChars ? ` (min ${minChars})` : ""}
        </span>
        <button
          onClick={toggleSource}
          className="text-xs text-foreground/40 hover:text-foreground transition-colors"
        >
          {showSource ? "Rich Text" : "HTML"}
        </button>
      </div>
    </div>
  );
}
