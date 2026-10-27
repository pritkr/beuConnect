import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';

// Configure marked with KaTeX support
const marked = new Marked(
    markedKatex({
        throwOnError: false,
        displayMode: false // We use inline math mostly \( ... \)
    })
);

export function renderMarkdown(content: string) {
    // The source HTML often uses \( ... \) for inline and \[ ... \] for block.
    // marked-katex-extension supports standard $...$ and $$...$$.
    // Let's replace the LaTeX brackets with dollar signs before parsing.
    let parsedContent = content
        .replace(/\\\((.*?)\\\)/gs, '$$$1$$') // \( \) -> $ $
        .replace(/\\\[(.*?)\\\]/gs, '$$$$$1$$$$'); // \[ \] -> $$ $$

    return marked.parse(parsedContent);
}
