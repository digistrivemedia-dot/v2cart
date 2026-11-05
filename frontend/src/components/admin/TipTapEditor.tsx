"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { useCallback } from 'react';
import {
  HiCode,
  HiOutlineViewList,
  HiLink,
  HiPhotograph,
  HiOutlineMenu,
} from 'react-icons/hi';
import {
  RiBold,
  RiItalic,
  RiUnderline,
  RiStrikethrough,
  RiH1,
  RiH2,
  RiH3,
  RiAlignLeft,
  RiAlignCenter,
  RiAlignRight,
  RiListOrdered,
  RiDoubleQuotesL,
  RiImageAddLine,
  RiLinkM,
  RiFormatClear
} from 'react-icons/ri';

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
}

// Helper function to convert plain text with formatting to HTML
const processTextToHTML = (text: string): string => {
  if (!text || !text.trim()) return text;

  // Split into lines but keep track of empty lines for spacing
  const allLines = text.split('\n');
  let result = '';
  let inList = false;
  let listType = ''; // 'ol' or 'ul'
  let listItems: string[] = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();

    // Skip completely empty lines within lists or between paragraphs
    if (line.length === 0) {
      // If we're in a list, empty line might end it
      if (inList) {
        result += `<${listType}>${listItems.join('')}</${listType}>`;
        inList = false;
        listItems = [];
        listType = '';
      }
      continue;
    }

    // Check if line is a numbered list item (e.g., "1.", "2.", "3.", etc.)
    const numberedListMatch = line.match(/^(\d+)[\.\)]\s+(.+)/);
    // Check if line is a bullet point (e.g., "•", "-", "*")
    const bulletListMatch = line.match(/^[•\-\*\+]\s+(.+)/);

    if (numberedListMatch) {
      const content = numberedListMatch[2];

      // Process bold/italic text
      let processedContent = content
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>');

      if (!inList || listType !== 'ol') {
        // Close previous list if it was a different type
        if (inList && listType === 'ul') {
          result += `<ul>${listItems.join('')}</ul>`;
        }
        inList = true;
        listType = 'ol';
        listItems = [];
      }
      listItems.push(`<li><p>${processedContent}</p></li>`);
    } else if (bulletListMatch) {
      const content = bulletListMatch[1];

      let processedContent = content
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>');

      if (!inList || listType !== 'ul') {
        // Close previous list if it was a different type
        if (inList && listType === 'ol') {
          result += `<ol>${listItems.join('')}</ol>`;
        }
        inList = true;
        listType = 'ul';
        listItems = [];
      }
      listItems.push(`<li><p>${processedContent}</p></li>`);
    } else {
      // Not a list item - regular paragraph
      if (inList) {
        // Close the list
        result += `<${listType}>${listItems.join('')}</${listType}>`;
        inList = false;
        listItems = [];
        listType = '';
      }

      // Process bold/italic text in regular paragraphs
      let processedLine = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>');

      result += `<p>${processedLine}</p>`;
    }
  }

  // Close any remaining list
  if (inList) {
    result += `<${listType}>${listItems.join('')}</${listType}>`;
  }

  console.log('🔧 processTextToHTML result:', result);

  return result || text; // Return original if no processing occurred
};

