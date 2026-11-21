import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./chat-markdown.module.css";

const plugins = [remarkGfm];
const disallowedElements = ["img"];

export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return <div data-chat-markdown className={styles.content}>
    <ReactMarkdown remarkPlugins={plugins} skipHtml disallowedElements={disallowedElements} unwrapDisallowed
      components={{
        table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
      }}>
      {content}
    </ReactMarkdown>
  </div>;
});
