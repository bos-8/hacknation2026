export const formFormats = [
  { label: "PDF", extensions: [".pdf"], mime: "application/pdf" },
  { label: "PNG", extensions: [".png"], mime: "image/png" },
  { label: "JPEG", extensions: [".jpeg", ".jpg"], mime: "image/jpeg" },
  { label: "DOC", extensions: [".doc"], mime: "application/msword" },
  { label: "DOCX", extensions: [".docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { label: "ODS", extensions: [".ods"], mime: "application/vnd.oasis.opendocument.spreadsheet" },
  { label: "XLSX", extensions: [".xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { label: "TXT", extensions: [".txt"], mime: "text/plain" },
  { label: "JSON", extensions: [".json"], mime: "application/json" },
];

export const formExtensions = formFormats.flatMap(format => format.extensions);