export const TipTapEditor = ({ content, onChange }: TipTapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        paragraph: {
          HTMLAttributes: {
            class: 'mb-4',
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc pl-6 my-4',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal pl-6 my-4',
          },
        },
        listItem: {
          HTMLAttributes: {
            class: 'mb-2',
          },
        },
        hardBreak: {
          keepMarks: true,
        },
      }),
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-orange-500 underline',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[300px] p-4 prose-p:mb-4 prose-ul:my-4 prose-ol:my-4 prose-li:mb-2',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');

        if (!text) {
          return false; // Let TipTap handle it
        }

        console.log('📋 RAW PASTED TEXT:', text);

        // Check if text has numbered lists or bullet points
        const hasNumberedList = /^\d+[\.\)]\s+/m.test(text);
        const hasBulletList = /^[•\-\*\+]\s+/m.test(text);
        const hasBold = /\*\*(.+?)\*\*/g.test(text);

        console.log('🔍 Detection:', { hasNumberedList, hasBulletList, hasBold });

        if (!hasNumberedList && !hasBulletList && !hasBold) {
          return false; // Plain text, let TipTap handle normally
        }

        // Process the text
        const html = processTextToHTML(text);
        console.log('✅ PROCESSED HTML:', html);

        // Prevent default paste
        event.preventDefault();

        // Insert the HTML using TipTap commands
        if (editor) {
          editor.commands.insertContent(html);
          return true;
        }

        return false;
      },
    },
  });

  const addLink = useCallback(() => {
    const url = window.prompt('Enter URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL:');
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const clearFormatting = useCallback(() => {
    if (editor) {
      editor.chain().focus().clearNodes().unsetAllMarks().run();
    }
  }, [editor]);

  if (!editor) {
    return (
      <div className="h-64 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200">
        <p className="text-slate-500">Loading editor...</p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-slate-50 p-2 flex flex-wrap gap-1">
        {/* Text Formatting */}
        <div className="flex gap-1 border-r border-slate-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('bold') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Bold"
          >
            <RiBold className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('italic') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Italic"
          >
            <RiItalic className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('underline') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Underline"
          >
            <RiUnderline className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('strike') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Strikethrough"
          >
            <RiStrikethrough className="w-5 h-5" />
          </button>
        </div>

        {/* Headings */}
        <div className="flex gap-1 border-r border-slate-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('heading', { level: 1 }) ? 'bg-slate-300' : ''}`}
            type="button"
          >
            <RiH1 className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('heading', { level: 2 }) ? 'bg-slate-300' : ''}`}
            type="button"
          >
            <RiH2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('heading', { level: 3 }) ? 'bg-slate-300' : ''}`}
            type="button"
          >
            <RiH3 className="w-5 h-5" />
          </button>
        </div>

        {/* Lists */}
        <div className="flex gap-1 border-r border-slate-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('bulletList') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Bullet List"
          >
            <HiOutlineViewList className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('orderedList') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Numbered List"
          >
            <RiListOrdered className="w-5 h-5" />
          </button>
        </div>

        {/* Alignment */}
        <div className="flex gap-1 border-r border-slate-300 pr-2">
          <button
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive({ textAlign: 'left' }) ? 'bg-slate-300' : ''}`}
            type="button"
          >
            <RiAlignLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive({ textAlign: 'center' }) ? 'bg-slate-300' : ''}`}
            type="button"
          >
            <RiAlignCenter className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive({ textAlign: 'right' }) ? 'bg-slate-300' : ''}`}
            type="button"
          >
            <RiAlignRight className="w-5 h-5" />
          </button>
        </div>

        {/* Other */}
        <div className="flex gap-1 border-r border-slate-300 pr-2">
          <button
            onClick={addLink}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('link') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Add Link"
          >
            <RiLinkM className="w-5 h-5" />
          </button>
          <button
            onClick={addImage}
            className="p-2 rounded hover:bg-slate-200"
            type="button"
            title="Add Image"
          >
            <RiImageAddLine className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('blockquote') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Blockquote"
          >
            <RiDoubleQuotesL className="w-5 h-5" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`p-2 rounded hover:bg-slate-200 ${editor.isActive('codeBlock') ? 'bg-slate-300' : ''}`}
            type="button"
            title="Code Block"
          >
            <HiCode className="w-5 h-5" />
          </button>
        </div>

        {/* Clear Formatting */}
        <div className="flex gap-1">
          <button
            onClick={clearFormatting}
            className="p-2 rounded hover:bg-slate-200"
            type="button"
            title="Clear Formatting"
          >
            <RiFormatClear className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Helper Text */}
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          💡 <strong>Tip:</strong> Paste ChatGPT-formatted text directly! Numbered lists (1., 2.), bullet points (•, -, *), and **bold** text will be auto-formatted. You can also select text and use toolbar buttons for additional formatting.
        </p>
      </div>
    </div>
  );
};
