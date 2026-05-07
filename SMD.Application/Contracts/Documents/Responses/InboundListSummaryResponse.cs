namespace SMD.Application.Contracts.Documents.Responses;

public record InboundListSummaryResponse(
    int TotalDocuments,
    int DraftCount,
    int ConfirmedCount,
    int CancelledCount,
    int EmptyDocumentsCount,
    int AttentionCount
);
