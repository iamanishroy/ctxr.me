import { NodeHtmlMarkdown, TranslatorConfigObject } from "node-html-markdown";

/**
 * Custom translators for better code block handling in markdown output.
 */
const codeTranslators: TranslatorConfigObject = {
  pre: {
    preserveWhitespace: false,
  },

  code: ({ node, parent, options: { codeFence, codeBlockStyle } }) => {
    const hasSiblings = node.previousSibling || node.nextSibling;
    const isCodeBlock = parent?.tagName === "PRE" && !hasSiblings;

    if (!isCodeBlock) {
      return {
        noEscape: true,
        postprocess: ({ content }: { content: string }) => {
          if (!content) return "";

          const processedContent = content.replace(/\r?\n|\r/g, " ");
          const extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? " " : "";

          let delimiterStr = "`";
          const matches = processedContent.match(/`+/gm) || [];
          for (const match of matches) {
            if (match === delimiterStr) {
              delimiterStr += "`";
            }
          }

          return (
            delimiterStr +
            extraSpace +
            processedContent +
            extraSpace +
            delimiterStr
          );
        },
      };
    }

    if (codeBlockStyle === "fenced") {
      const className = node.getAttribute("class") || "";
      const language = (className.match(/language-(\S+)/) || [null, ""])[1];

      return {
        noEscape: true,
        preserveWhitespace: false,
        postprocess: () => {
          const codeText = node.textContent || "";
          const fenceChar = codeFence.charAt(0);
          let fenceSize = 3;

          const fenceRegex = new RegExp(`^${fenceChar}{3,}`, "gm");
          let match;
          while ((match = fenceRegex.exec(codeText))) {
            if (match[0].length >= fenceSize) {
              fenceSize = match[0].length + 1;
            }
          }

          const fence = fenceChar.repeat(fenceSize);
          return `${fence + language}\n${codeText.replace(/\n$/, "")}\n${fence}`;
        },
      };
    } else {
      return {
        noEscape: true,
        preserveWhitespace: false,
        postprocess: ({ node: n }: { node: any }) => {
          const codeText = n.textContent || "";
          return codeText
            .split("\n")
            .map((line: string) => `    ${line}`)
            .join("\n");
        },
      };
    }
  },
};

/**
 * Pre-configured NodeHtmlMarkdown instance with optimal settings
 * for LLM-friendly markdown output.
 */
export const nhm = new NodeHtmlMarkdown(
  {
    codeFence: "```",
    bulletMarker: "-",
    codeBlockStyle: "fenced",
    strongDelimiter: "**",
    emDelimiter: "_",
    preferNativeParser: false,
    maxConsecutiveNewlines: 2,
  },
  {},
  codeTranslators,
);
