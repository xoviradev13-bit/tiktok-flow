import React from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function renderCommentText(
  text: string,
  mentionItems: { title: string; type: string; status?: string }[],
  isDisplayMode: boolean = false
) {
  let result: React.ReactNode[] = [text];

  mentionItems.forEach((item) => {
    const prefix = "@";
    const mentionStr = `${prefix}${item.title}`;
    result = result.flatMap((part, idx) => {
      if (typeof part === "string") {
        const pieces = part.split(mentionStr);
        const newParts: React.ReactNode[] = [];
        pieces.forEach((piece, i) => {
          newParts.push(piece);
          if (i < pieces.length - 1) {
            if (item.type === "user") {
              newParts.push(
                <span
                  key={`${item.title}-${idx}-${i}`}
                  className={cn(
                    "text-indigo-700 cursor-pointer hover:underline",
                    isDisplayMode ? "font-medium" : "bg-indigo-100 rounded-sm"
                  )}
                >
                  {mentionStr}
                </span>
              );
            } else if (item.type === "task") {
              if (isDisplayMode) {
                newParts.push(
                  <span
                    key={`${item.title}-${idx}-${i}`}
                    className="relative inline-flex items-center cursor-pointer group/mention align-bottom ml-1"
                  >
                    <div className="absolute left-[-4px] w-[14px] h-[14px] rounded-full border-[3px] border-zinc-400 group-hover/mention:border-zinc-500 bg-white z-10" />
                    <span className="text-transparent">{prefix}</span>
                    <span className="text-zinc-800 underline decoration-zinc-300 underline-offset-4 group-hover/mention:decoration-zinc-400">
                      {item.title}
                    </span>
                  </span>
                );
              } else {
                newParts.push(
                  <span
                    key={`${item.title}-${idx}-${i}`}
                    className="text-zinc-800 bg-zinc-200/60 rounded-sm"
                  >
                    {mentionStr}
                  </span>
                );
              }
            } else if (item.type === "doc") {
              if (isDisplayMode) {
                newParts.push(
                  <span
                    key={`${item.title}-${idx}-${i}`}
                    className="relative inline-flex items-center cursor-pointer group/mention align-bottom ml-1"
                  >
                    <FileText className="absolute left-[-7px] h-[15px] w-[15px] text-blue-500 fill-blue-500 bg-white z-10" />
                    <span className="text-transparent">{prefix}</span>
                    <span className="border-b border-zinc-200 group-hover/mention:border-zinc-400 pb-[1px] text-zinc-900">
                      {item.title}
                    </span>
                  </span>
                );
              } else {
                newParts.push(
                  <span
                    key={`${item.title}-${idx}-${i}`}
                    className="text-blue-700 bg-blue-100 rounded-sm"
                  >
                    {mentionStr}
                  </span>
                );
              }
            } else if (item.type === "agent") {
              newParts.push(
                <span
                  key={`${item.title}-${idx}-${i}`}
                  className={cn(
                    "text-purple-700 cursor-pointer hover:underline",
                    isDisplayMode ? "font-medium ml-1" : "bg-purple-100 rounded-sm"
                  )}
                >
                  {mentionStr}
                </span>
              );
            } else if (item.type === "skill") {
              newParts.push(
                <span
                  key={`${item.title}-${idx}-${i}`}
                  className={cn(
                    "text-amber-700 dark:text-amber-400 cursor-pointer hover:underline",
                    isDisplayMode ? "font-medium ml-1" : "bg-amber-100 dark:bg-amber-950/50 rounded-sm"
                  )}
                >
                  {mentionStr}
                </span>
              );
            } else if (item.type === "tool") {
              newParts.push(
                <span
                  key={`${item.title}-${idx}-${i}`}
                  className={cn(
                    "text-rose-700 dark:text-rose-400 cursor-pointer hover:underline",
                    isDisplayMode ? "font-medium ml-1" : "bg-rose-100 dark:bg-rose-950/50 rounded-sm"
                  )}
                >
                  {mentionStr}
                </span>
              );
            }
          }
        });
        return newParts;
      }
      return part;
    });
  });

  return result;
}
