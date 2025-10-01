// my-app/src/components/TiptapEditor.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// Define the props the component will accept
interface TiptapProps {
  content: string;
  onChange: (richText: string) => void;
}

const TiptapMenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  const buttonClasses = "p-2 rounded hover:bg-gray-200";
  const activeClasses = "bg-gray-200 text-black";

  return (
    <div className="border border-b-0 rounded-t-md p-2 bg-gray-50 space-x-2">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`${buttonClasses} ${editor.isActive('bold') ? activeClasses : ''}`}>Bold</button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`${buttonClasses} ${editor.isActive('italic') ? activeClasses : ''}`}>Italic</button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={`${buttonClasses} ${editor.isActive('strike') ? activeClasses : ''}`}>Strike</button>
    </div>
  );
};

export default function TiptapEditor({ content, onChange }: TiptapProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content,

    // Add this line
    immediatelyRender: false,

    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose min-h-[150px] max-w-full p-3 border rounded-b-md focus:outline-none',
      },
    },
  });

  return (
    <div>
      <TiptapMenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}