"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import Link from "@tiptap/extension-link";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import type { TipTapDoc } from "@/lib/tiptap-utils";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Link2,
  Minus,
} from "lucide-react";

// Block-level tags that should start on their own line
const BLOCK_TAGS = /^\/?(p|h[1-6]|ul|ol|li|blockquote|hr|div|pre|table|thead|tbody|tr|th|td)$/i;

function formatHtml(html: string): string {
  let indent = 0;
  return html
    .replace(/></g, ">\n<")
    .split("\n")
    .map((line) => {
      const closing = line.match(/^<\/(\w+)/);
      if (closing && BLOCK_TAGS.test(closing[1])) indent = Math.max(0, indent - 1);

      const result = "  ".repeat(indent) + line;

      const opening = line.match(/^<(\w+)/);
      const selfClosing = /\/>$/.test(line) || /^<hr/.test(line);
      if (opening && BLOCK_TAGS.test(opening[1]) && !selfClosing && !closing) indent++;

      return result;
    })
    .join("\n");
}

// --- Toolbar helpers ---

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`group/tip relative rounded-[--radius-sm] p-1.5 transition-colors ${
        active
          ? "bg-ct-cream text-ct-ink"
          : "text-ct-muted hover:text-ct-ink"
      }`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2
          rounded-[--radius-sm] bg-ct-ink px-2 py-0.5 text-[11px] leading-tight text-ct-paper whitespace-nowrap
          opacity-0 scale-95 transition-all duration-150
          group-hover/tip:opacity-100 group-hover/tip:scale-100 group-hover/tip:delay-500"
      >
        {label}
      </span>
    </button>
  );
}

function ToolbarDivider() {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="mx-1 h-4 w-px bg-ct-rule"
    />
  );
}

export interface ComponentEditorHandle {
  exitSourceView: () => void;
}

interface ComponentEditorProps {
  content: TipTapDoc;
  maxChars?: number;
  minChars?: number;
  onChange: (json: TipTapDoc) => void;
  singleLine?: boolean;
}

export const ComponentEditor = forwardRef<ComponentEditorHandle, ComponentEditorProps>(
  function ComponentEditor({ content, maxChars, minChars, onChange, singleLine }, ref) {
  const [showSource, setShowSource] = useState(false);
  const [sourceHtml, setSourceHtml] = useState("");

  useImperativeHandle(ref, () => ({
    exitSourceView: () => setShowSource(false),
  }));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: singleLine ? false : { levels: [1, 2, 3, 4, 5, 6] },
        bulletList: singleLine ? false : undefined,
        orderedList: singleLine ? false : undefined,
        blockquote: singleLine ? false : undefined,
        codeBlock: singleLine ? false : undefined,
        horizontalRule: singleLine ? false : undefined,
      }),
      CharacterCount.configure({
        limit: maxChars,
      }),
      ...(!singleLine
        ? [
            Link.configure({
              openOnClick: false,
              HTMLAttributes: {
                target: "_blank",
                rel: "noopener noreferrer",
              },
            }),
          ]
        : []),
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
          "prose dark:prose-invert max-w-none focus:outline-none min-h-[2.5rem] px-3 py-4",
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
      ? "text-ct-strike"
      : maxChars && charCount > maxChars * 0.9
        ? "text-ct-highlight"
        : minChars && charCount < minChars
          ? "text-ct-highlight"
          : "text-ct-muted";

  const handleSourceChange = useCallback(
    (html: string) => {
      setSourceHtml(html);
      editor?.commands.setContent(html);
    },
    [editor],
  );

  const toggleSource = useCallback(() => {
    if (!showSource && editor) {
      setSourceHtml(formatHtml(editor.getHTML()));
    }
    setShowSource((prev) => !prev);
  }, [showSource, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-[--radius-md] border border-ct-rule bg-ct-paper">
      {/* Toolbar — only for multi-line mode */}
      {!singleLine && (
        <div
          role="toolbar"
          aria-label="Formatting options"
          className="flex flex-wrap items-center gap-0.5 border-b border-ct-rule px-2 py-1"
        >
          {/* Group 1: Inline formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            label="Bold"
          >
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            label="Italic"
          >
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            label="Strikethrough"
          >
            <Strikethrough size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            label="Inline Code"
          >
            <Code size={16} />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Group 2: Heading dropdown */}
          <select
            value={
              [1, 2, 3, 4, 5, 6].find((l) =>
                editor.isActive("heading", { level: l }),
              )
                ? `h${[1, 2, 3, 4, 5, 6].find((l) => editor.isActive("heading", { level: l }))}`
                : "paragraph"
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === "paragraph") {
                editor.chain().focus().setParagraph().run();
              } else {
                editor
                  .chain()
                  .focus()
                  .toggleHeading({
                    level: parseInt(val[1]) as 1 | 2 | 3 | 4 | 5 | 6,
                  })
                  .run();
              }
            }}
            className="h-7 rounded-[--radius-sm] border-none bg-transparent px-1 text-xs font-ui text-ct-muted hover:text-ct-ink focus:outline-none cursor-pointer"
            aria-label="Block type"
          >
            <option value="paragraph">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="h5">Heading 5</option>
            <option value="h6">Heading 6</option>
          </select>

          <ToolbarDivider />

          {/* Group 3: Lists & blockquote */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            label="Bullet List"
          >
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            label="Ordered List"
          >
            <ListOrdered size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            label="Blockquote"
          >
            <Quote size={16} />
          </ToolbarButton>

          <ToolbarDivider />

          {/* Group 4: Link & horizontal rule */}
          <ToolbarButton
            onClick={() => {
              if (editor.isActive("link")) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              const url = window.prompt("URL:");
              if (url) {
                editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            active={editor.isActive("link")}
            label="Link"
          >
            <Link2 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            active={false}
            label="Horizontal Rule"
          >
            <Minus size={16} />
          </ToolbarButton>
        </div>
      )}

      {/* Editor or source view */}
      {showSource ? (
        <textarea
          value={sourceHtml}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="w-full min-h-[6rem] bg-ct-paper px-3 py-2 font-mono text-sm text-ct-ink focus:outline-none"
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* Footer: char count + source toggle */}
      <div className="flex items-center justify-between border-t border-ct-rule px-3 py-1.5">
        <span className={`text-xs ${charColor}`}>
          {charCount}
          {maxChars ? ` / ${maxChars}` : ""}
          {minChars ? ` (min ${minChars})` : ""}
        </span>
        <button
          onClick={toggleSource}
          className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
        >
          {showSource ? "Rich Text" : "HTML"}
        </button>
      </div>
    </div>
  );
});
