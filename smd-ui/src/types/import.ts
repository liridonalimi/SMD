export type ImportRowMessage = {
  rowNumber: number;
  type: "Error" | "Skipped" | string;
  message: string;
};

export type ImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowMessage[];
  messages: ImportRowMessage[];
};
