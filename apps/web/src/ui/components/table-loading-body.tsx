import { TableBody, TableCell, TableRow, Throbber } from "@/ui/basic";
import { tableStyles } from "./styles";

export function TableLoadingBody({ colSpan, label }: { colSpan: number; label: string }) {
  return <TableBody aria-busy="true" className={tableStyles.dataBody}><TableRow><TableCell colSpan={colSpan} className="p-0">
    <div aria-live="polite" className={tableStyles.loadingBody}><Throbber label={label} /></div>
  </TableCell></TableRow></TableBody>;
}

export function TableMessageBody({ colSpan, message, error = false }: { colSpan: number; message: string; error?: boolean }) {
  return <TableBody><TableRow><TableCell colSpan={colSpan} className="py-8 text-center">
    <p role={error ? "alert" : "status"} className={error ? "text-error" : "text-muted-foreground"}>{message}</p>
  </TableCell></TableRow></TableBody>;
}
