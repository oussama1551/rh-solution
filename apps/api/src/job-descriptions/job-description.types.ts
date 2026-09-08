export type JobBuilderDocument = {
  schemaVersion: 1;
  page: {
    format: "A4";
    orientation: "portrait" | "landscape";
    visualTheme: "corporate" | "compact" | "modern" | "iso";
  };
  blocks: Array<{
    id: string;
    type: string;
    order: number;
    title: string;
    visible: boolean;
    required: boolean;
    editable: boolean;
    removable: boolean;
    pageBreakBefore: boolean;
    style: Record<string, string | number | boolean>;
    content: unknown;
  }>;
};

export function emptyBuilderDocument(theme = "corporate", orientation = "portrait"): JobBuilderDocument {
  return {
    schemaVersion: 1,
    page: {
      format: "A4",
      orientation: orientation === "landscape" ? "landscape" : "portrait",
      visualTheme: ["corporate", "compact", "modern", "iso"].includes(theme)
        ? theme as JobBuilderDocument["page"]["visualTheme"]
        : "corporate"
    },
    blocks: []
  };
}
