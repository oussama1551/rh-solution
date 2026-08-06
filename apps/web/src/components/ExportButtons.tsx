import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "./Button";

export function ExportButtons({ excelUrl, pdfUrl }: { excelUrl: string; pdfUrl: string }) {
  return (
    <div className="export-buttons">
      <a className="btn btn-secondary" href={excelUrl}>
        <FileSpreadsheet size={16} /> Excel
      </a>
      <a className="btn btn-secondary" href={pdfUrl}>
        <FileText size={16} /> PDF
      </a>
      <Button variant="ghost" title="Exports disponibles selon les filtres courants">
        <Download size={16} />
      </Button>
    </div>
  );
}
