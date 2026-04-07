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
  getHTML: () => string | undefined;
  isSourceView: () => boolean;
}

interface ComponentEditorProps {
  content: TipTapDoc;
  maxChars?: number;
  onChange: (json: TipTapDoc) => void;
  onConstraintsChange?: (maxChars?: number) => void;
  singleLine?: boolean;
  editable?: boolean;
}

export const ComponentEditor = forwardRef<ComponentEditorHandle, ComponentEditorProps>(
  function ComponentEditor({ content, maxChars, onChange, onConstraintsChange, singleLine, editable = true }, ref) {
  const [showSource, setShowSource] = useState(false);
    const [editingConstraints, setEditingConstraints] = useState(false);
  const [sourceHtml, setSourceHtml] = useState("");

  useImperativeHandle(ref, () => ({
    exitSourceView: () => setShowSource(false),
    getHTML: () => editor?.getHTML(),
    isSourceView: () => showSource,
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
          "prose dark:prose-invert max-w-none focus:outline-none min-h-[8rem] px-8 pt-12 pb-8",
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

  // Sync the editable prop to the TipTap editor instance at runtime.
  // useEditor doesn't re-create when props change, so we toggle via the
  // imperative setEditable() API instead.
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  const charCount = editor?.storage.characterCount.characters() ?? 0;

  const wordCount = editor
    ? editor.getText().split(/\s+/).filter(Boolean).length
    : 0;

  const countColor =
    maxChars && charCount > maxChars
      ? "text-ct-strike"
      : maxChars && charCount > maxChars * 0.9
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
    <div>
      {/* Toolbar — sits above the editor page surface */}
      {!singleLine && (
        <div className="relative flex justify-center mx-4" style={{ top: "1.5rem" }}>
          <div
            role="toolbar"
            aria-label="Formatting options"
            className="inline-flex flex-wrap justify-center items-center gap-0.5 rounded-[--radius-lg] bg-ct-cream px-2.5 py-1.5 shadow-[var(--shadow-sm)]"
          >
            {/* Inline formatting */}
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

            {/* Block type */}
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

            {/* Lists, blockquote, link, rule */}
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
        </div>
      )}

      {/* Page surface */}
      <div className="rounded-[--radius-lg] bg-white dark:bg-ct-cream shadow-[var(--shadow-md)]">
        {/* Editor or source view */}
        {showSource ? (
          <textarea
            id="source-html"
            name="source-html"
            value={sourceHtml}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="w-full min-h-[12rem] bg-transparent rounded-[--radius-lg] px-8 pt-12 pb-8 font-mono text-sm text-ct-ink focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <EditorContent editor={editor} />
        )}

        {/* Footer: char count (clickable for max chars constraint) + source toggle */}
        <div className="flex items-center justify-between px-8 pb-4 h-10">
          <div className="flex items-center gap-3">
            {onConstraintsChange ? (
              <button
                onClick={() => setEditingConstraints((prev) => !prev)}
                className={`text-xs ${countColor} hover:text-ct-ink transition-colors cursor-pointer`}
              >
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </button>
            ) : (
              <span className={`text-xs ${countColor}`}>
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
            )}
            {editingConstraints && onConstraintsChange && (
              <label className="flex items-center gap-1 text-xs text-ct-muted">
                Max chars
                <input
                  id="editor-max-chars"
                  name="editor-max-chars"
                  type="number"
                  min={1}
                  value={maxChars ?? ""}
                  onChange={(e) => onConstraintsChange(
                    e.target.value ? Number(e.target.value) : undefined,
                  )}
                  className="w-16 py-0.5 px-1.5 text-xs bg-transparent border border-ct-rule rounded-[--radius-sm] text-ct-ink focus:outline-none focus:border-ct-muted"
                  placeholder="—"
                />
              </label>
            )}
          </div>
          <button
            onClick={toggleSource}
            className="text-xs text-ct-muted hover:text-ct-ink transition-colors"
          >
            {showSource ? "Rich Text" : "HTML"}
          </button>
        </div>
      </div>
    </div>
  );
});
