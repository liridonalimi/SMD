export function orderStatusLabel(status?: string | null) {
  switch (status) {
    case "Draft":
      return "Draft";
    case "Confirmed":
      return "Konfirmuar";
    case "Fulfilled":
      return "Kthyer ne dokument";
    case "Cancelled":
      return "Anuluar";
    default:
      return status ?? "-";
  }
}
