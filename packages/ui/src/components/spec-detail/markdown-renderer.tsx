import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useMarkdownComponents } from '../shared/markdown';
import type { ChecklistToggleHandler } from '../shared/markdown/markdown-components';

interface MarkdownRendererProps {
  content: string;
  specName?: string;
  basePath?: string;
  onChecklistToggle?: ChecklistToggleHandler;
}

export function MarkdownRenderer({ content, specName = '', basePath = '', onChecklistToggle }: MarkdownRendererProps) {
  const markdownComponents = useMarkdownComponents(specName, basePath, onChecklistToggle);

  return (
    <article className="prose prose-sm sm:prose-base dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeSlug, rehypeHighlight, rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
